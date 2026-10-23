#!/usr/bin/env bash
# Start LexAI. Use "./run.sh dev" for the hot-reload development servers.
set -e
cd "$(dirname "$0")"
[ -x backend/.venv/bin/python ] || { echo "Run ./setup.sh first." >&2; exit 1; }
if [ "$1" = "dev" ]; then
  echo "Dev mode: API on http://127.0.0.1:5000, UI on http://localhost:5173"
  (cd backend && .venv/bin/python run_server.py) & API=$!
  trap 'kill $API 2>/dev/null' EXIT INT TERM
  cd frontend && npm run dev
else
  [ -f frontend/dist/index.html ] || echo "Note: the interface is not built yet. Run ./setup.sh." >&2
  cd backend && exec .venv/bin/python run_server.py
fi
