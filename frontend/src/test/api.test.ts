import { request } from '../api'

const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

afterEach(() => vi.unstubAllGlobals())

test('sends CSRF token on writes and retries once when it has expired', async () => {
  const calls: { url: string; token?: string }[] = []
  let postCount = 0
  vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit = {}) => {
    calls.push({ url, token: (init.headers as any)?.['X-CSRF-Token'] })
    if (url === '/api/auth/csrf') return json(200, { csrf_token: `tok${calls.length}` })
    postCount++
    return postCount === 1 ? json(403, { error: { code: 'csrf_failed', message: 'expired' } }) : json(200, { ok: true })
  }))
  const r = await request('POST', '/api/things', { a: 1 })
  expect(r).toEqual({ ok: true })
  expect(postCount).toBe(2)
  expect(calls.filter((c) => c.url === '/api/auth/csrf')).toHaveLength(2)
  expect(calls[calls.length - 1].token).not.toBe(calls[1].token)
})

test('turns error payloads and network failures into ApiError messages', async () => {
  vi.stubGlobal('fetch', vi.fn(() => json(404, { error: { code: 'not_found', message: 'Document not found.' } })))
  await expect(request('GET', '/api/documents/9')).rejects.toMatchObject({ message: 'Document not found.', status: 404 })
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('failed'))))
  await expect(request('GET', '/api/x')).rejects.toMatchObject({ code: 'network' })
})
