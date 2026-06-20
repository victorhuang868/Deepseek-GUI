# TUI vs GUI 功能差距报告

> 自动生成于 2026-06-20 14:56:06 · CodeWhale v0.8.62

## 摘要

| 维度 | TUI | GUI | 差距 |
|------|-----|-----|------|
| HTTP 路由（TUI 已注册） | 51 | GUI 调用 17 条 | API 不匹配 1 |
| 斜杠命令 | 72 | 78 | TUI 独有 0 |

## GUI 调用但 TUI 未注册的路由（需修复 client 或补 TUI）

- `/v1/fleet/workers`

## 可选 HTTP（optionalHttp.ts，新版 sidecar 专用，v0.8.62 404 降级）

- `/v1/jobs`
- `/v1/rlm/sessions`
- `/v1/subagents`

## TUI 有、GUI 未实现的斜杠命令

- （无）

## GUI 独有斜杠命令（TUI usage 未收录）

- `/doctor`
- `/exec`
- `/fleet`
- `/pr`
- `/terminal`
- `/vim`

## 开发建议

1. **API 不匹配**：优先改 `client.ts` 对齐现有 TUI 路由，或在 CodeWhale 补路由后重新编译 sidecar。
2. **斜杠命令**：按 `docs/GUI-TUI-ROADMAP.md` 优先级在 GUI 补齐。
3. **每次 TUI 升级后**运行 `dev-workflow.ps1 compare-gap` 刷新本报告。
