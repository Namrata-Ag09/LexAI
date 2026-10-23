import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const win = process.platform === 'win32'
const py = join('..', 'backend', '.venv', win ? 'Scripts/python.exe' : 'bin/python')
const env = { ...process.env, PORT: '5055', LEXAI_DATA_DIR: mkdtempSync(join(tmpdir(), 'lexai-e2e-')), GEMINI_API_KEY: '', RATE_LIMIT_ENABLED: 'false' }
const p = spawn(py, ['run_server.py'], { cwd: join('..', 'backend'), env, stdio: 'inherit' })
p.on('exit', (c) => process.exit(c ?? 0))
