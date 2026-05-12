# 交易提示字自動化系統

## 專案說明

本系統專注於 **Blave 平台的數據抓取**，配合 **網路搜索** 和 **TradingView Volume Profile**，提供完整的交易分析數據。

## 🎯 核心模式：混合模式（Hybrid Mode）

本系統採用 **混合模式**，結合三大數據來源：

| 數據來源 | 用途 | 優點 |
|---------|------|------|
| **Blave** | 深度結構化數據 | 籌碼集中度、巨鯨追蹤、OI失衡 |
| **網路搜索** | 最新即時資訊 | 最新價格、新聞、市場情緒 |
| **TradingView** | Volume Profile | POC/VAH/VAL 技術位 |

**👉 詳細工作流程請參考：[docs/05_完整工作流程指南.md](./docs/05_完整工作流程指南.md)**

---

## 架構

- **Blave** - 主要數據來源（10項任務）
- **TradingView** - Volume Profile (POC/VAH/VAL)
- **網路搜索** - 補充數據（最新優先）

---

## 可用的 npm scripts

### Blave 數據（10項任務）

```bash
# 高優先級（推薦先執行）
npm run capture:blave:toptrader:position        # Blave頂尖交易員-部位
npm run capture:blave:holder_concentration:overview  # 籌碼集中度-總覽
npm run capture:blave:whale_hunter:overview    # 巨鯨警報-總覽

# 中優先級
npm run capture:blave:market_sentiment:overview  # 市場情緒-總覽
npm run capture:blave:taker_intensity:overview   # 多空力道-總覽
npm run capture:blave:oi_imbalance:overview      # OI失衡-總覽
npm run capture:blave:liquidation:overview       # 爆倉-總覽

# 低優先級
npm run capture:blave:funding_rate:overview     # 資金費率-總覽
npm run capture:blave:funding_rate:history      # 資金費率-歷史
npm run capture:blave:squeeze_momentum:history   # 擠壓動能-歷史
```

### TradingView Volume Profile

```bash
npm run capture:tradingview:volume_profile
```

---

## 快速啟動

### 方法 1：【您手動執行】Blave 數據抓取

您可以選擇以下任一方式：

**選項 A：批次抓取（快速，但可能失敗）**
```powershell
.\scripts\抓取數據腳本\blave_all.ps1
```

**選項 B：個別任務執行（推薦，更穩定）**
```powershell
# 高優先級任務（建議先執行）
npm run capture:blave:toptrader:position
npm run capture:blave:holder_concentration:overview
npm run capture:blave:whale_hunter:overview

# 中優先級（可選）
npm run capture:blave:market_sentiment:overview
npm run capture:blave:taker_intensity:overview
npm run capture:blave:oi_imbalance:overview
npm run capture:blave:liquidation:overview

# 低優先級（可選）
npm run capture:blave:funding_rate:overview
npm run capture:blave:funding_rate:history
npm run capture:blave:squeeze_momentum:history
```

**選項 C：跳過 Blave 抓取，只用網路搜索**
- 如果 Blave 抓取一直失敗，可以跳過 Blave 數據
- 直接使用網路搜索進行分析
- 提示詞仍可正常執行，Blave 數據會標註 N/A

### 方法 2：網路搜索（最快）

直接告訴 AI：
- "幫我搜索最新 BTC/ETH 價格"
- "幫我搜索今天的加密貨幣市場新聞"

---

## 提示詞

在 `prompts/` 目錄下有五種風格：

- **終極SMC版.md** - ⭐ 推薦使用（20年經驗 + 量化掃描 + 混合模式）
- **混合模式_穩健版.md** - 結合網路搜索 + Blave 數據，保守穩健
- **全方位分析.md** - 適用於完整數據
- **穩健版.md** - 精簡版，快速分析
- **高盈虧版.md** - 激進策略

---

## 工作流程

詳細的完整工作流程請參考 **[WORKFLOW_GUIDE.md](./WORKFLOW_GUIDE.md)**，包含：

- ✅ 混合模式詳細說明
- ✅ 完整工作流程步驟
- ✅ Blave 任務優先級清單
- ✅ 網路搜索關鍵字推薦
- ✅ 提示詞撰寫要點
- ✅ 故障排除指南

---

## 輸出檔案

Blave 數據抓取後，輸出至 `data/` 目錄：

```
data/
├── blave/                          # Blave 抓取腳本輸出（每次清空）
│   └── blave_top_trader_position_YYYY-MM-DD_HHMMSS/
│       ├── blave_top_trader_position_raw.json
│       ├── blave_top_trader_position_parsed.json
│       ├── blave_top_trader_position_top5.json
│       ├── page_full.png
│       └── ...
└── search_out/                     # 手動保存的搜索結果和分析報告
```

### 手動保存搜索結果（可選）

如果需要保存網路搜索結果，可手動保存到 `data/search_out/` 目錄：

1. 使用 `data/search_out/範例_搜索結果保存格式_2026-05-05.md` 作為模板
2. 複製模板文件，重命名為您的標題（如：`BTC價格查詢_2026-05-05.md`）
3. 將搜索結果貼上並保存

**文件名格式建議**：`{標題}_{YYYY-MM-DD_HHmmss}.md`

---

## 注意事項

1. **Blave 需要登入** - 首次使用需手動登入 Blave
2. **網路搜索最新優先** - 永遠優先使用網路搜索獲取最新價格
3. **風險控制** - 永遠設置止損，不要過度槓桿
4. **中文路徑問題** - 使用根目錄腳本，避免中文子目錄

---

## 快速參考

| 動作 | 命令 |
|-----|------|
| 快速開始 | `.\quick_start.ps1` |
| 保存報告 | `npm run save:report` 或 `.\scripts\save_report.ps1` |
| 看工作流程 | 打開 `docs/05_完整工作流程指南.md` |

---

**最後更新：2026-05-05 (UTC+8) - 新增 search_out 手動保存說明**
