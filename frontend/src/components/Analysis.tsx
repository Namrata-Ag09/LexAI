import { useCallback, useEffect, useState } from "react";
import { Analysis, api, ApiError } from "../api";
import { Citation, Disclaimer, Empty, ErrorBox, fmtDate, Skeleton } from "./ui";

const TITLES: Record<string, string> = {
  termination: "Termination",
  indemnity: "Indemnity",
  confidentiality: "Confidentiality",
  liability: "Liability",
  governing_law: "Governing law",
  renewal: "Renewal",
  payment: "Payment",
};

type AnyObject = Record<string, any>;

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function asObject(value: unknown): AnyObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as AnyObject)
    : {};
}

function normalizeResult(value: unknown, kind: string): AnyObject {
  const result = asObject(value);

  if (kind === "summary") {
    return {
      ...result,
      overview: result.overview ?? "No overview available.",
      parties: asArray(result.parties),
      important_dates: asArray(result.important_dates),
      key_points: asArray(result.key_points).map((point) => {
        const p = asObject(point);
        return { ...p, citations: asArray(p.citations) };
      }),
    };
  }

  if (kind === "clauses") {
    return {
      ...result,
      clauses: asArray(result.clauses).map((clause) => {
        const c = asObject(clause);
        return { ...c, citations: asArray(c.citations) };
      }),
    };
  }

  if (kind === "risks") {
    return {
      ...result,
      risks: asArray(result.risks).map((risk) => {
        const r = asObject(risk);
        return { ...r, citations: asArray(r.citations) };
      }),
    };
  }

  return result;
}

export function AnalysisPanel({
  docId,
  versionId,
  kind,
  canRun,
}: {
  docId: number;
  versionId: number;
  kind: "summary" | "clauses" | "risks";
  canRun: boolean;
}) {
  const [items, setItems] = useState<Analysis[] | null>(null);
  const [sel, setSel] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setItems(null);
    setSel(0);
    setError(null);

    try {
      const response = await api.analyses(docId, versionId, kind);
      const safeItems = asArray(response?.items).filter(
        (item) => item && typeof item === "object",
      ) as Analysis[];

      setItems(safeItems);
    } catch (e) {
      setError((e as Error).message || "Could not load analysis.");
      setItems([]);
    }
  }, [docId, versionId, kind]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run() {
    setBusy(true);
    setError(null);

    try {
      const response = await api.analyze(docId, versionId, kind);
      const analysis = response?.analysis;

      if (!analysis || typeof analysis !== "object") {
        throw new Error("The server returned an invalid analysis response.");
      }

      setItems((previous) => [
        analysis,
        ...(Array.isArray(previous) ? previous : []),
      ]);
      setSel(0);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Analysis failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  const cur = items?.[sel];
  const label = {
    summary: "summary",
    clauses: "clause analysis",
    risks: "risk analysis",
  }[kind];

  const result = cur ? normalizeResult(cur.result, kind) : null;

  return (
    <div className="analysis">
      <div className="analysis-bar">
        <button
          className="btn primary"
          disabled={busy || !canRun}
          onClick={run}
        >
          {busy ? "Analyzing…" : cur ? `Re-run ${label}` : `Generate ${label}`}
        </button>

        {items && items.length > 1 && (
          <>
            <label className="sr-only" htmlFor={`hist-${kind}`}>
              History
            </label>
            <select
              id={`hist-${kind}`}
              value={sel}
              onChange={(e) => setSel(Number(e.target.value))}
            >
              {items.map((a, i) => (
                <option key={a.id ?? i} value={i}>
                  {fmtDate(a.created_at)} — run #{items.length - i}
                </option>
              ))}
            </select>
          </>
        )}

        {!canRun && (
          <span className="muted">
            Available once text extraction has finished.
          </span>
        )}
      </div>

      {error && <ErrorBox message={error} onRetry={run} />}

      {items === null ? (
        <Skeleton lines={6} />
      ) : !cur && !busy ? (
        <Empty title={`No ${label} yet`}>
          Run the analysis to generate one. Every finding is backed by a
          verified quote from the document.
        </Empty>
      ) : result && cur ? (
        <div>
          {result.truncated && (
            <div className="notice subtle">
              This document was long; only the first part was analysed.
            </div>
          )}

          {kind === "summary" && <Summary r={result} />}
          {kind === "clauses" && <Clauses r={result} />}
          {kind === "risks" && <Risks r={result} />}

          <p className="muted small">
            Generated {fmtDate(cur.created_at)}
            {cur.model ? ` · ${cur.model}` : ""}
          </p>
        </div>
      ) : null}

      <Disclaimer />
    </div>
  );
}

function Summary({ r }: { r: AnyObject }) {
  const parties = asArray(r.parties);
  const dates = asArray(r.important_dates);
  const keyPoints = asArray(r.key_points);

  return (
    <div>
      <p className="lead">{r.overview}</p>

      <div className="two-col">
        <div>
          <h4>Parties</h4>
          {parties.length ? (
            <ul>
              {parties.map((p: any, i: number) => (
                <li key={i}>{typeof p === "string" ? p : JSON.stringify(p)}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">None identified</p>
          )}
        </div>

        <div>
          <h4>Important dates</h4>
          {dates.length ? (
            <ul>
              {dates.map((p: any, i: number) => (
                <li key={i}>{typeof p === "string" ? p : JSON.stringify(p)}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">None identified</p>
          )}
        </div>
      </div>

      <h4>Key points</h4>

      {keyPoints.length ? (
        keyPoints.map((point: any, i: number) => {
          const p = asObject(point);
          const citations = asArray(p.citations);

          return (
            <div className="card" key={i}>
              <p>
                {p.text ?? "No description available."}{" "}
                {!p.verified && (
                  <span
                    className="badge status-extracted"
                    title="No quote could be matched to the document text"
                  >
                    Unverified
                  </span>
                )}
              </p>

              {citations.map((c: any, j: number) => (
                <Citation key={j} c={c} />
              ))}
            </div>
          );
        })
      ) : (
        <p className="muted">No key points available.</p>
      )}
    </div>
  );
}

function Clauses({ r }: { r: AnyObject }) {
  const clauses = asArray(r.clauses);

  if (!clauses.length) {
    return (
      <Empty title="No clause details available">
        This analysis does not contain any clause details. You can run the
        analysis again to try generating them.
      </Empty>
    );
  }

  return (
    <div className="grid">
      {clauses.map((clause: any, i: number) => {
        const c = asObject(clause);
        const citations = asArray(c.citations);
        const found = Boolean(c.found);
        const type = String(c.type ?? `clause-${i + 1}`);

        return (
          <div
            className={`card clause ${found ? "found" : "missing"}`}
            key={`${type}-${i}`}
          >
            <div className="card-head">
              <h4>{TITLES[type] || type}</h4>
              <span
                className={`badge ${found ? "status-ready" : "status-queued"}`}
              >
                {found ? "Found" : "Not found"}
              </span>
            </div>

            <p>{c.summary ?? "No clause summary available."}</p>

            {citations.map((citation: any, j: number) => (
              <Citation key={j} c={citation} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function Risks({ r }: { r: AnyObject }) {
  const risks = asArray(r.risks);

  if (!risks.length) {
    return (
      <Empty title="No supported risks identified">
        The model did not report any risk that could be tied to a quote from the
        document. This is not a guarantee that no risks exist.
      </Empty>
    );
  }

  return (
    <div>
      {risks.map((risk: any, i: number) => {
        const k = asObject(risk);
        const citations = asArray(k.citations);
        const severity = String(k.severity ?? "unknown");

        return (
          <div className={`card risk sev-${severity}`} key={k.id ?? i}>
            <div className="card-head">
              <h4>{k.title ?? "Untitled risk"}</h4>
              <span className={`pill sev-${severity}`}>{severity}</span>
            </div>

            {k.category && <p className="muted small">{k.category}</p>}

            <p>{k.explanation ?? "No explanation available."}</p>

            {k.recommendation && (
              <p>
                <strong>Consider:</strong> {k.recommendation}
              </p>
            )}

            {citations.map((citation: any, j: number) => (
              <Citation key={j} c={citation} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
