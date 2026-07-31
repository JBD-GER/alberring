import { z } from 'npm:zod@4.4.3'
import { corsHeaders, json } from '../_shared/http.ts'
import { handlerError, HttpError, preflight, requireUser } from '../_shared/security.ts'

const input = z.object({ profileId: z.uuid() })

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
    const { data: targets, error: targetError } = await context.caller.rpc('admin_begin_invite_resend', {
      p_profile_id: parsed.data.profileId,
      p_request_id: requestId,
    })
    const target = Array.isArray(targets) ? targets[0] : targets
    if (targetError?.message.includes('invite_cooldown')) throw new HttpError(429, 'invite_cooldown', 'Die Einladung wurde gerade bereits versendet. Bitte warten Sie kurz.')
    if (targetError || !target || target.status !== 'invited') throw new HttpError(409, 'invite_not_available', 'Für dieses Konto ist keine offene Einladung vorhanden.')
    const appUrl = Deno.env.get('APP_URL')
    if (!appUrl) throw new Error('app_url_missing')
    const redirectTo = `${appUrl.replace(/\/$/, '')}/accept-invite`
    const { data: authTarget, error: authTargetError } = await context.admin.auth.admin.getUserById(target.auth_user_id)
    if (authTargetError || !authTarget.user) throw authTargetError ?? new Error('auth_user_not_found')
    if (authTarget.user.email_confirmed_at) {
      // A confirmed Auth user can remain `invited` only when the profile
      // activation step was interrupted. Recovery establishes a valid session;
      // AcceptInvite then sets the password and calls activate_my_profile().
      const { error } = await context.admin.auth.resetPasswordForEmail(target.email, { redirectTo })
      if (error) throw error
    } else {
      // Supabase Auth's invite endpoint re-sends for an existing unconfirmed
      // invite user. It only returns EmailExists after confirmation.
      const { error } = await context.admin.auth.admin.inviteUserByEmail(target.email, {
        redirectTo, data: { organization_id: context.organizationId },
      })
      if (error) throw error
    }
    const { error: auditError } = await context.admin.from('audit_logs').insert({ organization_id: context.organizationId, actor_id: context.profileId, action: 'user.invite_resent', entity_type: 'profile', entity_id: parsed.data.profileId, request_id: requestId, metadata: {} })
    if (auditError) {
      console.error(JSON.stringify({ requestId, event: 'invite_sent_audit_failed', errorCode: auditError.code ?? 'audit_failed' }))
      return json({ sent: true, auditRecorded: false, warning: { code: 'audit_partial_failure', message: 'Die Einladung wurde versendet, der Abschluss konnte aber nicht protokolliert werden.' } }, 207, requestId, corsHeaders(origin))
    }
    return json({ sent: true }, 200, requestId, corsHeaders(origin))
  } catch (error) { return handlerError(error, requestId, origin) }
})
