import { z } from 'npm:zod@4.4.3'
import { corsHeaders, json } from '../_shared/http.ts'
import { handlerError, HttpError, preflight, requireUser } from '../_shared/security.ts'

const input = z.object({
  email: z.email(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  roleId: z.uuid(),
  teamId: z.uuid().optional().nullable(),
})

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID()
  const origin = req.headers.get('origin')
  const options = preflight(req)
  if (options) return options
  if (req.method !== 'POST') return json({ error: { code: 'method_not_allowed', message: 'Methode nicht erlaubt.' } }, 405, requestId, corsHeaders(origin))
  let invitedUserId: string | null = null
  let createdAuthUser = false
  let context: Awaited<ReturnType<typeof requireUser>> | null = null
  try {
    context = await requireUser(req, 'users.manage')
    const parsed = input.safeParse(await req.json())
    if (!parsed.success) throw new HttpError(422, 'invalid_input', 'Eingaben sind ungültig.')
    const appUrl = Deno.env.get('APP_URL')
    if (!appUrl) throw new Error('app_url_missing')
    const email = parsed.data.email.trim().toLowerCase()
    const lookupInvite = async () => {
      const { data, error } = await context!.caller.rpc('admin_lookup_invite_email', { p_email: email })
      if (error) {
        if (error.message.includes('email_not_available')) throw new HttpError(409, 'user_exists', 'Für diese E-Mail besteht bereits ein Konto.')
        throw error
      }
      return Array.isArray(data) ? data[0] : data
    }
    let existing = await lookupInvite()
    if (existing?.profile_id) {
      if (existing.profile_status === 'invited') return json({ profileId: existing.profile_id, existing: true }, 200, requestId, corsHeaders(origin))
      throw new HttpError(409, 'user_exists', 'Für diese E-Mail besteht bereits ein Konto.')
    }
    const { data: invite, error: inviteError } = await context.admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${appUrl.replace(/\/$/, '')}/accept-invite`,
      data: { organization_id: context.organizationId },
    })
    if (inviteError || !invite.user) {
      const existingAccountError = Boolean(inviteError?.message.toLowerCase().match(/already|exist|registered/))
      if (existing?.reusable_unconfirmed_auth && existingAccountError) {
        // The original native invite remains valid; finish the missing profile
        // transaction and let the explicit resend action issue a fresh link.
      } else if (!existing && existingAccountError) {
        // A concurrent/previous request may have created the Auth invite but
        // timed out before the transactional profile creation.
        existing = await lookupInvite()
        if (existing?.profile_id && existing.profile_status === 'invited') return json({ profileId: existing.profile_id, existing: true }, 200, requestId, corsHeaders(origin))
        if (!existing?.reusable_unconfirmed_auth) throw new HttpError(409, 'user_exists', 'Für diese E-Mail besteht bereits ein Konto.')
      } else {
        throw inviteError ?? new Error('invite_failed')
      }
    }
    invitedUserId = invite.user?.id ?? existing?.auth_user_id ?? null
    if (!invitedUserId) throw new Error('invite_user_missing')
    createdAuthUser = !existing && Boolean(invite.user)
    const { data: profileId, error: profileError } = await context.caller.rpc('admin_create_invited_profile', {
      p_auth_user_id: invitedUserId,
      p_email: email,
      p_first_name: parsed.data.firstName,
      p_last_name: parsed.data.lastName,
      p_role_id: parsed.data.roleId,
      p_team_id: parsed.data.teamId ?? null,
    })
    if (profileError) throw profileError
    return json({ profileId }, 201, requestId, corsHeaders(origin))
  } catch (error) {
    if (createdAuthUser && invitedUserId && context) {
      try {
        await context.admin.auth.admin.deleteUser(invitedUserId)
      } catch { /* best-effort compensation; no sensitive logging */ }
    }
    return handlerError(error, requestId, origin)
  }
})
