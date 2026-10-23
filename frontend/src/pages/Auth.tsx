import { FormEvent, useState } from 'react'
import { useAuth } from '../auth'

export function Brand({ light = false }: { light?: boolean }) {
  return (<div className={`brand ${light ? 'light' : ''}`}><span className="logo" aria-hidden>L</span><span>Lex<b>AI</b></span></div>)
}

export default function AuthPage() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Enter a valid email address.')
    if (!password) return setError('Enter your password.')
    if (mode === 'register' && password.length < 10) return setError('Password must be at least 10 characters.')
    setBusy(true)
    try { mode === 'login' ? await login(email, password) : await register(name, email, password) }
    catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }

  return (
    <main className="auth">
      <section className="auth-hero">
        <Brand light />
        <h1>Read every clause.<br />Miss nothing.</h1>
        <p>Upload contracts, search them in plain English, and get cited answers, clause maps and risk flags — grounded in the actual text.</p>
        <ul><li>Citations you can verify</li><li>Page-aware search</li><li>Private to your account</li></ul>
      </section>
      <section className="auth-card">
        <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
        <form onSubmit={submit} noValidate>
          {mode === 'register' && (<><label htmlFor="name">Name</label><input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></>)}
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          {mode === 'register' && <p className="hint">At least 10 characters, with letters and numbers.</p>}
          {error && <div className="error-box" role="alert">{error}</div>}
          <button className="btn primary block" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        </form>
        <p className="switch">
          {mode === 'login' ? 'New to LexAI?' : 'Already registered?'}{' '}
          <button className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null) }}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button>
        </p>
      </section>
    </main>
  )
}
