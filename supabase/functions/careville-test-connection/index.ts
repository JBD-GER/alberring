import { corsHeaders, json } from '../_shared/http.ts'
import { handlerError, preflight, requireUser } from '../_shared/security.ts'

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID()
  const origin = req.headers.get('origin')
  const options = preflight(req)
  if (options) return options
  if (req.method !== 'POST') return json({ error: { code: 'method_not_allowed', message: 'Methode nicht erlaubt.' } }, 405, requestId, corsHeaders(origin))
  try {
    const context = await requireUser(req, 'integrations.manage')
    const { data: connection } = await context.admin.from('integration_connections').select('id,status').eq('organization_id', context.organizationId).eq('provider', 'careville').maybeSingle()
    if (connection) await context.admin.from('integration_sync_runs').insert({
      organization_id: context.organizationId,
      connection_id: connection.id,
      direction: 'test',
      resource: 'connection',
      status: 'not_configured',
      finished_at: new Date().toISOString(),
      created_by: context.profileId,
      metadata: {},
    })
    return json({ error: { code: 'not_configured', message: 'Careville ist nicht konfiguriert. Für die Anbindung werden offizielle API-Dokumentation und Zugangsdaten benötigt.' } }, 501, requestId, corsHeaders(origin))
  } catch (error) { return handlerError(error, requestId, origin) }
})
