import { ChatPanel } from '../components/Chat'

export default function ChatPage() {
  return (
    <div className="page">
      <header className="page-head"><div><h1>Ask AI</h1><p className="muted">Ask questions across all your latest document versions. Open a document to chat about just that file.</p></div></header>
      <ChatPanel />
    </div>
  )
}
