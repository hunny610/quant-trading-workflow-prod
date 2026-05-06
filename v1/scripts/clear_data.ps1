$ErrorActionPreference = "Stop"

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$dataDir = Join-Path $root "data\blave"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "清空 data/blave 目錄" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if (Test-Path $dataDir) {
    Write-Host "正在清空: $dataDir" -ForegroundColor Yellow
    
    $items = Get-ChildItem $dataDir -ErrorAction SilentlyContinue
    if ($items) {
        Write-Host "找到 $($items.Count) 個項目" -ForegroundColor Gray
        Remove-Item -Path "$dataDir\*" -Recurse -Force
        Write-Host ""
        Write-Host "✅ 已清空 data/blave 目錄" -ForegroundColor Green
    } else {
        Write-Host "data/blave 目錄已經是空的" -ForegroundColor Gray
    }
} else {
    Write-Host "data/blave 目錄不存在" -ForegroundColor Gray
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
    Write-Host "已建立空的 data/blave 目錄" -ForegroundColor Gray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Read-Host "按 Enter 結束"
