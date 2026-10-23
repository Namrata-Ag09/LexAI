import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, Doc, Version } from '../api'
import { AnalysisPanel } from '../components/Analysis'
import { ChatPanel } from '../components/Chat'
import { ACTIVE, Empty, ErrorBox, fmtBytes, fmtDate, ProgressBar, Skeleton, StatusBadge } from '../components/ui'
import { Uploader } from '../components/Uploader'
import { useToast } from '../toast'

const TABS = [['text', 'Text'], ['chunks', 'Chunks'], ['summary', 'Summary'], ['clauses', 'Clauses'], ['risks', 'Risks'], ['chat', 'Ask AI'], ['versions', 'Versions']] as const

export default function Workspace() {
  const id = Number(useParams().id)
  const [sp, setSp] = useSearchParams()
  const nav = useNavigate()
  const toast = useToast()
  const [doc, setDoc] = useState<Doc | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<number>()
  const tab = sp.get('tab') || 'text'
  const vParam = Number(sp.get('v')) || null

  const load = useCallback(async () => {
    try { setDoc((await api.document(id)).document); setError(null) } catch (e) { setError((e as Error).message) }
  }, [id])
  useEffect(() => { setDoc(null); load() }, [load])

  const version: Version | undefined = doc?.versions?.find((v) => v.id === vParam) || doc?.versions?.[0]
  useEffect(() => {
    window.clearTimeout(timer.current)
    if (version && ACTIVE.includes(version.status)) timer.current = window.setTimeout(load, 1200)
    return () => window.clearTimeout(timer.current)
  }, [doc, version, load])

  const setParam = (k: string, v: string | null) => { const n = new URLSearchParams(sp); v === null ? n.delete(k) : n.set(k, v); setSp(n, { replace: true }) }

  async function rename() {
    const t = window.prompt('Rename document', doc?.title)
    if (t && t.trim() && doc) { try { setDoc((await api.renameDocument(doc.id, t.trim())).document); toast('success', 'Renamed.') } catch (e) { toast('error', (e as Error).message) } }
  }
  async function del() {
    if (!doc || !window.confirm(`Delete “${doc.title}” and all its versions? This cannot be undone.`)) return
    try { await api.deleteDocument(doc.id); toast('success', 'Document deleted.'); nav('/documents') } catch (e) { toast('error', (e as Error).message) }
  }
  async function reprocess() {
    if (!doc || !version) return
    try { await api.reprocess(doc.id, version.id); toast('success', 'Re-processing started.'); load() } catch (e) { toast('error', (e as Error).message) }
  }

  if (error && !doc) return <div className="page"><ErrorBox message={error} onRetry={load} /><Link to="/documents" className="link">← Back to documents</Link></div>
  if (!doc || !version) return <div className="page"><Skeleton lines={6} height={24} /></div>
  const textReady = ['ready', 'extracted'].includes(version.status)

  return (
    <div className="page">
      <Link to="/documents" className="link back">← Documents</Link>
      <header className="page-head">
        <div>
          <h1>{doc.title}</h1>
          <p className="muted">{version.filename} · {fmtBytes(version.size_bytes)}{version.page_count ? ` · ${version.page_count} pages` : ''}{version.ocr_used ? ' · OCR used' : ''}</p>
        </div>
        <div className="actions">
          {doc.versions && doc.versions.length > 1 && (
            <><label className="sr-only" htmlFor="ver">Version</label>
              <select id="ver" value={version.id} onChange={(e) => setParam('v', e.target.value)}>
                {doc.versions.map((v) => <option key={v.id} value={v.id}>Version {v.version_number}{v.id === doc.versions![0].id ? ' (latest)' : ''}</option>)}
              </select></>
          )}
          <button className="btn small" onClick={rename}>Rename</button>
          <button className="btn small danger" onClick={del}>Delete</button>
        </div>
      </header>
      <div className="status-row"><StatusBadge v={version} />{ACTIVE.includes(version.status) && <ProgressBar value={version.progress} label="Processing progress" />}</div>
      {version.error && (
        <div className={`notice ${version.status === 'failed' ? 'danger' : ''}`} role="alert">{version.error} {!ACTIVE.includes(version.status) && <button className="btn small" onClick={reprocess}>Re-process</button>}</div>
      )}
      {version.warnings.map((w, i) => <div className="notice subtle" key={i}>{w}</div>)}
      <nav className="tabs" role="tablist">
        {TABS.map(([k, label]) => (<button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setParam('tab', k)}>{label}</button>))}
      </nav>
      <section className="tab-panel" role="tabpanel">
        {tab === 'text' && <TextTab doc={doc} version={version} ready={textReady} focusPage={Number(sp.get('page')) || null} />}
        {tab === 'chunks' && <ChunksTab doc={doc} version={version} ready={textReady} />}
        {tab === 'summary' && <AnalysisPanel key={version.id} docId={doc.id} versionId={version.id} kind="summary" canRun={textReady} />}
        {tab === 'clauses' && <AnalysisPanel key={version.id} docId={doc.id} versionId={version.id} kind="clauses" canRun={textReady} />}
        {tab === 'risks' && <AnalysisPanel key={version.id} docId={doc.id} versionId={version.id} kind="risks" canRun={textReady} />}
        {tab === 'chat' && <ChatPanel documentId={doc.id} />}
        {tab === 'versions' && <VersionsTab doc={doc} onChange={(d) => { setDoc(d); setParam('v', null) }} reload={load} />}
      </section>
    </div>
  )
}

function TextTab({ doc, version, ready, focusPage }: { doc: Doc; version: Version; ready: boolean; focusPage: number | null }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.text>> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    if (!ready) return
    setData(null)
    try { setData(await api.text(doc.id, version.id)); setError(null) } catch (e) { setError((e as Error).message) }
  }, [doc.id, version.id, ready])
  useEffect(() => { load() }, [load])
  useEffect(() => { if (data && focusPage) document.getElementById(`page-${focusPage}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, [data, focusPage])
  if (!ready) return <Empty title="Text not available yet">{version.status === 'failed' ? 'Extraction failed for this version.' : 'Processing is still running.'}</Empty>
  if (error) return <ErrorBox message={error} onRetry={load} />
  if (!data) return <Skeleton lines={8} />
  return (
    <div>
      <p className="muted small">{data.char_count.toLocaleString()} characters extracted and cleaned.</p>
      {data.pages.map((p) => (
        <article key={p.page} id={`page-${p.page}`} className={`page-card ${focusPage === p.page ? 'focus' : ''}`}>
          {data.paged && <h4>Page {p.page}</h4>}
          <pre>{p.text}</pre>
        </article>
      ))}
    </div>
  )
}

function ChunksTab({ doc, version, ready }: { doc: Doc; version: Version; ready: boolean }) {
  const [page, setPage] = useState(1)
  const [pdfPage, setPdfPage] = useState<number | undefined>()
  const [data, setData] = useState<Awaited<ReturnType<typeof api.chunks>> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    if (!ready) return
    setData(null)
    try { setData(await api.chunks(doc.id, version.id, page, pdfPage)); setError(null) } catch (e) { setError((e as Error).message) }
  }, [doc.id, version.id, page, pdfPage, ready])
  useEffect(() => { load() }, [load])
  if (!ready) return <Empty title="Chunks not available yet">Chunks appear once text extraction finishes.</Empty>
  if (error) return <ErrorBox message={error} onRetry={load} />
  const pages = data ? Math.max(1, Math.ceil(data.total / data.per_page)) : 1
  return (
    <div>
      <div className="toolbar">
        {version.page_count && (<><label htmlFor="pf">PDF page</label>
          <select id="pf" value={pdfPage ?? ''} onChange={(e) => { setPdfPage(e.target.value ? Number(e.target.value) : undefined); setPage(1) }}>
            <option value="">All pages</option>
            {Array.from({ length: version.page_count }, (_, i) => <option key={i} value={i + 1}>Page {i + 1}</option>)}
          </select></>)}
        {data && <span className="muted small">{data.total} chunks · up to {data.chunk_size} chars, {data.chunk_overlap} overlap</span>}
      </div>
      {!data ? <Skeleton lines={6} /> : data.items.length === 0 ? <Empty title="No chunks" /> : data.items.map((c) => (
        <div className="card chunk" key={c.id}>
          <div className="card-head"><strong>Chunk #{c.index + 1}</strong><span className="muted small">{c.page ? `Page ${c.page}` : 'Body'} · {c.char_count} chars</span></div>
          <pre>{c.text}</pre>
        </div>
      ))}
      <div className="pager"><button className="btn small" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {pages}</span><button className="btn small" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></div>
    </div>
  )
}

function VersionsTab({ doc, onChange, reload }: { doc: Doc; onChange: (d: Doc) => void; reload: () => void }) {
  const toast = useToast()
  async function del(v: Version) {
    if (!window.confirm(`Delete version ${v.version_number}? Its text, index and analyses will be removed.`)) return
    try { onChange((await api.deleteVersion(doc.id, v.id)).document); toast('success', 'Version deleted.') } catch (e) { toast('error', (e as Error).message) }
  }
  return (
    <div>
      <h3>Upload a new version</h3>
      <Uploader documentId={doc.id} label="Drop the updated file here" onUploaded={(d) => { toast('success', 'New version uploaded.'); onChange(d); reload() }} />
      <h3>History</h3>
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Version</th><th>File</th><th>Status</th><th>Uploaded</th><th /></tr></thead>
        <tbody>{doc.versions?.map((v) => (
          <tr key={v.id}><td>v{v.version_number}</td><td>{v.filename}</td><td><StatusBadge v={v} /></td><td>{fmtDate(v.created_at)}</td>
            <td><button className="btn small danger" disabled={(doc.versions?.length || 0) < 2} onClick={() => del(v)}>Delete</button></td></tr>
        ))}</tbody></table></div>
    </div>
  )
}
