# LexAI — AI-Powered Legal Document Intelligence

Upload contracts (PDF/DOCX), search them in plain English, ask questions and get **cited** answers, and generate summaries, clause maps and risk flags. Everything runs locally on your machine; only text snippets needed for AI features are sent to Google Gemini.

> **Not legal advice.** AI output is informational and may be wrong. Always verify against the source text and consult a qualified attorney.

## Quick start

1. Install **Python 3.10+** and **Node.js 18+** (see `SETUP_GUIDE.md`).
2. Run setup — macOS/Linux: `./setup.sh` · Windows PowerShell: `.\setup.ps1`
3. Open `.env` and paste your key after `GEMINI_API_KEY=` (get one at https://aistudio.google.com/apikey).
4. Start — macOS/Linux: `./run.sh` · Windows: `.\run.ps1`
5. Open **http://localhost:5000**, create an account, upload a document.

LexAI starts without a key: sign-in, upload, text extraction, chunking and versioning work. AI features show a message asking you to add the key.

## Stack
React + TypeScript + Vite · Flask + SQLAlchemy + Alembic (SQLite, migrated automatically) · persistent ChromaDB · Google `google-genai` SDK (Gemini) · pypdf / python-docx · optional Tesseract OCR.

## Features
- Accounts: register, login/logout, profile, password change; hashed passwords, CSRF protection, rate limiting, CORS allow-list, security headers, strict per-user ownership (other users' data returns 404).
- Documents: drag-and-drop upload, type/size/content validation, page-aware extraction, OCR fallback, text cleaning, configurable chunking with overlap, extraction preview, chunk explorer, versions, background processing with progress, reprocess, clean deletion (files, rows, vectors).
- AI: semantic search with filters/pagination, RAG chat with citations validated against the real chunk text (invented quotes are dropped), honest "not enough evidence" answers, summaries, clause detection (termination, indemnity, confidentiality, liability, governing law, renewal, payment), risk analysis with severity — each finding needs a verified quote. Chat and analysis history are stored. Uploaded documents are treated as untrusted data.

## Commands
| Task | macOS/Linux | Windows |
|---|---|---|
| Setup | `./setup.sh` | `.\setup.ps1` |
| Run | `./run.sh` | `.\run.ps1` |
| Dev mode (hot reload, UI on :5173) | `./run.sh dev` | `.\run.ps1 dev` |
| All tests/build | `./check.sh` | `.\check.ps1` |
| Diagnostics | `backend/.venv/bin/python backend/diagnostics.py` | `backend\.venv\Scripts\python backend\diagnostics.py` |

Health/status JSON: http://localhost:5000/api/health (also shown in Settings).

## Project layout
```
backend/   Flask app (app/), Alembic migrations, pytest tests, run_server.py
frontend/  React + TS source (src/), Vitest tests, Playwright e2e spec (e2e/)
data/      created at runtime: SQLite DB, uploads, ChromaDB (never overwritten by setup)
.env       your configuration (created from .env.example; keep private)
```

## Known limitations
- Live Gemini calls were **not** exercised when this project was built (no API key available); the Gemini integration is covered by mocked tests only. Model names are configurable in `.env`; if Google renames a model, update them.
- The Playwright e2e spec is included but was not run (no browser available in the build environment).
- `setup.ps1`/`run.ps1`/`check.ps1` were written carefully but not executed on Windows.
- Very long documents: analysis uses the first `MAX_CONTEXT_CHARS` characters and says so when truncated.
- Changing `GEMINI_EMBED_MODEL` or `EMBED_DIM` creates a new vector collection; press **Re-process** on documents to re-index them.
- Processing runs in in-process threads (fine for single-user/local use; not a multi-server queue).
