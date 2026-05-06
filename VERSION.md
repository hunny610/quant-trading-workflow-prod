# 版本說明

## v1.1 (2026-05-06)

### 新增功能
- **capture_utils.mjs** - 工具函式庫（JSON 寫入、API 資料抓取、頁面資料保存）
- **providers/** - 模組化提供者結構（Blave tasks、client）
- **package.json** - 新增 `high` 和 `go` 腳本
- **Blave批次抓取.ps1** - PowerShell 批次腳本
- **精簡版 README** - 更簡潔的快速開始說明

### 目錄結構
```
v1.1/
├── docs/              # 文件（同 v1）
├── prompts/           # 提示詞（同 v1）
├── src/
│   ├── providers/     # 模組化提供者（新增）
│   ├── capture_utils.mjs  # 工具函式（新增）
│   └── ... （其他同 v1）
├── tools/             # 工具（同 v1）
├── Blave批次抓取.ps1  # 新增
└── ... （其他同 v1）
```

---

## v1 (2026-05-05)

### 功能
- 完整的文件說明和工作流程指南
- Blave 數據抓取（10 項任務）
- 完整的 scripts/ 目錄
- quick_start.ps1 快速啟動腳本

### 目錄結構
```
v1/
├── docs/              # 完整文件
├── prompts/           # 提示詞
├── scripts/           # PowerShell 腳本
├── src/               # 原始碼
├── tools/             # 工具
└── quick_start.ps1
```

---

## 版本差異比較

| 項目 | v1 | v1.1 |
|-----|----|------|
| scripts/ 目錄 | ✅ | ❌ |
| quick_start.ps1 | ✅ | ❌ |
| capture_utils.mjs | ❌ | ✅ |
| providers/ 目錄 | ❌ | ✅ |
| Blave批次抓取.ps1 | ❌ | ✅ |
| npm run high | ❌ | ✅ |
| npm run go | ❌ | ✅ |
