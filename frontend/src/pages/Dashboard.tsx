import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, Health } from '../api'
import { useAuth } from '../auth'
import { Empty, ErrorBox, fmtDate, Skeleton, StatusBadge } from '../components/ui'
import { useDocuments } from './Documents'

export default function Dashboard() {
  const { user } = useAuth()
  const { docs, error, reload } = useDocuments('')
  const [health, setHealth] = useState<Health | null>(null)
  useEffect(() => { api.health().then(setHealth).catch(() => {}) }, [])
  const ready = docs?.filter((d) => d.latest_version?.status === 'ready').length ?? 0
  const chunks = docs?.reduce((n, d) => n + (d.latest_version?.chunk_count || 0), 0) ?? 0
  const ai = health?.checks.ai

  return (
    <div className="page">
      <header className="page-head"><div><h1>Welcome, {user?.name?.split(' ')[0]}</h1><p className="muted">Your legal document workspace.</p></div>
        <Link className="btn primary" to="/documents">Upload document</Link></header>
      {ai && !ai.configured && (
        <div className="notice" role="note"><strong>AI features are off.</strong> Add <code>GEMINI_API_KEY</code> to your <code>.env</code> file and restart LexAI. Upload and text extraction still work.</div>
      )}
      {health && !health.checks.ocr.ok && <div className="notice subtle" role="note">Scanned-PDF OCR is unavailable: {health.checks.ocr.detail}</div>}
      <div className="stats">
        <div className="stat"><span>{docs?.length ?? '–'}</span>Documents</div>
        <div className="stat"><span>{docs ? ready : '–'}</span>Indexed &amp; searchable</div>
        <div className="stat"><span>{docs ? chunks : '–'}</span>Passages</div>
      </div>
      <h2>Recent documents</h2>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {docs === null && !error ? <Skeleton lines={4} height={40} /> : docs?.length === 0 ? (
        <Empty title="Start with your first contract" action={<Link className="btn primary" to="/documents">Upload a document</Link>}>Upload a PDF or DOCX to extract text, search and analyze it.</Empty>
      ) : (
        <ul className="recent">{docs?.slice(0, 6).map((d) => (
          <li key={d.id}><Link to={`/documents/${d.id}`}>{d.title}</Link>{d.latest_version && <StatusBadge v={d.latest_version} />}<span className="muted">{fmtDate(d.updated_at)}</span></li>
        ))}</ul>
      )}
    </div>
  )
}
