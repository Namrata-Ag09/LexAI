import { useCallback, useEffect, useState } from 'react'
import { Analysis, api, ApiError } from '../api'
import { Citation, Disclaimer, Empty, ErrorBox, fmtDate, Skeleton } from './ui'

const TITLES: Record<string, string> = {
  termination: 'Termination', indemnity: 'Indemnity', confidentiality: 'Confidentiality', liability: 'Liability',
  governing_law: 'Governing law', renewal: 'Renewal', payment: 'Payment',
}

export function AnalysisPanel({ docId, versionId, kind, canRun }: { docId: number; versionId: number; kind: 'summary' | 'clauses' | 'risks'; canRun: boolean }) {
  const [items, setItems] = useState<Analysis[] | null>(null)
  const [sel, setSel] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setItems(null)
    try { setItems((await api.analyses(docId, versionId, kind)).items); setSel(0); setError(null) } catch (e) { setError((e as Error).message); setItems([]) }
  }, [docId, versionId, kind])
  useEffect(() => { load() }, [load])

  async function run() {
    setBusy(true); setError(null)
    try { const r = await api.analyze(docId, versionId, kind); setItems((x) => [r.analysis, ...(x || [])]); setSel(0) }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Analysis failed.') } finally { setBusy(false) }
  }
  const cur = items?.[sel]
  const label = { summary: 'summary', clauses: 'clause analysis', risks: 'risk analysis' }[kind]

  return (
    <div className="analysis">
      <div className="analysis-bar">
        <button className="btn primary" disabled={busy || !canRun} onClick={run}>{busy ? 'Analyzing…' : cur ? `Re-run ${label}` : `Generate ${label}`}</button>
        {items && items.length > 1 && (
          <><label className="sr-only" htmlFor={`hist-${kind}`}>History</label>
            <select id={`hist-${kind}`} value={sel} onChange={(e) => setSel(Number(e.target.value))}>
              {items.map((a, i) => (<option key={a.id} value={i}>{fmtDate(a.created_at)} — run #{items.length - i}</option>))}
            </select></>
        )}
        {!canRun && <span className="muted">Available once text extraction has finished.</span>}
      </div>
      {error && <ErrorBox message={error} onRetry={run} />}
      {items === null ? <Skeleton lines={6} /> : !cur && !busy ? (
        <Empty title={`No ${label} yet`}>Run the analysis to generate one. Every finding is backed by a verified quote from the document.</Empty>
      ) : cur && (
        <div>
          {cur.result.truncated && <div className="notice subtle">This document was long; only the first part was analysed.</div>}
          {kind === 'summary' && <Summary r={cur.result} />}
          {kind === 'clauses' && <Clauses r={cur.result} />}
          {kind === 'risks' && <Risks r={cur.result} />}
          <p className="muted small">Generated {fmtDate(cur.created_at)}{cur.model ? ` · ${cur.model}` : ''}</p>
        </div>
      )}
      <Disclaimer />
    </div>
  )
}

function Summary({ r }: { r: any }) {
  return (
    <div>
      <p className="lead">{r.overview}</p>
      <div className="two-col">
        <div><h4>Parties</h4>{r.parties?.length ? <ul>{r.parties.map((p: string, i: number) => <li key={i}>{p}</li>)}</ul> : <p className="muted">None identified</p>}</div>
        <div><h4>Important dates</h4>{r.important_dates?.length ? <ul>{r.important_dates.map((p: string, i: number) => <li key={i}>{p}</li>)}</ul> : <p className="muted">None identified</p>}</div>
      </div>
      <h4>Key points</h4>
      {r.key_points.map((p: any, i: number) => (
        <div className="card" key={i}>
          <p>{p.text} {!p.verified && <span className="badge status-extracted" title="No quote could be matched to the document text">Unverified</span>}</p>
          {p.citations.map((c: any, j: number) => <Citation key={j} c={c} />)}
        </div>
      ))}
    </div>
  )
}

function Clauses({ r }: { r: any }) {
  return (
    <div className="grid">
      {r.clauses.map((c: any) => (
        <div className={`card clause ${c.found ? 'found' : 'missing'}`} key={c.type}>
          <div className="card-head"><h4>{TITLES[c.type] || c.type}</h4><span className={`badge ${c.found ? 'status-ready' : 'status-queued'}`}>{c.found ? 'Found' : 'Not found'}</span></div>
          <p>{c.summary}</p>
          {c.citations.map((x: any, j: number) => <Citation key={j} c={x} />)}
        </div>
      ))}
    </div>
  )
}

function Risks({ r }: { r: any }) {
  if (!r.risks.length) return <Empty title="No supported risks identified">The model did not report any risk that could be tied to a quote from the document. This is not a guarantee that no risks exist.</Empty>
  return (
    <div>
      {r.risks.map((k: any, i: number) => (
        <div className={`card risk sev-${k.severity}`} key={i}>
          <div className="card-head"><h4>{k.title}</h4><span className={`pill sev-${k.severity}`}>{k.severity}</span></div>
          {k.category && <p className="muted small">{k.category}</p>}
          <p>{k.explanation}</p>
          {k.recommendation && <p><strong>Consider:</strong> {k.recommendation}</p>}
          {k.citations.map((x: any, j: number) => <Citation key={j} c={x} />)}
        </div>
      ))}
    </div>
  )
}
