#!/usr/bin/env bash
# LexAI setup for macOS / Linux. Safe to re-run: never overwrites .env or your data.
set -e
cd "$(dirname "$0")"
say() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
fail() { printf '\n\033[31mERROR: %s\033[0m\n' "$1" >&2; exit 1; }

PY=""
for c in python3.12 python3.11 python3.10 python3 python; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)' 2>/dev/null; then PY="$c"; break; fi
done
[ -n "$PY" ] || fail "Python 3.10 or newer was not found. Install it from https://www.python.org/downloads/ and run setup again."
command -v node >/dev/null 2>&1 || fail "Node.js was not found. Install the LTS version from https://nodejs.org/ and run setup again."
node -e 'process.exit(parseInt(process.versions.node)>=18?0:1)' || fail "Node.js 18 or newer is required (you have $(node -v))."
command -v npm >/dev/null 2>&1 || fail "npm was not found (it normally comes with Node.js)."

say "Creating Python environment (backend/.venv)"
[ -d backend/.venv ] || "$PY" -m venv backend/.venv || fail "Could not create a virtual environment. On Ubuntu/Debian run: sudo apt install python3-venv"
backend/.venv/bin/python -m pip install --quiet --upgrade pip
say "Installing backend dependencies (needs internet; can take a few minutes)"
backend/.venv/bin/python -m pip install --quiet -r backend/requirements.txt || fail "Backend dependency install failed. See TROUBLESHOOTING.md."

say "Installing frontend dependencies and building the interface"
(cd frontend && npm install --no-audit --no-fund && npm run build) || fail "Frontend build failed. See TROUBLESHOOTING.md."

if [ ! -f .env ]; then cp .env.example .env; say "Created .env (add your GEMINI_API_KEY to it)"; else say "Keeping your existing .env"; fi
mkdir -p data/uploads data/chroma

say "Running diagnostics"
(cd backend && .venv/bin/python diagnostics.py) || true

printf '\n\033[32mSetup complete.\033[0m\n  1. Open the file ".env" and paste your key after GEMINI_API_KEY=\n  2. Start LexAI with:  ./run.sh\n  3. Open http://localhost:5000\n'
