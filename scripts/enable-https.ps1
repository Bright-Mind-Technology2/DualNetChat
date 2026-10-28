$ErrorActionPreference = "Stop"

$certificatePath = Join-Path $PSScriptRoot "..\certificates\bright-mind-lan.pfx"
$markerPath = Join-Path $PSScriptRoot "..\certificates\https-enabled"

if (-not (Test-Path $certificatePath)) {
  throw "Run npm run setup:https before enabling HTTPS."
}

New-Item -ItemType File -Path $markerPath -Force | Out-Null
Write-Host "HTTPS enabled. Stop the running app with Ctrl+C, then run npm run dev."