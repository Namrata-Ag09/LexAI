import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, onUnauthenticated, User } from './api'

type AuthCtx = {
  user: User | null; loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  setUser: (u: User) => void
}
const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    onUnauthenticated.handler = () => setUser(null)
    api.me().then((r) => setUser(r.user)).catch(() => setUser(null)).finally(() => setLoading(false))
  }, [])
  const login = useCallback(async (e: string, p: string) => { setUser((await api.login(e, p)).user) }, [])
  const register = useCallback(async (n: string, e: string, p: string) => { setUser((await api.register(n, e, p)).user) }, [])
  const logout = useCallback(async () => { try { await api.logout() } finally { setUser(null) } }, [])
  const value = useMemo(() => ({ user, loading, login, register, logout, setUser }), [user, loading, login, register, logout])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth must be used inside AuthProvider')
  return c
}
