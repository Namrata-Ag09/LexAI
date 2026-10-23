# LexAI Setup Guide (for beginners)

## 1. Prerequisites
| Need | Why | Get it |
|---|---|---|
| Python 3.10+ | backend | https://www.python.org/downloads/ — on Windows tick **"Add python.exe to PATH"** |
| Node.js 18+ (LTS) | builds the interface | https://nodejs.org/ |
| Internet (setup only) | downloads libraries | — |
| Gemini API key | AI features | https://aistudio.google.com/apikey |
| Tesseract (optional) | OCR for **scanned** PDFs | see below |

Text-based PDFs and DOCX files work without Tesseract.

### Optional: Tesseract OCR
- **Windows:** install from https://github.com/UB-Mannheim/tesseract/wiki, then either add it to PATH or set `TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe` in `.env`.
- **macOS:** `brew install tesseract`
- **Ubuntu/Debian:** `sudo apt install tesseract-ocr`
Restart LexAI afterwards; Settings → System status shows OCR as green when found.

## 2. Install
1. Extract `LexAI_FullStack_Project.zip`.
2. Open a terminal in the extracted `LexAI` folder.
   - macOS/Linux: `./setup.sh` (if "permission denied": `chmod +x setup.sh run.sh check.sh`)
   - Windows PowerShell: `.\setup.ps1` (if blocked: `powershell -ExecutionPolicy Bypass -File .\setup.ps1`)
Setup creates a private Python environment, installs everything, builds the interface, creates `.env`, and runs diagnostics. It is safe to re-run and **never overwrites `.env` or your `data/` folder**.

## 3. Configure the key
Open `.env` in any text editor, paste your key: `GEMINI_API_KEY=your-key-here`, save. The key stays on the server and is never sent to the browser. Never share `.env`.

## 4. Run
`./run.sh` (macOS/Linux) or `.\run.ps1` (Windows), then open **http://localhost:5000**. Stop with Ctrl+C.

## 5. First use
Create an account → **Documents** → upload a PDF/DOCX → wait for status **Ready** → try **Search**, **Ask AI**, and the Summary/Clauses/Risks tabs. Status **Text only** means extraction worked but indexing needs the API key — add it, restart, and press **Re-process**.

## Where is my data?
In the `data/` folder (SQLite database, uploaded files, vector index). Back up or delete that folder to keep or reset everything. Upgrading: replace the code, keep `data/` and `.env`; migrations run automatically at startup.

## Privacy
Documents stay on your computer. When you use AI features, relevant text passages are sent to Google's Gemini API under your key and Google's terms.
