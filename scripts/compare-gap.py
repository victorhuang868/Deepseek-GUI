#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""对比 CodeWhale TUI 与 Deepseek-GUI 的功能/API 差距，输出 Markdown 报告。"""

from __future__ import annotations

import re
import sys
from datetime import datetime
from pathlib import Path


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def extract_tui_routes(runtime_api: Path) -> set[str]:
    """从 runtime_api.rs 提取已注册的 HTTP 路由前缀。"""
    text = read_text(runtime_api)
    routes: set[str] = set()
    for m in re.finditer(r'\.route\(\s*"([^"]+)"', text):
        routes.add(m.group(1))
    return routes


def extract_gui_api_paths(client_ts: Path) -> set[str]:
    """从 client.ts 提取 GUI 调用的 /v1/* 路径模板。"""
    text = read_text(client_ts)
    paths: set[str] = set()
    for m in re.finditer(r"/v1/[a-z][a-z0-9_/-]*", text):
        p = re.sub(r"\$\{[^}]+\}", "{id}", m.group(0))
        paths.add(p.rstrip("/"))
    return paths


def normalize_gui_path(p: str) -> str:
    """将 GUI 路径模板映射为 TUI 路由匹配键。"""
    return p.replace("${encodeURIComponent(", "{").replace(")}", "}")


def gui_path_matches_tui(gui_path: str, tui_routes: set[str]) -> bool:
    """判断 GUI API 是否在 TUI 路由表中有对应项。"""
    # 审批：GUI 可能提取 /v1/approvals 前缀
    if gui_path == "/v1/approvals":
        return any(r.startswith("/v1/approvals/") for r in tui_routes)
    # user-input：GUI 提取为 /v1/user-input 前缀
    if gui_path == "/v1/user-input" or gui_path.startswith("/v1/user-input/"):
        return any("/v1/user-input/" in r for r in tui_routes)
    # 直接匹配
    if gui_path in tui_routes:
        return True
    if "/threads/{id}/snapshots" in gui_path:
        return "/v1/snapshots" in tui_routes
    # 带参数的泛化匹配
    base = re.sub(r"\{[^}]+\}", "{id}", gui_path)
    for r in tui_routes:
        rb = re.sub(r"\{[^}]+\}", "{id}", r)
        if base == rb or base.startswith(rb.rstrip("{id}")):
            return True
    return False


def extract_tui_slash(groups_dir: Path) -> set[str]:
    """从 commands/groups 的 usage 字段提取 TUI 斜杠命令名。"""
    names: set[str] = set()
    for f in groups_dir.rglob("mod.rs"):
        for m in re.finditer(r'usage:\s*"/([a-z0-9_-]+)', read_text(f), re.I):
            names.add(m.group(1).lower())
    return names


def extract_gui_slash(slash_ts: Path) -> set[str]:
    """从 slashCommands.ts 提取 GUI 斜杠命令名。"""
    text = read_text(slash_ts)
    names: set[str] = set()
    for m in re.finditer(r'name:\s*"([^"]+)"', text):
        names.add(m.group(1).lower())
    return names


def build_report(
    code_whale: Path,
    gui_root: Path,
    workspace: Path,
) -> str:
    """生成 TUI vs GUI 差距 Markdown 报告。"""
    runtime_api = code_whale / "crates" / "tui" / "src" / "runtime_api.rs"
    if not runtime_api.exists():
        raise FileNotFoundError(f"CodeWhale runtime_api 不存在: {runtime_api}")

    groups_dir = code_whale / "crates" / "tui" / "src" / "commands" / "groups"
    if not groups_dir.exists():
        raise FileNotFoundError(f"CodeWhale commands 不存在: {groups_dir}")

    tui_routes = extract_tui_routes(runtime_api)
    gui_paths = extract_gui_api_paths(gui_root / "src" / "api" / "client.ts")
    optional_path = gui_root / "src" / "api" / "optionalHttp.ts"
    optional_paths: set[str] = set()
    if optional_path.exists():
        optional_paths = extract_gui_api_paths(optional_path)
    missing_api: list[str] = []
    for p in sorted(gui_paths):
        if not gui_path_matches_tui(p, tui_routes):
            missing_api.append(p)

    tui_slash = extract_tui_slash(groups_dir)
    gui_slash = extract_gui_slash(gui_root / "src" / "utils" / "slashCommands.ts")
    slash_missing = sorted(tui_slash - gui_slash)
    slash_extra = sorted(gui_slash - tui_slash)

    # CodeWhale 版本
    version = "unknown"
    cargo = code_whale / "Cargo.toml"
    if cargo.exists():
        vm = re.search(r'^version\s*=\s*"([^"]+)"', read_text(cargo), re.M)
        if vm:
            version = vm.group(1)

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    lines = [
        "# TUI vs GUI 功能差距报告",
        "",
        f"> 自动生成于 {now} · CodeWhale v{version}",
        "",
        "## 摘要",
        "",
        f"| 维度 | TUI | GUI | 差距 |",
        f"|------|-----|-----|------|",
        f"| HTTP 路由（TUI 已注册） | {len(tui_routes)} | GUI 调用 {len(gui_paths)} 条 | API 不匹配 {len(missing_api)} |",
        f"| 斜杠命令 | {len(tui_slash)} | {len(gui_slash)} | TUI 独有 {len(slash_missing)} |",
        "",
        "## GUI 调用但 TUI 未注册的路由（需修复 client 或补 TUI）",
        "",
    ]
    if missing_api:
        for p in missing_api:
            lines.append(f"- `{p}`")
    else:
        lines.append("- （无）")

    lines += [
        "",
        "## 可选 HTTP（optionalHttp.ts，新版 sidecar 专用，v0.8.62 404 降级）",
        "",
    ]
    if optional_paths:
        for p in sorted(optional_paths):
            lines.append(f"- `{p}`")
    else:
        lines.append("- （无）")

    lines += [
        "",
        "## TUI 有、GUI 未实现的斜杠命令",
        "",
    ]
    if slash_missing:
        for c in slash_missing:
            lines.append(f"- `/{c}`")
    else:
        lines.append("- （无）")

    lines += [
        "",
        "## GUI 独有斜杠命令（TUI usage 未收录）",
        "",
    ]
    if slash_extra:
        for c in slash_extra:
            lines.append(f"- `/{c}`")
    else:
        lines.append("- （无）")

    lines += [
        "",
        "## 开发建议",
        "",
        "1. **API 不匹配**：优先改 `client.ts` 对齐现有 TUI 路由，或在 CodeWhale 补路由后重新编译 sidecar。",
        "2. **斜杠命令**：按 `docs/GUI-TUI-ROADMAP.md` 优先级在 GUI 补齐。",
        "3. **每次 TUI 升级后**运行 `dev-workflow.ps1 compare-gap` 刷新本报告。",
        "",
    ]
    return "\n".join(lines)


def _resolve_codewhale(workspace: Path) -> Path:
    """解析 CodeWhale 路径：环境变量优先，否则工作区 CodeWhale/。"""
    import os

    env = os.environ.get("CODEWHALE_ROOT")
    if env and Path(env).exists():
        return Path(env)
    return workspace / "CodeWhale"


def main() -> int:
    workspace = Path(
        sys.argv[2]
        if len(sys.argv) > 2
        else __import__("os").environ.get(
            "DEEKSEEL_WORKSPACE", str(Path(__file__).resolve().parents[2])
        )
    )
    code_whale = Path(
        sys.argv[1]
        if len(sys.argv) > 1
        else _resolve_codewhale(workspace)
    )
    gui_root = workspace / "Deepseek-GUI"
    out = gui_root / "docs" / "TUI-GUI-GAP.md"

    report = build_report(code_whale, gui_root, workspace)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(report, encoding="utf-8")
    print(f"报告已写入: {out}")
    print(report.split("\n")[8])  # 摘要表一行
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
