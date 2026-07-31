export const cors = (origin: string | null) => {
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  return origin && allowed.includes(origin) ? origin : (allowed[0] ?? '')
}

export const corsHeaders = (origin: string | null) => ({
  'access-control-allow-origin': cors(origin),
  'access-control-allow-headers': 'apikey,authorization,content-type,x-client-info,x-automation-secret,x-request-id',
  'access-control-allow-methods': 'POST,OPTIONS',
  'access-control-max-age': '86400',
  vary: 'Origin',
})

export const json = (
  body: unknown,
  status = 200,
  requestId: string = crypto.randomUUID(),
  headers: Record<string, string> = {},
) => new Response(JSON.stringify({ ...((typeof body === 'object' && body) || {}), requestId }), {
  status,
  headers: { 'content-type': 'application/json', 'x-request-id': requestId, ...headers },
})
