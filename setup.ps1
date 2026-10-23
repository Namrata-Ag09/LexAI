# LexAI setup for Windows PowerShell. Safe to re-run: never overwrites .env or your data.
# If scripts are blocked, run:  powershell -ExecutionPolicy Bypass -File .\setup.ps1
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
function Say($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Fail($m) { Write-Host "`nERROR: $m" -ForegroundColor Red; exit 1 }

$py = $null
foreach ($c in @('py -3', 'python', 'python3')) {
  try {
    $parts = $c.Split(' ')
    $ok = & $parts[0] $parts[1..($parts.Length)] -c "import sys; print(int(sys.version_info >= (3,10)))" 2>$null
    if ($ok -eq '1') { $py = $parts; break }
  } catch {}
}
if (-not $py) { Fail 'Python 3.10+ was not found. Install it from https://www.python.org/downloads/ (tick "Add python.exe to PATH") and run setup again.' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail 'Node.js was not found. Install the LTS version from https://nodejs.org/ and run setup again.' }
$nodeMajor = [int]((node -v).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 18) { Fail "Node.js 18+ is required (you have $(node -v))." }

Say 'Creating Python environment (backend\.venv)'
$venvPy = Join-Path $PSScriptRoot 'backend\.venv\Scripts\python.exe'
if (-not (Test-Path $venvPy)) { & $py[0] $py[1..($py.Length)] -m venv backend\.venv; if ($LASTEXITCODE) { Fail 'Could not create the virtual environment.' } }
& $venvPy -m pip install --quiet --upgrade pip
Say 'Installing backend dependencies (needs internet; can take a few minutes)'
& $venvPy -m pip install --quiet -r backend\requirements.txt
if ($LASTEXITCODE) { Fail 'Backend dependency install failed. See TROUBLESHOOTING.md.' }

Say 'Installing frontend dependencies and building the interface'
Push-Location frontend
npm install --no-audit --no-fund; if ($LASTEXITCODE) { Pop-Location; Fail 'npm install failed. See TROUBLESHOOTING.md.' }
npm run build; if ($LASTEXITCODE) { Pop-Location; Fail 'Frontend build failed. See TROUBLESHOOTING.md.' }
Pop-Location

if (-not (Test-Path .env)) { Copy-Item .env.example .env; Say 'Created .env (add your GEMINI_API_KEY to it)' } else { Say 'Keeping your existing .env' }
New-Item -ItemType Directory -Force data\uploads, data\chroma | Out-Null

Say 'Running diagnostics'
Push-Location backend; & $venvPy diagnostics.py; Pop-Location

Write-Host "`nSetup complete." -ForegroundColor Green
Write-Host '  1. Open the file ".env" in Notepad and paste your key after GEMINI_API_KEY='
Write-Host '  2. Start LexAI with:  .\run.ps1'
Write-Host '  3. Open http://localhost:5000'
