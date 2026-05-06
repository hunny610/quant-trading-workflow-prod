# 交易分析報告保存輔助工具
# 用途：協助用戶將網路搜索結果和分析報告保存到正確的位置

param(
    [Parameter(Mandatory=$false)]
    [string]$Title = "市場分析報告"
)

$ErrorActionPreference = "Stop"

# 獲取當前腳本所在目錄
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$SearchOutDir = Join-Path $ProjectRoot "data\search_out"

# 確保目錄存在
if (-not (Test-Path $SearchOutDir)) {
    New-Item -ItemType Directory -Path $SearchOutDir -Force | Out-Null
    Write-Host "✅ 已創建目錄: $SearchOutDir"
}

# 生成時間戳 (UTC+8)
$now = [System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId((Get-Date), "Taipei Standard Time")
$timestamp = $now.ToString("yyyy-MM-dd_HHmmss")

# 生成文件名
$safeTitle = $Title -replace '[<>:"/\\|?*]', '_'
$fileName = "${safeTitle}_${timestamp}.md"
$filePath = Join-Path $SearchOutDir $fileName

# 創建模板內容
$templateContent = @"
# $Title

**生成時間**: $($now.ToString("yyyy-MM-dd HH:mm:ss")) (UTC+8)

---

## 📊 市場數據摘要

### 最新價格
| 代幣 | 價格 | 24h漲跌 | 來源 |
|-----|------|---------|------|
| BTC | | | |
| ETH | | | |
| SOL | | | |
| XRP | | | |
| BNB | | | |

### 市場新聞
- (請在此處貼上市場新聞摘要)

---

## 📈 Blave 數據摘要 (如有)

- 籌碼集中度: N/A
- 頂尖交易員部位: N/A
- 巨鯨警報: N/A
- OI失衡: N/A
- 資金費率: N/A

---

## 🎯 分析報告

### 市場環境分級
- 低風險吸籌 / 中風險震盪 / 高風險出清

### 交易機會

| 代幣 | 方向 | 入場 | 止盈 | 止損 | R:R | 3D評分 |
|-----|------|------|------|------|-----|--------|
| | | | | | | |

---

## 📝 附註

(請在此處添加其他備註)

---

**風險免責聲明**: 這是教育性分析，不是財務建議。請務必做好自己的風險管理。
"@

# 寫入文件
$templateContent | Out-File -FilePath $filePath -Encoding UTF8

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                    📄 報告模板已創建                         ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "📁 文件位置: $filePath" -ForegroundColor Green
Write-Host ""
Write-Host "💡 使用說明:" -ForegroundColor Yellow
Write-Host "   1. 打開上述文件"
Write-Host "   2. 填入網路搜索結果和分析報告"
Write-Host "   3. 保存文件"
Write-Host ""
Write-Host "🔗 快捷命令:" -ForegroundColor Magenta
Write-Host "   打開文件: notepad.exe `"$filePath`""
Write-Host ""

# 嘗試打開文件
try {
    Start-Process notepad.exe -ArgumentList "`"$filePath`""
    Write-Host "✅ 已自動打開文件" -ForegroundColor Green
} catch {
    Write-Host "⚠️  無法自動打開文件，請手動打開" -ForegroundColor Yellow
}
