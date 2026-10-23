# Run every automated check on Windows.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$venvPy = Join-Path $PSScriptRoot 'backend\.venv\Scripts\python.exe'
if (-not (Test-Path $venvPy)) { Write-Host 'Run .\setup.ps1 first.' -ForegroundColor Red; exit 1 }
& $venvPy -m pip install --quiet -r backend\requirements-dev.txt
Push-Location backend; & $venvPy -m ruff check .; if ($LASTEXITCODE) { exit 1 }; & $venvPy -m pytest -q; if ($LASTEXITCODE) { exit 1 }; Pop-Location
Push-Location frontend; npm test; if ($LASTEXITCODE) { exit 1 }; npm run build; Pop-Location
Write-Host 'All checks passed.' -ForegroundColor Green
