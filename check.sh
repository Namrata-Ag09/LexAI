#!/usr/bin/env bash
# Run every automated check (backend lint+tests, frontend typecheck+tests+build).
set -e
cd "$(dirname "$0")"
[ -x backend/.venv/bin/python ] || { echo "Run ./setup.sh first." >&2; exit 1; }
backend/.venv/bin/python -m pip install --quiet -r backend/requirements-dev.txt
(cd backend && .venv/bin/python -m ruff check . && .venv/bin/python -m pytest -q)
(cd frontend && npm test && npm run build)
echo "All checks passed. (Playwright e2e is separate: cd frontend && npx playwright install chromium && npm run e2e)"
