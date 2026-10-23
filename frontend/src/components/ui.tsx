import { ReactNode, useState } from 'react'
import { Link } from 'react-router-dom'
import { Passage, Version } from '../api'

export const DISCLAIMER = 'AI analysis is informational only and is not legal advice. Verify important points against the source text and consult a qualified attorney.'

export function Skeleton({ lines = 3, height = 14 }: { lines?: number; height?: number }) {
  return (
    <div className="skeleton-wrap" aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }).map((_, i) => (<div key={i} className="skeleton" style={{ height, width: `${90 - ((i * 17) % 40)}%` }} />))}
    </div>
  )
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden>§</div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      <span>{message}</span>
      {onRetry && <button className="btn small" onClick={onRetry}>Retry</button>}
    </div>
  )
}

export function Disclaimer() { return <p className="disclaimer">{DISCLAIMER}</p> }

export const ACTIVE = ['queued', 'extracting', 'chunking', 'embedding']
const LABELS: Record<string, string> = {
  queued: 'Queued', extracting: 'Extracting text', chunking: 'Chunking', embedding: 'Indexing',
  ready: 'Ready', extracted: 'Text only', failed: 'Failed',
}
export function StatusBadge({ v }: { v: Pick<Version, 'status'> }) {
  return <span className={`badge status-${v.status}`}>{LABELS[v.status] || v.status}</span>
}
export function ProgressBar({ value, label }: { value: number; label?: string }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label || 'Progress'}>
      <div style={{ width: `${value}%` }} />
    </div>
  )
}

export const fmtBytes = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)
export const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '')

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Wrap search terms in <mark>. */
export function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const t = terms.filter((x) => x.length > 1)
  if (!t.length) return <>{text}</>
  const re = new RegExp(`(${t.map(esc).join('|')})`, 'gi')
  return (<>{text.split(re).map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>))}</>)
}

/** Highlight an exact quote (whitespace-insensitive) inside an excerpt. */
export function QuoteHighlight({ text, quote }: { text: string; quote?: string }) {
  if (!quote) return <>{text}</>
  const words = quote.trim().split(/\s+/).map(esc)
  if (!words.length) return <>{text}</>
  const m = new RegExp(words.join('\\s+'), 'i').exec(text)
  if (!m) return <>{text}</>
  return (<>{text.slice(0, m.index)}<mark>{m[0]}</mark>{text.slice(m.index + m[0].length)}</>)
}

export function pageLabel(p: Passage) { return p.page ? `p. ${p.page}` : 'document body' }

export function workspaceLink(p: Pick<Passage, 'document_id' | 'version_id' | 'page' | 'chunk_id'>) {
  return `/documents/${p.document_id}?tab=text&v=${p.version_id}${p.page ? `&page=${p.page}` : ''}&chunk=${p.chunk_id}`
}

export function Citation({ c, terms = [] }: { c: Passage; terms?: string[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`citation ${open ? 'open' : ''}`}>
      <button className="citation-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        {c.number !== undefined && <span className="cite-num">{c.number}</span>}
        <span className="cite-title">{c.document_title}</span>
        <span className="cite-meta">v{c.version_number} · {pageLabel(c)}</span>
        <span aria-hidden>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="citation-body">
          <blockquote>{c.quote ? <QuoteHighlight text={c.excerpt} quote={c.quote} /> : <Highlight text={c.excerpt} terms={terms} />}</blockquote>
          <Link className="link" to={workspaceLink(c)}>Open in document →</Link>
        </div>
      )}
    </div>
  )
}
