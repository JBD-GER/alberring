import { z } from 'npm:zod@4.4.3'
import { corsHeaders, json } from '../_shared/http.ts'
import { handlerError, HttpError, preflight, requireAutomation } from '../_shared/security.ts'

const input = z.object({ limit: z.number().int().min(1).max(500).default(100) })

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID(), origin = req.headers.get('origin')
  const options = preflight(req); if (options) return options
  if (req.method !== 'POST') return json({ error: { code: 'method_not_allowed', message: 'Methode nicht erlaubt.' } }, 405, requestId, corsHeaders(origin))
  try {
    const admin = requireAutomation(req)
    const parsed = input.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) throw new HttpError(422, 'invalid_input', 'Batch-Konfiguration ist ungültig.')
    const now = new Date().toISOString()
    const { data: deliveries, error } = await admin.from('notification_deliveries').select('id,channel,notification_id,notifications(type,profile_id)').eq('status', 'pending').or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`).limit(parsed.data.limit)
    if (error) throw error
    let delivered = 0, skipped = 0
    for (const delivery of deliveries ?? []) {
      if (delivery.channel === 'in_app') {
        const { error: updateError } = await admin.from('notification_deliveries').update({ status: 'delivered', sent_at: new Date().toISOString(), attempt_count: 1 }).eq('id', delivery.id).eq('status', 'pending')
        if (updateError) throw updateError
        delivered += 1
      } else {
        // Provider integration is deliberately explicit. No employee content is
        // sent to an unconfigured third party.
        const { error: updateError } = await admin.from('notification_deliveries').update({ status: 'skipped', last_error_code: 'provider_not_configured', attempt_count: 1 }).eq('id', delivery.id).eq('status', 'pending')
        if (updateError) throw updateError
        skipped += 1
      }
    }
    return json({ delivered, skipped }, 200, requestId, corsHeaders(origin))
  } catch (error) { return handlerError(error, requestId, origin) }
})
