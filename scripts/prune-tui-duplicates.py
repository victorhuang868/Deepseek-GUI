# -*- coding: utf-8 -*-
"""删除工作区根目录中与 CodeWhale 重复的散落 TUI 文件（保留子仓库目录）。"""
from __future__ import annotations

import shutil
from pathlib import Path

# 脚本位于 Deepseek-GUI/scripts/，工作区为上两级
WORKSPACE = Path(__file__).resolve().parents[2]

# 工作区必须保留的目录/文件
KEEP_NAMES = {
    "Deepseek-GUI",
    "Deepseek-GUI-git",
    "CodeWhale",
    ".cursor",
    "README.workspace.md",
}


def main() -> None:
    removed: list[str] = []
    kept: list[str] = []

    for item in sorted(WORKSPACE.iterdir(), key=lambda p: p.name.lower()):
        name = item.name
        if name in KEEP_NAMES:
            kept.append(name)
            continue
        if item.is_dir():
            shutil.rmtree(item, ignore_errors=False)
        else:
            item.unlink(missing_ok=True)
        removed.append(name)

    print(f"保留: {', '.join(sorted(kept))}")
    if not removed:
        print("无需删除")
        return
    print(f"已删除 {len(removed)} 项:")
    for n in removed:
        print(f"  - {n}")


if __name__ == "__main__":
    main()
