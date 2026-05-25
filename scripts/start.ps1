# Windows launcher — PowerShell equivalent of scripts/start.sh.
# Starts the backend on :8000 and the frontend on :5173, and stops both on Ctrl+C.
#
# Usage (from anywhere):
#   powershell -ExecutionPolicy Bypass -File scripts\start.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "[AITimeMachine] starting backend on :8000 and frontend on :5173"

# 1) Backend — seed .env on first run.
$backendDir = Join-Path $root "backend"
$envFile = Join-Path $backendDir ".env"
if (-not (Test-Path $envFile)) {
    Write-Host "backend/.env is missing — copying the template. Fill in your API key."
    Copy-Item (Join-Path $backendDir ".env.example") $envFile
}

# Prefer uv; fall back to a local venv if uv isn't installed.
if (Get-Command uv -ErrorAction SilentlyContinue) {
    $backendCmd = "uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"
} else {
    $venv = Join-Path $backendDir ".venv"
    if (-not (Test-Path $venv)) {
        python -m venv $venv
        & (Join-Path $venv "Scripts\pip.exe") install -e $backendDir
    }
    $backendCmd = ".\.venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8000 --reload"
}

$backend = Start-Process -PassThru -NoNewWindow -WorkingDirectory $backendDir `
    -FilePath "powershell" -ArgumentList "-NoProfile", "-Command", $backendCmd

# 2) Frontend.
$frontendDir = Join-Path $root "frontend"
if (-not (Test-Path (Join-Path $frontendDir "node_modules"))) {
    Push-Location $frontendDir; npm install; Pop-Location
}
$frontend = Start-Process -PassThru -NoNewWindow -WorkingDirectory $frontendDir `
    -FilePath "powershell" -ArgumentList "-NoProfile", "-Command", "npm run dev"

try {
    Wait-Process -Id $backend.Id, $frontend.Id
} finally {
    Write-Host "[stopping]"
    foreach ($p in @($backend, $frontend)) {
        # taskkill /T tears down the whole tree (uvicorn --reload and vite spawn children).
        if ($p -and -not $p.HasExited) { taskkill /PID $p.Id /T /F 2>$null | Out-Null }
    }
}
