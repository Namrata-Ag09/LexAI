import { useState } from 'react'
import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import { Skeleton } from './components/ui'
import AuthPage, { Brand } from './pages/Auth'
import ChatPage from './pages/ChatPage'
import Dashboard from './pages/Dashboard'
import Documents from './pages/Documents'
import Search from './pages/Search'
import Settings from './pages/Settings'
import Workspace from './pages/Workspace'

function Shell() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const links: [string, string][] = [['/', 'Dashboard'], ['/documents', 'Documents'], ['/search', 'Search'], ['/chat', 'Ask AI'], ['/settings', 'Settings']]
  return (
    <div className="shell">
      <button className="menu-btn" aria-label="Toggle navigation" aria-expanded={open} onClick={() => setOpen(!open)}>☰</button>
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <Brand light />
        <nav aria-label="Main">
          {links.map(([to, label]) => (<NavLink key={to} to={to} end={to === '/'} onClick={() => setOpen(false)}>{label}</NavLink>))}
        </nav>
        <div className="user"><span>{user?.name}</span><small>{user?.email}</small><button className="btn small ghost" onClick={logout}>Log out</button></div>
      </aside>
      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/documents/:id" element={<Workspace />} />
          <Route path="/search" element={<Search />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  const { user, loading } = useAuth()
  if (loading) return <div className="boot"><Skeleton lines={3} /></div>
  return <BrowserRouter>{user ? <Shell /> : <AuthPage />}</BrowserRouter>
}
