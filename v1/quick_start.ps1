$ErrorActionPreference = "Stop"

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Blave Automation System" -ForegroundColor Cyan
Write-Host "Quick Start" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Please select an option:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  [1] Batch Capture (fast - open all pages first)" -ForegroundColor Green
Write-Host "  [2] View npm scripts" -ForegroundColor Green
Write-Host "  [0] Exit" -ForegroundColor Gray
Write-Host ""

$choice = Read-Host "Enter option (0-2)"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

if ($choice -eq "1") {
    Write-Host ""
    Write-Host "Starting Batch Capture (fast mode)..." -ForegroundColor Yellow
    & (Join-Path $root "scripts\抓取數據腳本\blave_all.ps1")
}
elseif ($choice -eq "2") {
    Write-Host ""
    Write-Host "Available npm scripts:" -ForegroundColor Cyan
    Write-Host ""
    npm run
    Write-Host ""
    Read-Host "Press Enter to continue"
}
elseif ($choice -eq "0") {
    Write-Host ""
    Write-Host "Goodbye!" -ForegroundColor Gray
}
else {
    Write-Host ""
    Write-Host "Invalid option!" -ForegroundColor Red
    Read-Host "Press Enter to continue"
}
