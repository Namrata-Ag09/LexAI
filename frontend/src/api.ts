export type Version = {
  id: number; document_id: number; version_number: number; filename: string; file_type: string
  size_bytes: number; status: string; progress: number; error: string | null; page_count: number | null
  ocr_used: boolean; warnings: string[]; chunk_count: number; created_at: string; processed_at: string | null
}
export type Doc = {
  id: number; title: string; created_at: string; updated_at: string
  latest_version: Version | null; version_count: number; versions?: Version[]
}
export type Passage = {
  chunk_id: number; document_id: number; document_title: string; version_id: number; version_number: number
  page: number | null; excerpt: string; score?: number; quote?: string; number?: number
}
export type Message = {
  id: number; role: 'user' | 'assistant'; content: string; citations: Passage[]
  sufficient: boolean | null; sources: Passage[]; created_at: string
}
export type Conversation = { id: number; document_id: number | null; title: string; updated_at: string; messages?: Message[] }
export type User = { id: number; email: string; name: string; created_at: string }
export type Cite = Passage
export type Analysis = { id: number; version_id: number; kind: string; model: string | null; created_at: string; result: any }
export type Health = {
  status: string
  checks: Record<string, { ok: boolean; detail?: string; configured?: boolean; optional?: boolean; chat_model?: string; embed_model?: string; chunks_indexed?: number }>
  limits: { max_upload_mb: number; registration_open: boolean }
}

export class ApiError extends Error {
  status: number
  code: string
  constructor(message: string, status: number, code: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

let csrf: string | null = null
export const onUnauthenticated = { handler: () => {} }

async function refreshCsrf() {
  const r = await fetch('/api/auth/csrf', { credentials: 'same-origin' })
  csrf = (await r.json()).csrf_token
}

async function parse(res: Response) {
  let data: any = null
  try { data = await res.json() } catch { /* non-json */ }
  if (data?.csrf_token) csrf = data.csrf_token
  if (!res.ok) {
    const e = data?.error
    throw new ApiError(e?.message || `Request failed (${res.status}).`, res.status, e?.code || 'error')
  }
  return data
}

export async function request<T = any>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  const headers: Record<string, string> = {}
  if (method !== 'GET') {
    if (!csrf) await refreshCsrf()
    headers['X-CSRF-Token'] = csrf as string
  }
  let init: RequestInit = { method, headers, credentials: 'same-origin' }
  if (body instanceof FormData) init = { ...init, body }
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; init = { ...init, body: JSON.stringify(body) } }
  let res: Response
  try { res = await fetch(path, init) } catch { throw new ApiError('Cannot reach the LexAI server. Is it running?', 0, 'network') }
  try {
    return await parse(res)
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.code === 'csrf_failed' && retry) { await refreshCsrf(); return request(method, path, body, false) }
      if (e.status === 401 && !path.startsWith('/api/auth/')) onUnauthenticated.handler()
    }
    throw e
  }
}

/** Upload with progress (fetch cannot report upload progress). */
export function uploadFile(path: string, file: File, fields: Record<string, string> = {}, onProgress?: (pct: number) => void): Promise<any> {
  return new Promise(async (resolve, reject) => {
    if (!csrf) { try { await refreshCsrf() } catch { return reject(new ApiError('Cannot reach the LexAI server.', 0, 'network')) } }
    const fd = new FormData()
    fd.append('file', file)
    Object.entries(fields).forEach(([k, v]) => fd.append(k, v))
    const xhr = new XMLHttpRequest()
    xhr.open('POST', path)
    xhr.setRequestHeader('X-CSRF-Token', csrf as string)
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)) }
    xhr.onerror = () => reject(new ApiError('Upload failed: cannot reach the server.', 0, 'network'))
    xhr.onload = () => {
      let data: any = null
      try { data = JSON.parse(xhr.responseText) } catch { /* ignore */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data)
      else reject(new ApiError(data?.error?.message || `Upload failed (${xhr.status}).`, xhr.status, data?.error?.code || 'error'))
    }
    xhr.send(fd)
  })
}

export const api = {
  health: () => request<Health>('GET', '/api/health'),
  me: () => request<{ user: User }>('GET', '/api/auth/me'),
  login: (email: string, password: string) => request<{ user: User }>('POST', '/api/auth/login', { email, password }),
  register: (name: string, email: string, password: string) => request<{ user: User }>('POST', '/api/auth/register', { name, email, password }),
  logout: () => request('POST', '/api/auth/logout'),
  updateProfile: (p: { name?: string; email?: string }) => request<{ user: User }>('PATCH', '/api/auth/me', p),
  changePassword: (current_password: string, new_password: string) => request('POST', '/api/auth/change-password', { current_password, new_password }),
  documents: (q = '', page = 1, per_page = 50) => request<{ items: Doc[]; total: number }>('GET', `/api/documents?q=${encodeURIComponent(q)}&page=${page}&per_page=${per_page}`),
  document: (id: number) => request<{ document: Doc }>('GET', `/api/documents/${id}`),
  renameDocument: (id: number, title: string) => request<{ document: Doc }>('PATCH', `/api/documents/${id}`, { title }),
  deleteDocument: (id: number) => request('DELETE', `/api/documents/${id}`),
  deleteVersion: (id: number, vid: number) => request<{ document: Doc }>('DELETE', `/api/documents/${id}/versions/${vid}`),
  reprocess: (id: number, vid: number) => request('POST', `/api/documents/${id}/versions/${vid}/reprocess`),
  version: (id: number, vid: number) => request<{ version: Version }>('GET', `/api/documents/${id}/versions/${vid}`),
  text: (id: number, vid: number) => request<{ paged: boolean; pages: { page: number; text: string }[]; char_count: number }>('GET', `/api/documents/${id}/versions/${vid}/text`),
  chunks: (id: number, vid: number, page = 1, pdfPage?: number) =>
    request<{ items: { id: number; index: number; page: number | null; char_count: number; text: string }[]; total: number; per_page: number; chunk_size: number; chunk_overlap: number }>(
      'GET', `/api/documents/${id}/versions/${vid}/chunks?page=${page}&per_page=15${pdfPage ? `&pdf_page=${pdfPage}` : ''}`),
  analyses: (id: number, vid: number, kind: string) => request<{ items: Analysis[] }>('GET', `/api/documents/${id}/versions/${vid}/analyses?kind=${kind}`),
  analyze: (id: number, vid: number, kind: string) => request<{ analysis: Analysis }>('POST', `/api/documents/${id}/versions/${vid}/analyses/${kind}`),
  search: (q: string, opts: { documentId?: number; scope?: string; page?: number } = {}) =>
    request<{ query: string; terms: string[]; total: number; page: number; per_page: number; results: Passage[] }>(
      'GET', `/api/search?q=${encodeURIComponent(q)}&page=${opts.page || 1}&per_page=10&scope=${opts.scope || 'current'}${opts.documentId ? `&document_id=${opts.documentId}` : ''}`),
  conversations: (documentId?: number) => request<{ items: Conversation[] }>('GET', `/api/conversations${documentId ? `?document_id=${documentId}` : ''}`),
  newConversation: (documentId?: number) => request<{ conversation: Conversation }>('POST', '/api/conversations', { document_id: documentId ?? null }),
  conversation: (id: number) => request<{ conversation: Conversation }>('GET', `/api/conversations/${id}`),
  deleteConversation: (id: number) => request('DELETE', `/api/conversations/${id}`),
  ask: (id: number, content: string) => request<{ user_message: Message; assistant_message: Message; disclaimer: string }>('POST', `/api/conversations/${id}/messages`, { content }),
}
