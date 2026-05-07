$ErrorActionPreference = "Stop"

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Blave Automation System" -ForegroundColor Cyan
Write-Host "Batch Capture Launcher 2025" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Cleaning up old processes..." -ForegroundColor Yellow
$processNames = @("msedge", "chrome", "node")
foreach ($name in $processNames) {
    $processes = Get-Process -Name $name -ErrorAction SilentlyContinue
    if ($processes) {
        foreach ($proc in $processes) {
            try {
                Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
                Write-Host "  Closed: $name" -ForegroundColor DarkGray
            } catch {}
        }
    }
}
Write-Host ""

Start-Sleep -Seconds 2

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Blave Batch Capture (15 Datasets)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = $scriptDir
$scriptPath = Join-Path $root "src\blave_batch_capture_2025.mjs"

Write-Host "Project root: $root" -ForegroundColor Gray
Write-Host "Starting 2025 batch capture..." -ForegroundColor Yellow
Write-Host "Script: $scriptPath" -ForegroundColor Gray
Write-Host ""

Push-Location $root
try {
    node $scriptPath --outDir (Join-Path $root "data\blave") --profileDir (Join-Path $root ".profile") --channel msedge --noManual --waitMs 60000
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Batch capture completed!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Read-Host 'Press Enter to exit'
