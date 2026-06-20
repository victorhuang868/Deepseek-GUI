# -*- coding: utf-8 -*-
"""删除 DeekSeel-TUI-GUI 根目录中与 CodeWhale 重复的 TUI 文件，仅保留 GUI 工作区。"""
from __future__ import annotations

import shutil
from pathlib import Path

WORKSPACE = Path(r"E:\Coding\DeekSeel-TUI-GUI")
CODEWHALE = Path(r"E:\Coding\CodeWhale")

# 工作区必须保留的目录/文件（非 CodeWhale 副本）
KEEP_NAMES = {
    "Deepseek-GUI",
    ".cursor",
    "README.workspace.md",  # 工作区说明（新建）
}


def main() -> None:
    removed: list[str] = []
    kept: list[str] = []

    for item in sorted(WORKSPACE.iterdir(), key=lambda p: p.name.lower()):
        name = item.name
        if name in KEEP_NAMES:
            kept.append(name)
            continue
        # 删除与 CodeWhale 重复或历史遗留的 TUI 树
        if item.is_dir():
            shutil.rmtree(item, ignore_errors=False)
        else:
            item.unlink(missing_ok=True)
        removed.append(name)

    # 写入工作区说明
    readme = WORKSPACE / "README.workspace.md"
    readme.write_text(
        """# DeekSeel-TUI-GUI 工作区

本目录**仅用于 Deepseek-GUI 开发**，不再复制 CodeWhale TUI 源码。

| 路径 | 说明 |
|------|------|
| `Deepseek-GUI/` | GUI 源码（唯一开发目录） |
| `E:\\Coding\\CodeWhale` | TUI 上游克隆（sidecar 编译来源） |
| `E:\\Coding\\Deepseek-GUI-git` | GUI Git 仓库 → GitHub |

开发流程见 `Deepseek-GUI/README.md` 与 `.cursor/rules/gui-dev-workflow.mdc`。
""",
        encoding="utf-8",
    )

    print(f"保留: {', '.join(kept + ['README.workspace.md'])}")
    print(f"已删除 {len(removed)} 项:")
    for n in removed:
        print(f"  - {n}")


if __name__ == "__main__":
    main()
