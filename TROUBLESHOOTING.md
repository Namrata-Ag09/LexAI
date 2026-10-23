# Troubleshooting

First run the diagnostics: `backend/.venv/bin/python backend/diagnostics.py` (Windows: `backend\.venv\Scripts\python backend\diagnostics.py`) and look at Settings → System status.

| Symptom | Fix |
|---|---|
| "Python 3.10 or newer was not found" | Install Python from python.org; on Windows tick "Add to PATH"; open a **new** terminal. |
| "Node.js was not found / 18 required" | Install the Node.js LTS from nodejs.org; open a new terminal. |
| Ubuntu: venv creation fails | `sudo apt install python3-venv` |
| `pip install` fails (chromadb / onnxruntime) | Use Python 3.10–3.12 (very new Python versions may lack wheels); check internet/proxy; re-run setup. |
| Windows: scripts are blocked | `powershell -ExecutionPolicy Bypass -File .\setup.ps1` |
| Page says "frontend has not been built" | Re-run setup (the `npm run build` step probably failed — read its output). |
| Port 5000 busy (macOS AirPlay uses it) | Set `PORT=5001` in `.env`, restart, open http://localhost:5001. |
| "AI features are not configured" | Put `GEMINI_API_KEY=...` in `.env` (no quotes/spaces) and restart. |
| "Gemini rejected the request" | Key invalid/expired, or a model name in `.env` no longer exists — check https://ai.google.dev/gemini-api/docs/models and update `GEMINI_CHAT_MODEL` / `GEMINI_EMBED_MODEL`. |
| "rate-limiting" / "Could not reach Gemini" | Wait a minute and press Retry/Re-process; check internet and key quota. |
| Document status "Text only" | Indexing needs a working key. Fix the key, restart, press **Re-process**. |
| "PDF appears to be scanned … OCR unavailable" | Install Tesseract (SETUP_GUIDE.md), restart, press **Re-process**. |
| "password-protected" PDF | Remove the password and upload again. |
| Search returns nothing | Document must be **Ready**; try "All versions"; rephrase. |
| "Security token missing or expired" | Refresh the page. |
| "Too many requests" | Wait a minute (login/AI endpoints are rate limited). |
| Processing stuck after a crash | On restart interrupted jobs are marked Failed; press **Re-process**. |
| Dev mode: UI can't reach API | Use `./run.sh dev`; the UI proxies `/api` to port 5000. |
| Start over | Stop LexAI and delete the `data/` folder (this removes all accounts, documents and indexes). |
