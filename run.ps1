# Start LexAI. Use ".\run.ps1 dev" for hot-reload development servers.
param([string]$Mode = '')
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$venvPy = Join-Path $PSScriptRoot 'backend\.venv\Scripts\python.exe'
if (-not (Test-Path $venvPy)) { Write-Host 'Run .\setup.ps1 first.' -ForegroundColor Red; exit 1 }
if ($Mode -eq 'dev') {
  Write-Host 'Dev mode: API on http://127.0.0.1:5000, UI on http://localhost:5173'
  $api = Start-Process -PassThru -NoNewWindow -WorkingDirectory backend -FilePath $venvPy -ArgumentList 'run_server.py'
  try { Set-Location frontend; npm run dev } finally { Stop-Process -Id $api.Id -ErrorAction SilentlyContinue }
} else {
  if (-not (Test-Path frontend\dist\index.html)) { Write-Host 'Note: the interface is not built yet. Run .\setup.ps1.' -ForegroundColor Yellow }
  Set-Location backend
  & $venvPy run_server.py
}
