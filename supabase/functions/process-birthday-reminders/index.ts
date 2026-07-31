import { corsHeaders, json } from '../_shared/http.ts'
import { finishJob, insertNotifications, permissionRecipients, startJob } from '../_shared/jobs.ts'
import { handlerError, localDateParts, preflight, requireAutomation } from '../_shared/security.ts'

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID(), origin = req.headers.get('origin')
  const options = preflight(req); if (options) return options
  if (req.method !== 'POST') return json({ error: { code: 'method_not_allowed', message: 'Methode nicht erlaubt.' } }, 405, requestId, corsHeaders(origin))
  let jobId: string | null = null
  try {
    const admin = requireAutomation(req)
    const today = localDateParts()
    jobId = await startJob(admin, 'birthday_reminders', today.iso)
    if (!jobId) return json({ processed: 0, duplicate: true }, 200, requestId, corsHeaders(origin))
    const { data: organizations, error: organizationError } = await admin.from('organizations').select('id,organization_settings(birthday_reminder_days)').eq('active', true)
    if (organizationError) throw organizationError
    let processed = 0
    for (const organization of organizations ?? []) {
      const organizationSettings = Array.isArray(organization.organization_settings)
        ? organization.organization_settings[0]
        : organization.organization_settings
      const days: number[] = organizationSettings?.birthday_reminder_days ?? [7, 0]
      const { data: employees, error: employeeError } = await admin.from('employee_profiles').select('profile_id,birth_date,first_name,profiles!inner(status)').eq('organization_id', organization.id).eq('employment_status', 'active').eq('profiles.status', 'active').not('birth_date', 'is', null).or(`start_date.is.null,start_date.lte.${today.iso}`).or(`end_date.is.null,end_date.gte.${today.iso}`)
      if (employeeError) throw employeeError
      const recipients = await permissionRecipients(admin, organization.id, 'birthdays.view_admin_notifications')
      const notifications: Record<string, unknown>[] = []
      for (const employee of employees ?? []) {
        const [, month, day] = String(employee.birth_date).split('-').map(Number)
        const todayUtc = Date.UTC(today.year, today.month - 1, today.day)
        let birthdayUtc = Date.UTC(today.year, month - 1, day)
        if (birthdayUtc < todayUtc) birthdayUtc = Date.UTC(today.year + 1, month - 1, day)
        const distance = Math.round((birthdayUtc - todayUtc) / 86400000)
        if (!days.includes(distance)) continue
        for (const profileId of recipients) notifications.push({
          organization_id: organization.id, profile_id: profileId, type: 'birthday',
          title: distance === 0 ? 'Geburtstag heute' : 'Bevorstehender Geburtstag',
          body: distance === 0 ? `${employee.first_name} hat heute Geburtstag.` : `${employee.first_name} hat in ${distance} Tagen Geburtstag.`,
          target_path: '/app/admin/users', deduplication_key: `birthday:${employee.profile_id}:${today.iso}:${distance}`,
        })
      }
      processed += await insertNotifications(admin, notifications)
    }
    await finishJob(admin, jobId, processed)
    return json({ processed }, 200, requestId, corsHeaders(origin))
  } catch (error) {
    try { if (jobId) await finishJob(requireAutomation(req), jobId, 0, 'job_failed') } catch { /* best effort */ }
    return handlerError(error, requestId, origin)
  }
})
