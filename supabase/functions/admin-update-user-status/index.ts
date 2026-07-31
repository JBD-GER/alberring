import { z } from 'npm:zod@4.4.3'
import { corsHeaders, json } from '../_shared/http.ts'
import { handlerError, HttpError, preflight, requireUser } from '../_shared/security.ts'

const input = z.object({ profileId: z.uuid(), status: z.enum(['invited', 'active', 'suspended', 'archived']) })

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID()
  const origin = req.headers.get('origin')
  const options = preflight(req)
  if (options) return options
  if (req.method !== 'POST') return json({ error: { code: 'method_not_allowed', message: 'Methode nicht erlaubt.' } }, 405, requestId, corsHeaders(origin))
  try {
    const context = await requireUser(req, 'users.manage')
    const parsed = input.safeParse(await req.json())
    if (!parsed.success) throw new HttpError(422, 'invalid_input', 'Eingaben sind ungültig.')
    const { data: targets, error: targetError } = await context.caller.rpc('admin_get_invite_target', { p_profile_id: parsed.data.profileId })
    const target = Array.isArray(targets) ? targets[0] : targets
    if (targetError || !target) throw new HttpError(404, 'profile_not_found', 'Benutzer wurde nicht gefunden.')
    const shouldBan = parsed.data.status === 'suspended' || parsed.data.status === 'archived'
    const { error: authError } = await context.admin.auth.admin.updateUserById(target.auth_user_id, { ban_duration: shouldBan ? '876000h' : 'none' })
    if (authError) throw authError
    const { error: statusError } = await context.caller.rpc('admin_set_profile_status', { p_profile_id: parsed.data.profileId, p_status: parsed.data.status })
    if (statusError) {
      await context.admin.auth.admin.updateUserById(target.auth_user_id, { ban_duration: target.status === 'suspended' || target.status === 'archived' ? '876000h' : 'none' })
      throw statusError
    }
    return json({ profileId: parsed.data.profileId, status: parsed.data.status }, 200, requestId, corsHeaders(origin))
  } catch (error) { return handlerError(error, requestId, origin) }
})
