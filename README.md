# Deepseek-GUI

Deepseek-GUI 是 DeepSeek Agent 的**桌面图形客户端**，采用 Tauri + React + TypeScript 构建，提供类似 IDE 的三栏布局与多会话聊天体验。

本仓库**仅包含 GUI**。命令行 TUI 内核维护在独立项目 [CodeWhale](https://github.com/Hmbown/CodeWhale)（原 DeepSeek-TUI）。桌面版通过内置 `deepseek-tui` sidecar 启动本地 HTTP 运行时（`deepseek serve --http`），GUI 经 SSE 与 Agent 通信。

---

## 核心特性

| 类别 | 说明 |
|------|------|
| 多会话 | 标签式线程管理：新建、切换、重命名、归档与恢复 |
| 流式对话 | 实时展示回复、推理（思考）块、工具调用与命令执行卡片 |
| 三栏 IDE | 文件树 · 代码编辑 · 聊天面板，支持拖拽分栏与顶栏折叠 |
| 审批流 | 工具/命令执行前弹窗确认，支持「记住选择」 |
| @ 引用 | 输入 `@` 补全工作区文件路径；粘贴图片自动写入附件目录 |
| 斜杠命令 | `/compact`、`/fork`、`/review`、`/diff`、`/sessions`、`/help` 等 |
| 扩展能力 | 任务/自动化、技能开关、MCP 状态、历史会话搜索 |
| 命令面板 | `Ctrl/Cmd+K` 模糊搜索命令与视图切换 |
| 配置中心 | API Key、Base URL、连接测试与多套配置档 |

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
│              deepseek-tui sidecar (来自 CodeWhale)        │
│                   deepseek serve --http                 │
└─────────────────────────────────────────────────────────┘
```

- **前端**：Vite 构建的 React 应用，CodeMirror 编辑器，xterm 终端
- **Tauri 壳**：窗口管理、配置读写、LSP 桥接、PTY
- **Sidecar**：打包时将 `deepseek-tui` 二进制打入安装目录，由 GUI 拉起运行时

---

## 技术栈

- **桌面**：Tauri 2.x、Rust
- **前端**：React 19、TypeScript、Vite 6
- **编辑器**：CodeMirror 6、LSP Client
- **终端**：xterm.js
- **运行时**：CodeWhale / deepseek-tui（HTTP + SSE API）

---

## 环境要求

| 依赖 | 版本/说明 |
|------|-----------|
| Node.js | 20+ |
| Rust | 1.88+（stable） |
| TUI 源码 | 需克隆 [CodeWhale](https://github.com/Hmbown/CodeWhale) 用于编译 sidecar |
| Windows 额外 | MinGW64 + GNU 工具链（若使用 `x86_64-pc-windows-gnu`） |

---

## 快速开始

### 1. 克隆本仓库

```bash
git clone https://github.com/victorhuang868/Deepseek-GUI.git
cd Deepseek-GUI
npm install
```

### 2. 克隆 TUI 仓库（sidecar 来源）

```bash
# 与本仓库同级目录即可，或通过环境变量指定路径
git clone https://github.com/Hmbown/CodeWhale.git ../CodeWhale
```

### 3. 开发模式

```bash
# 需先在 CodeWhale 目录编译 TUI，并将 deepseek-tui 放入 src-tauri/bin/
npm run tauri:dev
```

---

## 构建安装包

### Windows（一键脚本）

```powershell
$env:CODEWHALE_ROOT = "E:\Coding\CodeWhale"   # 指向 TUI 克隆目录
.\scripts\build-release.ps1
```

脚本流程：编译 `deepseek-tui` → 构建前端 → 复制 sidecar → `tauri build`（NSIS + MSI）。

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

推送至 `main` 分支后，[Actions](https://github.com/victorhuang868/Deepseek-GUI/actions) 工作流 **Deepseek GUI Build** 会自动：

1. Checkout 本仓库与 CodeWhale
2. 编译 `deepseek-tui` sidecar
3. 构建 Tauri 安装包（Windows NSIS / macOS DMG）

可在 Actions 页面下载 artifact：

- `deepseek-gui-macos-arm64` — DMG
- `deepseek-gui-windows-x64` — NSIS / MSI

也可手动触发：**Actions → Deepseek GUI Build → Run workflow**。

---

## 目录结构

```
Deepseek-GUI/
├── src/                    React 前端
│   ├── api/                HTTP/SSE 客户端、Tauri 桥接
│   ├── components/         UI 组件
│   ├── hooks/              面板、编辑器、LSP 等 Hook
│   └── styles.css          全局样式
├── src-tauri/              Tauri Rust 后端
│   ├── src/                主进程、PTY、LSP、配置桥接
│   └── bin/                sidecar 占位（构建时写入，不提交 git）
├── scripts/                本地 release 构建脚本
└── .github/workflows/      CI 打包工作流
```

---

## 与 CodeWhale 的关系

| 项目 | 仓库 | 角色 |
|------|------|------|
| **Deepseek-GUI** | 本仓库 | 桌面图形界面 |
| **CodeWhale** | [Hmbown/CodeWhale](https://github.com/Hmbown/CodeWhale) | Agent 内核、TUI CLI、`deepseek-tui` 二进制 |

两者分仓维护：GUI 不包含 TUI 源码，打包与 CI 时从 CodeWhale 编译 sidecar 并打入安装包。

---

## 文档说明

本地若使用 **TUI + GUI 合在一起** 的目录（例如 DeekSeel-TUI-GUI），下列 CHANGELOG **不要搞混**：

| 文件 | 所属 | 语言 | 说明 |
|------|------|------|------|
| **Deepseek-GUI/GUI-CHANGELOG.md**（本目录下） | GUI | 中文 | GUI 开发变更记录（001 起） |
| **CHANGELOG.md**（仓库根目录 `../CHANGELOG.md`） | CodeWhale TUI | 英文 | 上游 TUI 发版日志（如 v0.8.x），**与 GUI 无关** |

独立 GUI 仓库 [victorhuang868/Deepseek-GUI](https://github.com/victorhuang868/Deepseek-GUI) 根目录仅有 GUI 的中文 GUI-CHANGELOG.md，不含 TUI 英文发版日志。

---

## 许可证

本项目遵循与 [CodeWhale](https://github.com/Hmbown/CodeWhale) 相同的开源许可（MIT）。详见上游仓库 `LICENSE`。

---

开发变更记录：[GUI-CHANGELOG.md](./GUI-CHANGELOG.md)
