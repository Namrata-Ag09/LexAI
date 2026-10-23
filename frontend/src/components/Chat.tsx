import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError, Conversation, Message } from '../api'
import { Citation, Disclaimer, Empty, ErrorBox, Skeleton } from './ui'

export function ChatPanel({ documentId }: { documentId?: number }) {
  const [convs, setConvs] = useState<Conversation[]>([])
  const [cid, setCid] = useState<number | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const end = useRef<HTMLDivElement>(null)

  const open = useCallback(async (id: number) => {
    setCid(id); setError(null); setFailed(null)
    try { setMessages((await api.conversation(id)).conversation.messages || []) } catch (e) { setError((e as Error).message) }
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { items } = await api.conversations(documentId)
      setConvs(items)
      if (items.length) await open(items[0].id)
    } catch (e) { setError((e as Error).message) } finally { setLoading(false) }
  }, [documentId, open])

  useEffect(() => { load() }, [load])
  useEffect(() => { end.current?.scrollIntoView?.({ behavior: 'smooth' }) }, [messages, busy])

  async function send(question: string) {
    setBusy(true); setFailed(null); setError(null)
    let id = cid
    try {
      if (id === null) {
        const { conversation } = await api.newConversation(documentId)
        id = conversation.id; setCid(id); setConvs((c) => [conversation, ...c])
      }
      setMessages((m) => [...m, { id: -Date.now(), role: 'user', content: question, citations: [], sufficient: null, sources: [], created_at: '' }])
      const r = await api.ask(id, question)
      setMessages((m) => [...m.filter((x) => x.id > 0), r.user_message, r.assistant_message])
      api.conversations(documentId).then((x) => setConvs(x.items)).catch(() => {})
      setText('')
    } catch (e) {
      setMessages((m) => m.filter((x) => x.id > 0))
      setFailed(question)
      setError(e instanceof ApiError ? e.message : 'Something went wrong.')
    } finally { setBusy(false) }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const q = text.trim()
    if (q && !busy) send(q)
  }

  async function remove() {
    if (cid === null || !window.confirm('Delete this conversation?')) return
    await api.deleteConversation(cid).catch(() => {})
    setCid(null); setMessages([]); load()
  }

  return (
    <div className="chat">
      <div className="chat-bar">
        <label className="sr-only" htmlFor="conv-select">Conversation</label>
        <select id="conv-select" value={cid ?? ''} onChange={(e) => (e.target.value ? open(Number(e.target.value)) : (setCid(null), setMessages([])))}>
          <option value="">New conversation</option>
          {convs.map((c) => (<option key={c.id} value={c.id}>{c.title}</option>))}
        </select>
        <button className="btn small" onClick={() => { setCid(null); setMessages([]); setError(null); setFailed(null) }}>New chat</button>
        {cid !== null && <button className="btn small ghost" onClick={remove}>Delete</button>}
      </div>
      <div className="chat-log" aria-live="polite">
        {loading ? <Skeleton lines={4} /> : messages.length === 0 && !busy ? (
          <Empty title="Ask about your documents">Answers are grounded in the retrieved text and cite their sources. If the evidence is not there, LexAI will say so.</Empty>
        ) : messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            <div className="bubble">
              <p>{m.content}</p>
              {m.role === 'assistant' && m.citations.length > 0 && (
                <div className="cites"><h4>Sources</h4>{m.citations.map((c) => (<Citation key={c.chunk_id + '-' + c.number} c={c} />))}</div>
              )}
              {m.role === 'assistant' && m.sufficient === false && m.sources.length > 0 && (
                <details className="related"><summary>Closest passages retrieved ({m.sources.length})</summary>
                  {m.sources.map((c) => (<Citation key={c.chunk_id} c={c} />))}</details>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="msg assistant"><div className="bubble"><Skeleton lines={2} /></div></div>}
        <div ref={end} />
      </div>
      {error && <ErrorBox message={error} onRetry={failed ? () => send(failed) : undefined} />}
      <form className="chat-input" onSubmit={submit}>
        <label className="sr-only" htmlFor="chat-q">Your question</label>
        <textarea id="chat-q" rows={2} value={text} maxLength={2000} placeholder="e.g. Can either party terminate for convenience?" onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(e) } }} />
        <button className="btn primary" disabled={busy || !text.trim()}>{busy ? 'Thinking…' : 'Ask'}</button>
      </form>
      <Disclaimer />
    </div>
  )
}
