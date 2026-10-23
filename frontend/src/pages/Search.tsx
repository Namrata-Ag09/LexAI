import { FormEvent, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, Doc, Passage } from '../api'
import { Citation, Empty, ErrorBox, Highlight, Skeleton } from '../components/ui'

export default function Search() {
  const [sp, setSp] = useSearchParams()
  const q = sp.get('q') || ''
  const docId = Number(sp.get('doc')) || undefined
  const scope = sp.get('scope') === 'all' ? 'all' : 'current'
  const page = Number(sp.get('page')) || 1
  const [input, setInput] = useState(q)
  const [docs, setDocs] = useState<Doc[]>([])
  const [res, setRes] = useState<{ results: Passage[]; total: number; terms: string[]; per_page: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { api.documents('', 1, 100).then((r) => setDocs(r.items)).catch(() => {}) }, [])
  const run = () => {
    if (q.trim().length < 2) { setRes(null); return }
    setLoading(true); setError(null)
    api.search(q, { documentId: docId, scope, page }).then(setRes).catch((e) => setError(e.message)).finally(() => setLoading(false))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(run, [q, docId, scope, page])

  const set = (k: string, v: string | null) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); if (k !== 'page') n.delete('page'); setSp(n) }
  function submit(e: FormEvent) { e.preventDefault(); set('q', input.trim() || null) }
  const pages = res ? Math.max(1, Math.ceil(res.total / res.per_page)) : 1

  return (
    <div className="page">
      <header className="page-head"><div><h1>Semantic search</h1><p className="muted">Ask in plain English — results match meaning, not just keywords.</p></div></header>
      <form className="search-form" onSubmit={submit} role="search">
        <label className="sr-only" htmlFor="sq">Search query</label>
        <input id="sq" type="search" value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. notice period to end the contract" />
        <button className="btn primary">Search</button>
      </form>
      <div className="toolbar">
        <label htmlFor="sd">Document</label>
        <select id="sd" value={docId ?? ''} onChange={(e) => set('doc', e.target.value || null)}>
          <option value="">All documents</option>{docs.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
        </select>
        <label htmlFor="ss">Versions</label>
        <select id="ss" value={scope} onChange={(e) => set('scope', e.target.value === 'all' ? 'all' : null)}>
          <option value="current">Latest only</option><option value="all">All versions</option>
        </select>
      </div>
      {error && <ErrorBox message={error} onRetry={run} />}
      {loading ? <Skeleton lines={5} height={40} /> : !q ? (
        <Empty title="Search your documents">Try “who pays for damages?” or “when can the agreement be ended?”.</Empty>
      ) : res && res.results.length === 0 ? (
        <Empty title="No matching passages">Nothing relevant was found. Check that your documents are indexed (status “Ready”).</Empty>
      ) : res && (
        <div>
          <p className="muted small">{res.total} passage{res.total === 1 ? '' : 's'} found</p>
          {res.results.map((r) => (
            <div className="card result" key={r.chunk_id}>
              <span className="score" title="Similarity">{Math.round((r.score || 0) * 100)}%</span>
              <Citation c={r} terms={res.terms} />
              <p className="snippet"><Highlight text={r.excerpt.slice(0, 280) + (r.excerpt.length > 280 ? '…' : '')} terms={res.terms} /></p>
            </div>
          ))}
          <div className="pager"><button className="btn small" disabled={page <= 1} onClick={() => set('page', String(page - 1))}>Previous</button><span>Page {page} of {pages}</span><button className="btn small" disabled={page >= pages} onClick={() => set('page', String(page + 1))}>Next</button></div>
        </div>
      )}
    </div>
  )
}
