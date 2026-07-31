import { corsHeaders, json } from '../_shared/http.ts'
import { finishJob, startJob } from '../_shared/jobs.ts'
import { handlerError, preflight, requireAutomation } from '../_shared/security.ts'

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID(), origin = req.headers.get('origin')
  const options = preflight(req); if (options) return options
  if (req.method !== 'POST') return json({ error: { code: 'method_not_allowed', message: 'Methode nicht erlaubt.' } }, 405, requestId, corsHeaders(origin))
  let jobId: string | null = null
  try {
    const admin = requireAutomation(req), now = new Date().toISOString()
    jobId = await startJob(admin, 'scheduled_news', now.slice(0, 16))
    if (!jobId) return json({ processed: 0, duplicate: true }, 200, requestId, corsHeaders(origin))
    // Publishing, notifications, audit, and clearing scheduled_for happen in
    // one database transaction. Completed rows therefore never re-enter this
    // queue and old rows cannot starve newly due posts.
    const { data: posts, error } = await admin.from('news_posts').select('id').eq('status', 'scheduled').not('scheduled_for', 'is', null).lte('scheduled_for', now).order('scheduled_for', { ascending: true }).limit(500)
    if (error) throw error
    let processed = 0
    for (const post of posts ?? []) {
      const { data: notificationCount, error: publishError } = await admin.rpc('publish_scheduled_news', { p_news_id: post.id })
      if (publishError) throw publishError
      processed += Number(notificationCount ?? 0)
    }
    await finishJob(admin, jobId, processed)
    return json({ processed, posts: posts?.length ?? 0 }, 200, requestId, corsHeaders(origin))
  } catch (error) {
    try { if (jobId) await finishJob(requireAutomation(req), jobId, 0, 'job_failed') } catch { /* best effort */ }
    return handlerError(error, requestId, origin)
  }
})
