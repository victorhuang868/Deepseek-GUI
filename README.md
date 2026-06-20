# Deepseek-GUI

Deepseek-GUI 是 DeepSeek Agent 的**桌面图形客户端**，采用 Tauri + React + TypeScript 构建，提供类似 Cursor / VS Code 的三栏 IDE 布局与多会话聊天体验。

本仓库**仅包含 GUI**。命令行 TUI 内核维护在独立项目 [CodeWhale](https://github.com/Hmbown/CodeWhale)（原 DeepSeek-TUI）。桌面版通过内置 `codewhale-tui` sidecar（兼容旧名 `deepseek-tui`）启动本地 HTTP 运行时（`deepseek serve --http`），GUI 经 SSE 与 Agent 通信。

**当前版本**：0.1.0 · 对齐 CodeWhale **v0.8.62+** sidecar · 里程碑 **M1–M7 已完成**

---

## 核心特性

| 类别 | 说明 |
|------|------|
| 多会话 | 标签式线程：新建、切换、重命名、归档；按工作区记忆上次会话 |
| 流式对话 | 实时回复、**思考（推理）块**折叠展示、工具/命令/文件变更卡片 |
| 思考块翻译 | `/translate on` 或设置 → 聊天：英文思考完成后自动译为简体中文（需 API Key） |
| 三栏 IDE | 文件树 · 代码编辑 · 聊天；可拖拽分栏、折叠侧栏与顶栏 |
| Markdown 预览 | README / `.md` / `.mdc` 支持 **Preview / Markdown** 切换（对齐 Cursor，`Ctrl+Shift+V`） |
| 审批与安全 | 工具/命令执行前弹窗；信任模式、自动批准、YOLO 模式 |
| @ 引用 | 输入 `@` 补全工作区文件；粘贴图片写入附件目录 |
| 消息队列 | `/queue` 排队、`/stash` 暂存；回合结束后自动发送，按线程持久化 |
| 斜杠命令 | **74+** 条，与 TUI 对齐（`/help` 查看；含 `/theme` `/fleet` `/terminal` `/doctor` 等） |
| 扩展面板 | 任务、自动化、技能 install/uninstall、MCP、Fleet、RLM、子代理、历史会话 |
| 编辑器 | CodeMirror 6、LSP 补全/诊断、Tab AI 补全、Vim Composer（`/vim`）、外部编辑器 |
| 集成终端 | 底部 PTY Dock（`/terminal`），xterm.js |
| 命令面板 | `Ctrl/Cmd+K` 模糊搜索命令与视图 |
| 配置中心 | API Key、Base URL、连接测试、多套 Profile、Onboarding 向导 |

---

## 界面概览

```
┌──────────┬────────────────────────────┬─────────────────────┐
│  文件树   │  编辑器（多标签 + Markdown    │  聊天 / 设置 / 任务   │
│  搜索     │  Preview）+ LSP             │  斜杠命令 / 审批      │
├──────────┴────────────────────────────┴─────────────────────┤
│  可选：底部集成终端（/terminal）  ·  状态栏（模型/Token/费用）      │
└─────────────────────────────────────────────────────────────┘
```

---

## 常用快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl/Cmd+K` | 命令面板 |
| `Ctrl/Cmd+S` | 保存当前编辑器文件 |
| `Ctrl+Shift+V` | Markdown：Preview ↔ 源码（`.md` / README） |
| `Ctrl+Shift+E` | Composer 内容在外部编辑器打开 |
| `Enter` | 发送消息（Composer） |
| `Shift+Enter` | 换行 |
| `Esc` | Vim 模式下 Composer 回到 Normal |

更多命令见聊天输入 `/help` 或命令面板。

---

## 架构概览

```
┌─────────────────────────────────────────────────────────┐
│                    Deepseek-GUI (本仓库)                  │
│  React 前端  ←→  Tauri 壳 (Rust)  ←→  文件系统 / PTY / LSP │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTP + SSE
                           ▼
┌─────────────────────────────────────────────────────────┐
│         codewhale-tui sidecar (CodeWhale v0.8.62+)       │
│                   deepseek serve --http                 │
└─────────────────────────────────────────────────────────┘
```

- **前端**：Vite + React 19；CodeMirror 6；marked + DOMPurify 渲染 Markdown；xterm 终端
- **Tauri 壳**：窗口、配置、LSP 桥接、PTY、翻译 API、技能安装、Doctor 等
- **Sidecar**：打包时将 `codewhale-tui` 打入安装目录，由 GUI 拉起 HTTP 运行时

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面 | Tauri 2.x、Rust 1.88+ |
| 前端 | React 19、TypeScript、Vite 6 |
| 编辑器 | CodeMirror 6、LSP Client、highlight.js |
| 终端 | @xterm/xterm |
| 运行时 | CodeWhale / codewhale-tui（OpenAI 兼容 HTTP + SSE） |

---

## 环境要求

| 依赖 | 版本/说明 |
|------|-----------|
| Node.js | 20+ |
| Rust | 1.88+（stable，禁止 nightly feature） |
| TUI 源码 | 克隆 [CodeWhale](https://github.com/Hmbown/CodeWhale) 用于编译 sidecar |
| Windows 额外 | MinGW64 + GNU 工具链（若使用 `x86_64-pc-windows-gnu`） |

---

## 开发流程（标准顺序）

```
GitHub CodeWhale  →  E:/Coding/CodeWhale  →  DeekSeel-TUI-GUI/Deepseek-GUI  →  Deepseek-GUI-git  →  GitHub
```

> 一体化工作区含 `CodeWhale/`、`Deepseek-GUI/`、`Deepseek-GUI-git/`。详见根目录 [README.workspace.md](../README.workspace.md)。

| 步骤 | 命令 |
|------|------|
| 1. 更新 TUI | `.\scripts\dev-workflow.ps1 update-codewhale` |
| 2. 对比 TUI/GUI 差距 | `.\scripts\dev-workflow.ps1 compare-gap` |
| 3. 改代码并打包 | `.\scripts\build-release.ps1` |
| 4. 同步到 Git 仓库 | `.\scripts\dev-workflow.ps1 sync-gui-git` |
| 5. 上传 GitHub | `.\scripts\dev-workflow.ps1 publish -Message "说明"` |
| 6. 清理无关文件 | `.\scripts\dev-workflow.ps1 cleanup-workspace` |

快捷：`pull-all`（1+2）；`publish -Message`（4+5）；`full-cycle -Message`（全流程）。

**注意**：`deepseek`（CLI 分发器）与 `deepseek-tui`（TUI 运行时）为两个独立安装物；改 `crates/tui` 后需同时 `cargo install` 两者，否则 sidecar 可能仍是旧版。

---

## 快速开始

### 1. 克隆本仓库

```bash
git clone https://github.com/victorhuang868/Deepseek-GUI.git
cd Deepseek-GUI
npm install
```

### 2. 准备 sidecar（CodeWhale）

```bash
# 工作区已含 CodeWhale/ 时可跳过
git clone https://github.com/Hmbown/CodeWhale.git ../CodeWhale
cd ../CodeWhale && cargo build --release -p codewhale-tui-cli
# 将 codewhale-tui 复制到 Deepseek-GUI/src-tauri/bin/
```

### 3. 开发模式

```bash
cd Deepseek-GUI
npm run tauri:dev
```

首次启动若无 API Key 会弹出 **Onboarding** 引导配置。

---

## 构建安装包

### Windows

```powershell
.\scripts\build-release.ps1
```

流程：编译 `codewhale-tui` → `npm run build` → 复制 sidecar → `tauri build`（NSIS + MSI）。

### macOS / Linux

```bash
export CODEWHALE_ROOT=../CodeWhale
chmod +x scripts/build-release.sh
./scripts/build-release.sh
```

### 产物路径

| 平台 | 位置 |
|------|------|
| Windows 可执行文件 | `src-tauri/target/release/deepseek-gui.exe` |
| Windows 安装包 | `src-tauri/target/release/bundle/{nsis,msi}/` |
| macOS | `src-tauri/target/release/bundle/dmg/` |

---

## GitHub Actions 云端打包

推送 `main` 后，[Actions](https://github.com/victorhuang868/Deepseek-GUI/actions) 工作流 **Deepseek GUI Build** 会 checkout 本仓库与 CodeWhale、编译 sidecar 并构建安装包。

Artifacts：`deepseek-gui-windows-x64`（NSIS/MSI）、`deepseek-gui-macos-arm64`（DMG）。也可手动 **Run workflow**。

---

## 目录结构

```
Deepseek-GUI/
├── src/                      React 前端
│   ├── api/                  HTTP/SSE 客户端、Tauri 命令桥接
│   ├── components/           UI（聊天、编辑器、设置、Fleet…）
│   ├── hooks/                会话、LSP、Composer Vim 等
│   ├── state/                useConversation、队列缓存
│   └── utils/                斜杠命令、翻译、Markdown 路径判定
├── src-tauri/                Tauri Rust 后端
│   ├── src/                  main、PTY、LSP、translate、skill_install…
│   └── bin/                  sidecar 占位（构建时写入，不提交 git）
├── scripts/                  build-release、dev-workflow、compare-gap
├── docs/                     GUI-TUI-ROADMAP、TUI-GUI-GAP 报告
├── GUI-CHANGELOG.md          开发变更记录（001 起，中文）
└── .github/workflows/        CI 打包
```

---

## 与 CodeWhale 的关系

| 项目 | 仓库 | 角色 |
|------|------|------|
| **Deepseek-GUI** | [victorhuang868/Deepseek-GUI](https://github.com/victorhuang868/Deepseek-GUI) | 桌面图形界面 |
| **CodeWhale** | [Hmbown/CodeWhale](https://github.com/Hmbown/CodeWhale) | Agent 内核、TUI CLI、sidecar 二进制 |

两者分仓：GUI 不含 TUI 源码；本地/CI 从 CodeWhale 编译 sidecar 并打入安装包。功能差距报告：`python scripts/compare-gap.py` → `docs/TUI-GUI-GAP.md`。

---

## 文档索引

| 文件 | 说明 |
|------|------|
| [GUI-CHANGELOG.md](./GUI-CHANGELOG.md) | **GUI 开发变更记录**（001 起，逐条功能说明） |
| [docs/GUI-TUI-ROADMAP.md](./docs/GUI-TUI-ROADMAP.md) | GUI 对齐 TUI 路线图（M1–M7 已落地，后续维护模式） |
| [docs/TUI-GUI-GAP.md](./docs/TUI-GUI-GAP.md) | 自动生成的斜杠命令 / HTTP API 差距报告 |
| [README.workspace.md](../README.workspace.md) | 一体化工作区三目录说明 |

**CHANGELOG 勿混淆**：CodeWhale 仓库根目录 `CHANGELOG.md` 为 **TUI 英文发版日志**，与 GUI 无关。

---

## 许可证

与 [CodeWhale](https://github.com/Hmbown/CodeWhale) 相同（MIT）。详见上游 `LICENSE`。
