$ErrorActionPreference = "Stop"

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Blave Automation System" -ForegroundColor Cyan
Write-Host "Main Launcher" -ForegroundColor Cyan
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
Write-Host "Blave Data Capture (10 Tasks)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$tasks = @(
    "blave:toptrader:position",
    "blave:holder_concentration:overview",
    "blave:whale_hunter:overview",
    "blave:market_sentiment:overview",
    "blave:taker_intensity:overview",
    "blave:liquidation:overview",
    "blave:funding_rate:overview",
    "blave:funding_rate:history",
    "blave:oi_imbalance:overview",
    "blave:squeeze_momentum:history"
)

$totalTasks = $tasks.Count
$currentTask = 0

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$scriptPath = Join-Path $root "scripts\run.ps1"

foreach ($task in $tasks) {
    $currentTask++
    $progress = [math]::Round(($currentTask / $totalTasks) * 100, 0)
    
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Gray
    Write-Host "Progress: $currentTask/$totalTasks ($progress%)" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Running task: $task" -ForegroundColor Yellow
    Write-Host ""
    
    & $scriptPath -Task $task -NoManual -WaitMs 60000 -Script "src\blave_capture.mjs"
    
    Write-Host ""
    Write-Host "Completed: $task" -ForegroundColor Green
    Write-Host ""
    Start-Sleep -Seconds 2
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "All tasks completed! (100%)" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Read-Host "Press Enter to exit"
