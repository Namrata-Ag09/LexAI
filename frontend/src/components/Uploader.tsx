import { DragEvent, useRef, useState } from 'react'
import { ApiError, Doc, uploadFile } from '../api'
import { ProgressBar } from './ui'

export const ACCEPT = ['pdf', 'docx']

export function validateFile(f: File, maxMb: number): string | null {
  const ext = f.name.split('.').pop()?.toLowerCase() || ''
  if (!ACCEPT.includes(ext)) return `“${f.name}” is not supported. Upload a PDF or DOCX file.`
  if (f.size === 0) return `“${f.name}” is empty.`
  if (f.size > maxMb * 1024 * 1024) return `“${f.name}” is larger than ${maxMb} MB.`
  return null
}

export function Uploader({ onUploaded, documentId, maxMb = 25, label }: {
  onUploaded: (doc: Doc) => void; documentId?: number; maxMb?: number; label?: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const [pct, setPct] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')

  async function handle(files: FileList | File[]) {
    setError(null)
    const f = Array.from(files)[0]
    if (!f) return
    const bad = validateFile(f, maxMb)
    if (bad) { setError(bad); return }
    setName(f.name); setPct(0)
    try {
      const r = await uploadFile(documentId ? `/api/documents/${documentId}/versions` : '/api/documents', f, {}, setPct)
      onUploaded(r.document)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Upload failed.')
    } finally { setPct(null); if (input.current) input.current.value = '' }
  }

  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files) }
  const uploading = pct !== null
  return (
    <div>
      <div className={`dropzone ${drag ? 'drag' : ''}`} data-testid="dropzone"
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={onDrop}>
        <input ref={input} id={`file-${documentId ?? 'new'}`} type="file" accept=".pdf,.docx" hidden onChange={(e) => e.target.files && handle(e.target.files)} />
        <p><strong>{label || 'Drag & drop a contract here'}</strong></p>
        <p className="muted">PDF or DOCX, up to {maxMb} MB</p>
        <button className="btn primary" disabled={uploading} onClick={() => input.current?.click()}>{uploading ? 'Uploading…' : 'Choose file'}</button>
        {uploading && (<div className="upload-progress"><span>{name} — {pct}%</span><ProgressBar value={pct as number} label="Upload progress" /></div>)}
      </div>
      {error && <div className="error-box" role="alert">{error}</div>}
    </div>
  )
}
