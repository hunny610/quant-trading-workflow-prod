# Quant Trading Workflow Prod

量化交易與自動化提示字工作流程生產版。

## 專案結構

- `v1.2/prompts/`: 包含各類交易策略提示字（全方位分析、穩健版、SMC 版等）。
- `v1.2/src/`: 自動化數據抓取腳本，基於 Playwright 實作。
  - `providers/`: 不同的數據來源提供者（如 Blave）。
  - `blave_capture.mjs`: Blave 數據抓取主程式。
- `v1.2/tools/`: 輔助工具，如交付文件生成器。

## 使用說明

1. 進入 `v1.2` 目錄。
2. 安裝依賴：`npm install`。
3. 執行抓取腳本：`node src/blave_capture.mjs`。

## 技術棧

- Node.js
- Playwright (自動化瀏覽器操作)
- Python (工具腳本)
