import { createContext, ReactNode, useCallback, useContext, useState } from 'react'

type Toast = { id: number; kind: 'success' | 'error'; text: string }
const Ctx = createContext<(kind: Toast['kind'], text: string) => void>(() => {})
let n = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = ++n
    setItems((x) => [...x, { id, kind, text }])
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 5000)
  }, [])
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (<div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>))}
      </div>
    </Ctx.Provider>
  )
}
export const useToast = () => useContext(Ctx)
