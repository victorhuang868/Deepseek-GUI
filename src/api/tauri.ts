// Tauri 桥接层：封装对壳层命令的调用，并在非 Tauri（纯浏览器）环境下安全降级

import { invoke as tauriInvoke } from "@tauri-apps/api/core";

/** 判断当前是否运行在 Tauri 壳内 */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** 将 Tauri invoke 拒绝原因格式化为可读文案（reject 常为 string 而非 Error） */
export function formatInvokeError(err: unknown): string {
  if (typeof err === "string" && err.trim()) return err;
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return "未知错误";
}

/** 壳层设置信息 */
export interface ShellSettings {
  config_path: string;
  api_key_present: boolean;
}

/** 获取壳层设置（配置路径、是否已配 API Key） */
export async function getShellSettings(): Promise<ShellSettings | null> {
  if (!isTauri()) return null;
  return tauriInvoke<ShellSettings>("get_settings");
}

/** 获取后端固定 token */
export async function getRuntimeToken(): Promise<string | null> {
  if (!isTauri()) return null;
  return tauriInvoke<string>("get_runtime_token");
}

/** 保存 API Key 到 config.toml */
export async function saveApiKey(key: string): Promise<void> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  await tauriInvoke("save_api_key", { key });
}

/** 重启后端使配置生效 */
export async function restartBackend(): Promise<void> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  await tauriInvoke("restart_backend");
}

/** 完整配置（api_key 仅返回是否已配置） */
export interface AppConfig {
  config_path: string;
  api_key_present: boolean;
  base_url?: string;
  provider?: string;
  default_text_model?: string;
  reasoning_effort?: string;
  allow_shell?: boolean;
}

/** 读取当前配置 */
export async function getConfig(): Promise<AppConfig | null> {
  if (!isTauri()) return null;
  return tauriInvoke<AppConfig>("get_config");
}

/** 写入一组配置项（仅传需要修改的键） */
export async function saveConfig(patch: Record<string, unknown>): Promise<void> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  await tauriInvoke("save_config", { patch });
}

// ===================== 文件系统桥接（三栏 IDE 布局）=====================

/** 目录项 */
export interface DirEntryInfo {
  name: string;
  path: string;
  is_dir: boolean;
}

/** 文件内容 */
export interface FileContent {
  content: string;
  truncated: boolean;
  binary: boolean;
}

/** 弹出原生「选择文件夹」对话框，返回所选目录路径（取消返回 null） */
export async function pickFolder(): Promise<string | null> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  return (await tauriInvoke<string | null>("pick_folder")) ?? null;
}

/** 弹出原生「选择文件」对话框（/attach 等） */
export async function pickFile(): Promise<string | null> {
  if (!isTauri()) return null;
  return (await tauriInvoke<string | null>("pick_file")) ?? null;
}

/** 列出目录下一层条目 */
export async function listDir(path: string): Promise<DirEntryInfo[]> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  return tauriInvoke<DirEntryInfo[]>("list_dir", { path });
}

/** 读取文件内容 */
export async function readFile(path: string): Promise<FileContent> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  return tauriInvoke<FileContent>("read_file", { path });
}

/** 将文本内容写入文件（覆盖保存） */
export async function writeFile(path: string, content: string): Promise<void> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  await tauriInvoke("write_file", { path, content });
}

/** 删除指定文件或目录（目录递归删除） */
export async function deletePath(path: string): Promise<void> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  await tauriInvoke("delete_path", { path });
}

/** 新建文件（父目录不存在时自动创建） */
export async function createFile(path: string, content = ""): Promise<void> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  await tauriInvoke("create_file", { path, content: content || null });
}

/** 新建文件夹 */
export async function createDir(path: string): Promise<void> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  await tauriInvoke("create_dir", { path });
}

/** 重命名或移动文件/文件夹 */
export async function renamePath(from: string, to: string): Promise<void> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  await tauriInvoke("rename_path", { from, to });
}

/** 获取工作区 git 变更（未暂存 + 已暂存）合并文本 */
export async function gitDiff(dir: string): Promise<string> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  return tauriInvoke<string>("git_diff", { dir });
}

/** 保存附件（图片等）到工作区，返回绝对路径 */
export async function saveAttachment(
  dir: string,
  name: string,
  bytes: number[],
): Promise<string> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  return tauriInvoke<string>("save_attachment", { dir, name, bytes });
}

/**
 * 设置后端工作目录（agent 文件读写根目录）并重启后端。
 * 在「打开文件夹」或携带记忆根目录启动时调用，确保 agent 写文件落在该目录。
 */
export async function setWorkspace(path: string): Promise<void> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  await tauriInvoke("set_workspace", { path });
}

/**
 * 测试与 DeepSeek API 的连通性。
 * @param apiKey 可选，传入刚输入但未保存的 Key；不传则用已保存配置/环境变量。
 * @param baseUrl 可选，传入刚输入但未保存的 Base URL；不传则用配置/默认域名。
 * @returns 成功时返回提示文案；失败时 reject（错误信息为后端返回的中文说明）。
 */
export async function testConnection(apiKey?: string, baseUrl?: string): Promise<string> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  return tauriInvoke<string>("test_connection", {
    apiKey: apiKey || null,
    baseUrl: baseUrl || null,
  });
}

// ===================== 模型配置档案（多供应商管理）=====================

/** 档案（列表态：不含明文 Key） */
export interface ProfileInfo {
  id: string;
  name: string;
  provider: string;
  base_url: string;
  model: string;
  key_present: boolean;
  key_masked: string;
}

/** 档案列表响应 */
export interface ProfilesResult {
  active_id: string;
  profiles: ProfileInfo[];
}

/** 新增/更新档案的入参（id 为空表示新增；api_key 留空表示保持原值） */
export interface ProfileInput {
  id?: string;
  name: string;
  provider?: string;
  base_url?: string;
  model?: string;
  api_key?: string;
}

/** 列出全部档案 */
export async function listProfiles(): Promise<ProfilesResult> {
  if (!isTauri()) return { active_id: "", profiles: [] };
  return tauriInvoke<ProfilesResult>("list_profiles");
}

/** 新增或更新档案，返回档案 id */
export async function upsertProfile(profile: ProfileInput): Promise<string> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  return tauriInvoke<string>("upsert_profile", { profile });
}

/** 删除档案 */
export async function deleteProfile(id: string): Promise<void> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  await tauriInvoke("delete_profile", { id });
}

/** 设为「使用中」（写入 config.toml 并重启后端） */
export async function activateProfile(id: string): Promise<void> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  await tauriInvoke("activate_profile", { id });
}

// ===================== LSP 编辑器 IntelliSense =====================

/** LSP 会话信息（Rust 启动 language server 后返回） */
export interface LspSessionInfo {
  sessionId: string;
  languageId: string;
  rootUri: string;
  serverCommand: string;
}

/** 确保 workspace+文件 对应的 LSP 会话已启动 */
export async function lspStartSession(
  workspace: string,
  filePath: string,
): Promise<LspSessionInfo> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  return tauriInvoke<LspSessionInfo>("lsp_start_session", { workspace, filePath });
}

/** 向 LSP 会话发送 JSON-RPC（纯 JSON 字符串） */
export async function lspSend(sessionId: string, message: string): Promise<void> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  await tauriInvoke("lsp_send", { sessionId, message });
}

/** 关闭 LSP 会话 */
export async function lspStopSession(sessionId: string): Promise<void> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  await tauriInvoke("lsp_stop_session", { sessionId });
}

// ===================== Cursor Tab 风格 AI 内联补全 =====================

/** Tab 内联补全请求 */
export interface TabCompleteParams {
  filePath: string;
  prefix: string;
  suffix: string;
  languageId?: string | null;
  /** 是否让补全自动补上缺失的 import 语句 */
  autoImport?: boolean;
  /** 使用 FIM /beta/completions 端点（对齐 TUI fim_completion） */
  useFimBeta?: boolean;
}

/** 调用后端 DeepSeek API 获取光标处应插入的补全文本 */
export async function tabComplete(params: TabCompleteParams): Promise<string> {
  if (!isTauri()) return "";
  return tauriInvoke<string>("tab_complete", {
    filePath: params.filePath,
    prefix: params.prefix,
    suffix: params.suffix,
    languageId: params.languageId ?? null,
    autoImport: params.autoImport ?? false,
    useFim: params.useFimBeta ?? false,
  });
}

/** 语音 ASR：WAV base64 → 转写文本 */
export async function transcribeAudio(params: {
  wavBase64: string;
  voiceControl?: boolean;
  currentText?: string;
}): Promise<string> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  return tauriInvoke<string>("transcribe_audio", {
    wavBase64: params.wavBase64,
    voiceControl: params.voiceControl ?? false,
    currentText: params.currentText ?? null,
  });
}

/** 非交互 codewhale-tui exec */
export async function runCliExec(params: {
  prompt: string;
  auto?: boolean;
  workspace?: string;
}): Promise<string> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  return tauriInvoke<string>("run_cli_exec", {
    prompt: params.prompt,
    auto: params.auto ?? false,
    workspace: params.workspace ?? null,
  });
}

/** 从 git 生成 PR 描述预填 */
export async function generatePrPrefill(params: {
  workspace?: string;
  title?: string;
}): Promise<string> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  return tauriInvoke<string>("generate_pr_prefill", {
    workspace: params.workspace ?? null,
    title: params.title ?? null,
  });
}

/** 从 GitHub 安装社区技能（Tauri） */
export async function skillInstall(spec: string): Promise<string> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  return tauriInvoke<string>("skill_install", { spec });
}

/** 卸载已安装技能 */
export async function skillUninstall(name: string): Promise<string> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  return tauriInvoke<string>("skill_uninstall", { name });
}

// ===================== MCP / Hooks / Network 配置桥接 =====================

/** 读取 mcp.json */
export async function getMcpConfigFile(): Promise<Record<string, unknown>> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  return tauriInvoke<Record<string, unknown>>("get_mcp_config");
}

/** 保存 mcp.json */
export async function saveMcpConfigFile(doc: Record<string, unknown>): Promise<void> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  await tauriInvoke("save_mcp_config_cmd", { doc });
}

/** 初始化空 mcp.json */
export async function initMcpConfigFile(force = false): Promise<Record<string, unknown>> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  return tauriInvoke<Record<string, unknown>>("init_mcp_config_cmd", { force });
}

/** 读取 config.toml [hooks] */
export async function getHooksConfigFile(): Promise<{
  config_path: string;
  enabled: boolean;
  hooks: unknown[];
}> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  return tauriInvoke("get_hooks_config");
}

/** 保存 hooks 配置 */
export async function saveHooksConfigFile(enabled: boolean, hooks: unknown[]): Promise<void> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  await tauriInvoke("save_hooks_config_cmd", { enabled, hooks });
}

/** 读取 [network] 策略 */
export async function getNetworkConfigFile(): Promise<{
  config_path: string;
  default: string;
  allow: string[];
  deny: string[];
  audit: boolean;
}> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  return tauriInvoke("get_network_config");
}

/** 保存 network 策略 */
export async function saveNetworkConfigFile(payload: {
  default: string;
  allow: string[];
  deny: string[];
  audit: boolean;
}): Promise<void> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  await tauriInvoke("save_network_config_cmd", payload);
}

/** 读取工作区 subagents.v1.json */
export async function getSubagentState(workspace: string): Promise<{
  path: string;
  exists: boolean;
  raw: unknown;
}> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  return tauriInvoke("get_subagent_state", { workspace });
}

// ===================== Memory / Note / Anchor =====================

/** 全局用户记忆读取结果 */
export interface MemoryState {
  path: string;
  exists: boolean;
  content: string;
}

/** 工作区笔记 / 锚点读取结果（条目列表） */
export interface EntryListState {
  path: string;
  exists: boolean;
  items: string[];
}

/** 读取全局用户记忆 ~/.deepseek/memory.md */
export async function getMemory(): Promise<MemoryState> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  return tauriInvoke<MemoryState>("get_memory");
}

/** 保存全局用户记忆（整文件覆盖） */
export async function saveMemory(content: string): Promise<void> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  await tauriInvoke("save_memory_cmd", { content });
}

/** 读取工作区笔记 <workspace>/.deepseek/notes.md */
export async function getNotes(workspace: string): Promise<EntryListState> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  return tauriInvoke<EntryListState>("get_notes", { workspace });
}

/** 保存工作区笔记（整列表覆盖） */
export async function saveNotes(workspace: string, items: string[]): Promise<void> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  await tauriInvoke("save_notes_cmd", { workspace, items });
}

/** 读取工作区锚点 <workspace>/.deepseek/anchors.md */
export async function getAnchors(workspace: string): Promise<EntryListState> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  return tauriInvoke<EntryListState>("get_anchors", { workspace });
}

/** 保存工作区锚点（整列表覆盖） */
export async function saveAnchors(workspace: string, items: string[]): Promise<void> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  await tauriInvoke("save_anchors_cmd", { workspace, items });
}

// ===================== 工作区信任目录列表 =====================

/** 信任列表读取结果 */
export interface TrustState {
  path: string;
  key: string;
  items: string[];
}

/** 读取某工作区的信任路径列表 */
export async function getTrust(workspace: string): Promise<TrustState> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  return tauriInvoke<TrustState>("get_trust", { workspace });
}

/** 新增信任路径，返回实际存储的规范化路径 */
export async function addTrust(workspace: string, path: string): Promise<string> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  return tauriInvoke<string>("add_trust_cmd", { workspace, path });
}

/** 移除信任路径，返回是否实际移除 */
export async function removeTrust(workspace: string, path: string): Promise<boolean> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  return tauriInvoke<boolean>("remove_trust_cmd", { workspace, path });
}

// ===================== PTY 集成终端 =====================

/** 启动 PTY 会话 */
export async function ptySpawn(opts?: {
  cwd?: string;
  cols?: number;
  rows?: number;
}): Promise<string> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  return tauriInvoke<string>("pty_spawn", {
    cwd: opts?.cwd ?? null,
    cols: opts?.cols ?? null,
    rows: opts?.rows ?? null,
  });
}

/** 向 PTY 写入数据 */
export async function ptyWrite(id: string, data: string): Promise<void> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  await tauriInvoke("pty_write", { id, data });
}

/** 调整 PTY 尺寸 */
export async function ptyResize(id: string, cols: number, rows: number): Promise<void> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  await tauriInvoke("pty_resize", { id, cols, rows });
}

/** 关闭 PTY */
export async function ptyClose(id: string): Promise<void> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  await tauriInvoke("pty_close", { id });
}

// ===================== 斜杠命令 / 系统桥接 =====================

/** 在系统浏览器打开 URL（Web 环境降级为 window.open） */
export async function openExternalUrl(url: string): Promise<void> {
  if (isTauri()) {
    await tauriInvoke("open_external_url", { url });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

/** 退出桌面应用 */
export async function quitApp(): Promise<void> {
  if (!isTauri()) {
    window.close();
    return;
  }
  await tauriInvoke("quit_app");
}

/** 清除 API Key（/logout） */
export async function clearApiKey(): Promise<void> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  await tauriInvoke("clear_api_key");
}

/** 运行 deepseek doctor 诊断 */
export async function runDoctor(): Promise<string> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  return tauriInvoke<string>("run_doctor");
}

/** 插件目录条目 */
export interface PluginDirEntry {
  name: string;
  path: string;
}

/** 列出 ~/.codewhale/tools 插件目录 */
export async function listPlugins(): Promise<PluginDirEntry[]> {
  if (!isTauri()) return [];
  return tauriInvoke<PluginDirEntry[]>("list_plugins");
}

/** 读取 ~/.codewhale 下相对路径文件 */
export async function readCodewhaleFile(relative: string): Promise<string> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  return tauriInvoke<string>("read_codewhale_file", { relative });
}

/** 外部编辑器返回结果 */
export interface ExternalEditorResult {
  content: string;
  cancelled: boolean;
}

/** 在 $EDITOR 中编辑 Composer 文本并读回 */
export async function spawnExternalEditor(
  initialContent: string,
  suffix?: string,
): Promise<ExternalEditorResult> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  return tauriInvoke<ExternalEditorResult>("spawn_external_editor", {
    initialContent,
    suffix: suffix ?? null,
  });
}

/** 用 VS Code 或系统默认程序打开工作区文件 */
export async function openPathInExternalEditor(absPath: string): Promise<void> {
  if (!isTauri()) throw new Error("仅在桌面应用内可用");
  await tauriInvoke("open_path_in_external_editor", { absPath });
}

