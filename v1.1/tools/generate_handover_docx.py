"""
⚠️  此腳本已棄用 (Deprecated) ⚠️

原因：
1. 此腳本引用的舊版檔案結構已不存在
2. 專案已重構，所有檔案已重新組織
3. 不再需要自動生成交接文件

如果需要建立交接文件，請手動編輯 docs/02_專案交接手冊.md

最後更新：2026-05-05
"""

import sys
from pathlib import Path


def main() -> None:
    print("=" * 60)
    print("⚠️  此腳本已棄用 (Deprecated) ⚠️")
    print("=" * 60)
    print()
    print("原因：")
    print("1. 此腳本引用的舊版檔案結構已不存在")
    print("2. 專案已重構，所有檔案已重新組織")
    print("3. 不再需要自動生成交接文件")
    print()
    print("如果需要建立交接文件，請手動編輯：")
    print("  docs/02_專案交接手冊.md")
    print()
    print("=" * 60)
    sys.exit(1)


if __name__ == "__main__":
    main()
