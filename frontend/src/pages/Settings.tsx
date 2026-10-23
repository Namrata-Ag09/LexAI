import { FormEvent, useEffect, useState } from 'react'
import { api, Health } from '../api'
import { useAuth } from '../auth'
import { useToast } from '../toast'

export default function Settings() {
  const { user, setUser, logout } = useAuth()
  const toast = useToast()
  const [name, setName] = useState(user?.name || '')
  const [email, setEmail] = useState(user?.email || '')
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [perr, setPerr] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  useEffect(() => { api.health().then(setHealth).catch(() => {}) }, [])

  async function saveProfile(e: FormEvent) {
    e.preventDefault(); setErr(null)
    try { setUser((await api.updateProfile({ name, email })).user); toast('success', 'Profile saved.') } catch (x) { setErr((x as Error).message) }
  }
  async function savePassword(e: FormEvent) {
    e.preventDefault(); setPerr(null)
    if (next.length < 10) return setPerr('New password must be at least 10 characters.')
    try { await api.changePassword(cur, next); setCur(''); setNext(''); toast('success', 'Password changed.') } catch (x) { setPerr((x as Error).message) }
  }

  return (
    <div className="page narrow">
      <header className="page-head"><div><h1>Account settings</h1></div></header>
      <form className="card" onSubmit={saveProfile}>
        <h3>Profile</h3>
        <label htmlFor="s-name">Name</label><input id="s-name" value={name} onChange={(e) => setName(e.target.value)} />
        <label htmlFor="s-email">Email</label><input id="s-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        {err && <div className="error-box" role="alert">{err}</div>}
        <button className="btn primary">Save profile</button>
      </form>
      <form className="card" onSubmit={savePassword}>
        <h3>Change password</h3>
        <label htmlFor="s-cur">Current password</label><input id="s-cur" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
        <label htmlFor="s-new">New password</label><input id="s-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        {perr && <div className="error-box" role="alert">{perr}</div>}
        <button className="btn primary">Update password</button>
      </form>
      <div className="card">
        <h3>System status</h3>
        {!health ? <p className="muted">Checking…</p> : (
          <ul className="checks">{Object.entries(health.checks).map(([k, v]) => (
            <li key={k}><span className={`dot ${v.ok ? 'ok' : v.optional ? 'warn' : 'bad'}`} aria-hidden /><strong>{k}</strong> <span className="muted">{v.detail || (v.ok ? 'OK' : 'Unavailable')}</span></li>
          ))}</ul>
        )}
      </div>
      <button className="btn danger" onClick={logout}>Sign out</button>
    </div>
  )
}
