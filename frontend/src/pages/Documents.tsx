import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, Doc, Health } from '../api'
import { ACTIVE, Empty, ErrorBox, fmtBytes, fmtDate, ProgressBar, Skeleton, StatusBadge } from '../components/ui'
import { Uploader } from '../components/Uploader'
import { useToast } from '../toast'

export function useDocuments(q = '') {
  const [docs, setDocs] = useState<Doc[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<number>()
  const load = useCallback(async () => {
    try { const r = await api.documents(q); setDocs(r.items); setError(null) } catch (e) { setError((e as Error).message) }
  }, [q])
  useEffect(() => { setDocs(null); load() }, [load])
  useEffect(() => {
    window.clearTimeout(timer.current)
    if (docs?.some((d) => d.latest_version && ACTIVE.includes(d.latest_version.status))) timer.current = window.setTimeout(load, 1500)
    return () => window.clearTimeout(timer.current)
  }, [docs, load])
  return { docs, error, reload: load }
}

export default function Documents() {
  const [q, setQ] = useState('')
  const { docs, error, reload } = useDocuments(q)
  const [health, setHealth] = useState<Health | null>(null)
  const toast = useToast()
  const nav = useNavigate()
  useEffect(() => { api.health().then(setHealth).catch(() => {}) }, [])

  return (
    <div className="page">
      <header className="page-head"><div><h1>Documents</h1><p className="muted">Upload contracts and track processing.</p></div></header>
      <Uploader maxMb={health?.limits.max_upload_mb} onUploaded={(d) => { toast('success', `“${d.title}” uploaded — processing started.`); reload(); nav(`/documents/${d.id}`) }} />
      <div className="toolbar">
        <label className="sr-only" htmlFor="doc-q">Filter documents</label>
        <input id="doc-q" type="search" placeholder="Filter by title…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {docs === null && !error ? <Skeleton lines={5} height={44} /> : docs && docs.length === 0 ? (
        <Empty title={q ? 'No documents match' : 'No documents yet'}>{q ? 'Try a different title.' : 'Drop a PDF or DOCX above to get started.'}</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Title</th><th>Status</th><th>Version</th><th>Size</th><th>Updated</th></tr></thead>
            <tbody>
              {docs?.map((d) => (
                <tr key={d.id}>
                  <td><Link to={`/documents/${d.id}`} className="doc-link">{d.title}</Link></td>
                  <td>{d.latest_version && (<>
                    <StatusBadge v={d.latest_version} />
                    {ACTIVE.includes(d.latest_version.status) && <ProgressBar value={d.latest_version.progress} label={`Processing ${d.title}`} />}
                  </>)}</td>
                  <td>v{d.latest_version?.version_number} {d.version_count > 1 && <span className="muted">({d.version_count} total)</span>}</td>
                  <td>{d.latest_version && fmtBytes(d.latest_version.size_bytes)}</td>
                  <td>{fmtDate(d.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
