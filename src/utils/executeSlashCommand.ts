// 斜杠命令执行器：将 TUI 常用 / 命令映射到 GUI 操作

import type { RuntimeClient } from "../api/client";
import type { ThreadRecord } from "../api/types";
import type { SettingsTab } from "../components/SettingsView";
import type { Locale } from "../i18n";
import { activateProfile, clearApiKey, isTauri, listPlugins, listProfiles, openExternalUrl, pickFile, quitApp, readCodewhaleFile, restartBackend, runDoctor } from "../api/tauri";
import {
  loadTranslateEnabled,
  loadVerbose,
  loadVoiceEnabled,
  loadVoiceSendEnabled,
  loadVoiceControlEnabled,
  setTranslateEnabled,
  setVerbose,
  setVoiceEnabled,
  setVoiceSendEnabled,
  setVoiceControlEnabled,
} from "./guiPrefs";
import { formatSlashHelp, parseSlashInput } from "./slashCommands";

/** 斜杠命令执行上下文（由 App 注入） */
export interface SlashCommandContext {
  client: RuntimeClient;
  locale: Locale;
  models: string[];
  modes: string[];
  activeId: string | null;
  activeThread: ThreadRecord | null;
  rootPath: string | null;
  /** 当前会话最后一条用户消息（/retry） */
  lastUserMessage: string | null;
  setShowDiff: (v: boolean) => void;
  setShowSessions: (v: boolean) => void;
  setShowUsage: (v: boolean) => void;
  /** 打开上下文窗口模态框（/context） */
  setShowContext: (v: boolean) => void;
  /** 新建会话（/new） */
  createNewThread: () => Promise<void>;
  /** 打开快照还原模态框 */
  setShowSnapshots: (v: boolean) => void;
  /** 还原/撤销成功后回调（刷新文件树等） */
  afterRestore?: () => void;
  openSettings: (tab: SettingsTab) => void;
  onChangeThreadField: (patch: {
    model?: string;
    mode?: string;
    trust_mode?: boolean;
    auto_approve?: boolean;
  }) => Promise<void>;
  refresh: () => Promise<void>;
  setActiveId: (id: string | null) => void;
  openWorkspace: (dir: string) => Promise<void>;
  chooseFolder: () => Promise<void>;
  onSend: (text: string) => Promise<void>;
  /** 向 Composer 插入 @ 路径 */
  insertAttachmentPath: (relPath: string) => void;
  /** 入队一条消息（回合结束后自动发送） */
  enqueue: (text: string) => void;
  /** 清空队列 */
  clearQueue: () => void;
  /** 队列整体停泊到暂存 */
  stashQueue: () => void;
  /** 暂存整体弹回队列 */
  popStash: () => void;
  /** 清空暂存 */
  clearStash: () => void;
  /** 模态框：/home /links /feedback /change /theme /statusline */
  setShowHome: (v: boolean) => void;
  setShowLinks: (v: boolean) => void;
  setShowFeedback: (v: boolean) => void;
  setShowChangelog: (v: boolean) => void;
  setShowTheme: (v: boolean) => void;
  setShowStatusline: (v: boolean) => void;
  /** PR 预填模态框（/pr） */
  setShowPrPrefill: (v: boolean) => void;
  /** 切换语音录音（/voice on 后可用） */
  toggleVoiceCapture?: () => void;
  /** 切换 system_prompt 编辑面板 */
  setShowSystemPrompt: (v: boolean) => void;
  /** 切换左侧资源管理器 / 右侧 Chat */
  toggleSidebar: () => void;
  toggleChat: () => void;
  /** /edit：载入 Composer 草稿 */
  editInComposer: (text: string) => void;
  /** 排队消息数（/home） */
  queuedCount: number;
  /** 当前 system_prompt 草稿 */
  systemPromptDraft: string;
}

/** 解析 /mode 参数为合法 mode */
function parseModeArg(arg: string): string | null {
  const a = arg.trim().toLowerCase();
  if (a === "1" || a === "plan") return "plan";
  if (a === "2" || a === "agent") return "agent";
  if (a === "3" || a === "yolo") return "yolo";
  if (["plan", "agent", "yolo"].includes(a)) return a;
  return null;
}

/** 解析 trust on/off */
function parseTrustArg(arg: string): boolean | null {
  const a = arg.trim().toLowerCase();
  if (["on", "true", "1", "yes"].includes(a)) return true;
  if (["off", "false", "0", "no"].includes(a)) return false;
  return null;
}

/** 下载 JSON 到本地（WebView / 浏览器通用） */
function downloadJson(filename: string, data: unknown): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** /init 对齐 TUI：委托 Agent 分析代码库并生成 AGENTS.md */
const INIT_AGENT_PROMPT =
  "You are generating a comprehensive AGENTS.md file for this project. " +
  "Deeply analyze the codebase and produce a customized, actionable project guide " +
  "that will help future AI agents work effectively here.\n\n" +
  "Steps:\n" +
  "1. Read key source files, README, build configs, and CI definitions\n" +
  "2. Document build/test/lint commands, architecture, and coding conventions\n" +
  "3. Write or update AGENTS.md at the workspace root\n" +
  "4. If inside a git repo, ensure .deepseek/ is listed in .gitignore";

/** 统计线程 item 按 kind 分组 */
function countItemKinds(
  items: Array<{ kind: string }>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item.kind] = (counts[item.kind] ?? 0) + 1;
  }
  return counts;
}

/** 构建 /context report|summary 文本报告 */
async function formatContextText(
  ctx: SlashCommandContext,
  mode: "report" | "summary",
): Promise<string> {
  const id = ctx.activeId!;
  const [detail, usage, ws, runtime] = await Promise.all([
    ctx.client.getThread(id),
    ctx.client.getUsage().catch(() => null),
    ctx.client.getWorkspaceStatus().catch(() => null),
    ctx.client.runtimeInfo().catch(() => null),
  ]);
  const t = detail.thread;
  const bucket = usage?.buckets?.find((b) => b.key === id);
  const kinds = countItemKinds(detail.items);

  if (mode === "summary") {
    const tok = bucket
      ? `${bucket.input_tokens} in / ${bucket.output_tokens} out`
      : ctx.locale === "zh"
        ? "（无用量数据）"
        : "(no usage data)";
    return (
      `${t.model} · ${t.mode} · ${detail.turns.length} turns · ${detail.items.length} items · ${tok}`
    );
  }

  const lines: string[] = [
    "Deepseek-GUI Context Report",
    "===========================",
    "",
    `Thread: ${t.title || id.slice(0, 8)}`,
    `Model: ${t.model}`,
    `Mode: ${t.mode}`,
    `Workspace: ${t.workspace}`,
    `Turns: ${detail.turns.length}`,
    `Items: ${detail.items.length}`,
  ];
  if (bucket) {
    lines.push(
      `Tokens: ${bucket.input_tokens} in / ${bucket.output_tokens} out / $${bucket.cost_usd.toFixed(4)}`,
    );
  }
  if (Object.keys(kinds).length > 0) {
    lines.push("", "Item kinds:");
    for (const [k, n] of Object.entries(kinds).sort((a, b) => b[1] - a[1])) {
      lines.push(`  ${k}: ${n}`);
    }
  }
  if (ws) {
    lines.push(
      "",
      `Git: ${ws.git_repo ? ws.branch ?? "?" : "none"} · staged ${ws.staged} · unstaged ${ws.unstaged}`,
    );
  }
  if (runtime) {
    lines.push(`Runtime: v${runtime.version} @ ${runtime.bind_host}:${runtime.port}`);
  }
  return lines.join("\n");
}

/** 构建 /context json 导出对象 */
async function buildContextJson(ctx: SlashCommandContext): Promise<unknown> {
  const id = ctx.activeId!;
  const [detail, usage, ws, runtime] = await Promise.all([
    ctx.client.getThread(id),
    ctx.client.getUsage().catch(() => null),
    ctx.client.getWorkspaceStatus().catch(() => null),
    ctx.client.runtimeInfo().catch(() => null),
  ]);
  return {
    thread: detail.thread,
    turns: detail.turns.length,
    items: detail.items.length,
    item_kinds: countItemKinds(detail.items),
    usage_bucket: usage?.buckets?.find((b) => b.key === id) ?? null,
    workspace: ws,
    runtime,
  };
}

/** 格式化 /status 运行时摘要 */
async function formatStatusReport(ctx: SlashCommandContext): Promise<string> {
  const [runtime, ws, usage] = await Promise.all([
    ctx.client.runtimeInfo().catch(() => null),
    ctx.client.getWorkspaceStatus().catch(() => null),
    ctx.client.getUsage().catch(() => null),
  ]);
  const lines: string[] = ["Deepseek-GUI Status", "=================", ""];
  if (runtime) {
    lines.push(`Version: ${runtime.version}`);
    lines.push(`Runtime: ${runtime.bind_host}:${runtime.port}`);
  }
  if (ctx.activeThread) {
    lines.push(`Model: ${ctx.activeThread.model}`);
    lines.push(`Mode: ${ctx.activeThread.mode}`);
    lines.push(
      `Trust: ${ctx.activeThread.trust_mode ? "on" : "off"} · Auto-approve: ${ctx.activeThread.auto_approve ? "on" : "off"}`,
    );
  }
  if (ctx.rootPath) lines.push(`Directory: ${ctx.rootPath}`);
  if (ws) {
    lines.push(
      `Git: ${ws.git_repo ? `${ws.branch ?? "?"} (+${ws.ahead ?? 0}/-${ws.behind ?? 0})` : "none"}`,
    );
    lines.push(`Changes: staged ${ws.staged} · unstaged ${ws.unstaged} · untracked ${ws.untracked}`);
  }
  if (usage?.totals) {
    const t = usage.totals;
    lines.push(
      "",
      `Session tokens: ${t.input_tokens} in / ${t.output_tokens} out · $${t.cost_usd.toFixed(4)} · ${t.turns} turns`,
    );
  }
  return lines.join("\n");
}

/** 执行斜杠命令；返回是否已处理（true = 不应再当普通消息发送） */
export async function executeSlashCommand(
  raw: string,
  ctx: SlashCommandContext,
): Promise<boolean> {
  const text = raw.trim();
  if (!text.startsWith("/")) return false;

  const { cmd, arg } = parseSlashInput(text);

  try {
    switch (cmd) {
      case "help":
        alert(formatSlashHelp(ctx.locale));
        return true;
      case "new":
        await ctx.createNewThread();
        return true;
      case "status":
        alert(await formatStatusReport(ctx));
        return true;
      case "skills": {
        try {
          const sk = await ctx.client.listSkills();
          const prefix = arg.trim().toLowerCase();
          const filtered = prefix
            ? sk.skills.filter((s) => s.name.toLowerCase().startsWith(prefix))
            : sk.skills;
          if (filtered.length === 0) {
            alert(
              ctx.locale === "zh"
                ? prefix
                  ? `无匹配技能前缀「${prefix}」\n目录：${sk.directory}`
                  : `未发现技能\n目录：${sk.directory}`
                : prefix
                  ? `No skills match prefix "${prefix}"\nDir: ${sk.directory}`
                  : `No skills found\nDir: ${sk.directory}`,
            );
            return true;
          }
          const list = filtered
            .map((s) => `· ${s.name}${s.enabled ? "" : " (off)"} — ${s.description}`)
            .join("\n");
          alert(
            (ctx.locale === "zh" ? `技能 (${filtered.length})：\n\n` : `Skills (${filtered.length}):\n\n`) +
              list +
              (ctx.locale === "zh"
                ? `\n\n目录：${sk.directory}\n/skill <名称> 运行 · 设置页可开关`
                : `\n\nDir: ${sk.directory}\n/skill <name> to run · toggle in Settings`),
          );
        } catch (e) {
          ctx.openSettings("skills");
        }
        return true;
      }
      case "skill": {
        const sub = arg.trim();
        if (!sub) {
          ctx.openSettings("skills");
          return true;
        }
        const [head] = sub.split(/\s+/);
        const low = head.toLowerCase();
        if (["install", "update", "uninstall", "trust", "sync"].includes(low)) {
          alert(
            ctx.locale === "zh"
              ? `/skill ${low} 请在 TUI 或终端完成；GUI 可在设置 → 技能查看已安装项。`
              : `/skill ${low} is supported in TUI/CLI; use Settings → Skills in GUI.`,
          );
          return true;
        }
        if (!ctx.activeId) {
          alert(ctx.locale === "zh" ? "请先新建或选择一个会话" : "Create or select a chat first");
          return true;
        }
        const name = low === "new" ? "skill-creator" : head;
        try {
          const sk = await ctx.client.listSkills();
          const hit = sk.skills.find((s) => s.name === name);
          if (!hit) {
            alert(ctx.locale === "zh" ? `未找到技能：${name}` : `Skill not found: ${name}`);
            return true;
          }
          if (!hit.enabled) await ctx.client.setSkillEnabled(name, true);
          const instruction =
            `You are now using a skill. Read and follow SKILL.md at ${hit.path}, ` +
            `then respond to the user's request following those instructions.`;
          await ctx.onSend(instruction);
          alert(
            (ctx.locale === "zh" ? `已激活技能：${name}\n` : `Activated skill: ${name}\n`) +
              hit.description,
          );
        } catch (e) {
          alert((ctx.locale === "zh" ? "技能加载失败：" : "Skill failed: ") + (e as Error).message);
        }
        return true;
      }
      case "lsp": {
        const sub = arg.trim().toLowerCase();
        if (sub === "on" || sub === "off") {
          localStorage.setItem("ds_lsp_enabled", sub === "on" ? "1" : "0");
          alert(
            ctx.locale === "zh"
              ? `LSP 已${sub === "on" ? "启用" : "禁用"}（重新打开文件后生效）`
              : `LSP ${sub === "on" ? "enabled" : "disabled"} (reopen files to apply)`,
          );
          return true;
        }
        const enabled = localStorage.getItem("ds_lsp_enabled") !== "0";
        alert(
          ctx.locale === "zh"
            ? `LSP 内联诊断：${enabled ? "启用" : "禁用"}\n桌面版编辑代码时自动连接 language server（rust-analyzer、pyright 等）。\n用法：/lsp on|off|status`
            : `LSP inline diagnostics: ${enabled ? "on" : "off"}\nDesktop editor auto-connects language servers.\nUsage: /lsp on|off|status`,
        );
        return true;
      }
      case "home":
        ctx.setShowHome(true);
        return true;
      case "links":
        ctx.setShowLinks(true);
        return true;
      case "feedback":
        if (!arg.trim() || arg.trim().toLowerCase() === "help") {
          ctx.setShowFeedback(true);
          return true;
        }
        {
          const kind = arg.trim().toLowerCase();
          const urls: Record<string, string> = {
            bug: "https://github.com/Hmbown/CodeWhale/issues/new?template=bug_report.md",
            feature: "https://github.com/Hmbown/CodeWhale/issues/new?template=feature_request.md",
            security: "https://github.com/Hmbown/CodeWhale/security/policy",
          };
          const url = urls[kind];
          if (url) {
            await openExternalUrl(url);
          } else {
            ctx.setShowFeedback(true);
          }
        }
        return true;
      case "change":
        ctx.setShowChangelog(true);
        return true;
      case "exit":
        if (
          !window.confirm(
            ctx.locale === "zh" ? "确定退出 Deepseek-GUI？" : "Quit Deepseek-GUI?",
          )
        ) {
          return true;
        }
        await quitApp();
        return true;
      case "logout":
        if (
          !window.confirm(
            ctx.locale === "zh"
              ? "清除 API Key 并退出登录？"
              : "Clear API key and log out?",
          )
        ) {
          return true;
        }
        if (isTauri()) {
          await clearApiKey();
          await restartBackend();
          alert(ctx.locale === "zh" ? "已清除 API Key，请重新配置连接。" : "API key cleared. Reconfigure connection.");
          ctx.openSettings("connection");
        } else {
          alert(ctx.locale === "zh" ? "登出仅在桌面版可用" : "Logout requires desktop app");
        }
        return true;
      case "hf": {
        const sub = arg.trim().toLowerCase();
        if (sub === "setup" || sub === "status" || sub === "concepts") {
          ctx.openSettings("mcp");
          alert(
            ctx.locale === "zh"
              ? "HuggingFace MCP：请在设置 → MCP 中配置 hf-mcp-server。\n子命令：status · setup · concepts"
              : "HuggingFace MCP: configure in Settings → MCP.\nSubcommands: status · setup · concepts",
          );
        } else {
          ctx.openSettings("mcp");
        }
        return true;
      }
      case "plugins": {
        if (!isTauri()) {
          alert(ctx.locale === "zh" ? "插件列表仅在桌面版可用" : "Plugins require desktop app");
          return true;
        }
        try {
          const list = await listPlugins();
          const name = arg.trim();
          if (name) {
            const hit = list.find((p) => p.name.toLowerCase() === name.toLowerCase());
            alert(
              hit
                ? `${hit.name}\n${hit.path}`
                : ctx.locale === "zh"
                  ? `未找到插件：${name}`
                  : `Plugin not found: ${name}`,
            );
          } else if (list.length === 0) {
            alert(ctx.locale === "zh" ? "未发现插件目录 ~/.codewhale/tools" : "No plugins in ~/.codewhale/tools");
          } else {
            alert(
              (ctx.locale === "zh" ? `插件 (${list.length})：\n\n` : `Plugins (${list.length}):\n\n`) +
                list.map((p) => `· ${p.name}\n  ${p.path}`).join("\n"),
            );
          }
        } catch (e) {
          alert((ctx.locale === "zh" ? "读取插件失败：" : "Plugins failed: ") + (e as Error).message);
        }
        return true;
      }
      case "sidebar": {
        const sub = arg.trim().toLowerCase();
        if (sub === "on" || sub === "tasks") {
          ctx.toggleChat();
          if (sub === "tasks") ctx.openSettings("tasks");
          return true;
        }
        if (sub === "off") {
          ctx.toggleChat();
          return true;
        }
        if (sub === "agents" || sub === "work") {
          ctx.openSettings("subagents");
          return true;
        }
        if (sub === "context") {
          if (ctx.activeId) ctx.setShowContext(true);
          else alert(ctx.locale === "zh" ? "请先选择会话" : "Select a chat first");
          return true;
        }
        ctx.toggleSidebar();
        return true;
      }
      case "theme":
        ctx.setShowTheme(true);
        return true;
      case "statusline":
        ctx.setShowStatusline(true);
        return true;
      case "doctor":
        if (!isTauri()) {
          alert(ctx.locale === "zh" ? "doctor 仅在桌面版可用" : "doctor requires desktop app");
          return true;
        }
        try {
          const out = await runDoctor();
          alert(out.slice(0, 8000));
        } catch (e) {
          alert((ctx.locale === "zh" ? "doctor 失败：" : "doctor failed: ") + (e as Error).message);
        }
        return true;
      case "balance":
        alert(
          ctx.locale === "zh"
            ? "账户余额：请访问 https://platform.deepseek.com 查看。\n（TUI balance 网络查询尚未接入 HTTP API）"
            : "Account balance: visit https://platform.deepseek.com\n(TUI balance API not exposed via HTTP yet)",
        );
        return true;
      case "cache":
        alert(
          ctx.locale === "zh"
            ? "Prefix cache 调试（/cache stats|zones|warmup）需在 TUI 或后续 runtime API 中查看。"
            : "Prefix cache debug (/cache stats|zones|warmup) requires TUI or future runtime API.",
        );
        return true;
      case "translate": {
        const sub = arg.trim().toLowerCase();
        if (sub === "on" || sub === "off") {
          setTranslateEnabled(sub === "on");
        } else {
          setTranslateEnabled(!loadTranslateEnabled());
        }
        alert(
          (ctx.locale === "zh" ? "UI 翻译：" : "UI translation: ") +
            (loadTranslateEnabled() ? "on" : "off") +
            (ctx.locale === "zh"
              ? "\n（完整输出翻译需后续 pipeline 支持）"
              : "\n(full output translation pipeline pending)"),
        );
        return true;
      }
      case "verbose": {
        const sub = arg.trim().toLowerCase();
        if (sub === "on" || sub === "off") {
          setVerbose(sub === "on");
        } else {
          setVerbose(!loadVerbose());
        }
        alert(
          (ctx.locale === "zh" ? "Verbose 推理展示：" : "Verbose reasoning: ") +
            (loadVerbose() ? "on" : "off"),
        );
        return true;
      }
      case "voice":
      case "voicecontrol":
      case "voicesend": {
        const sub = arg.trim().toLowerCase();
        if (cmd === "voicecontrol") {
          if (sub === "on" || sub === "off") setVoiceControlEnabled(sub === "on");
          else setVoiceControlEnabled(!loadVoiceControlEnabled());
          alert(
            (ctx.locale === "zh" ? "Voice-control：" : "Voice-control: ") +
              (loadVoiceControlEnabled() ? "on" : "off"),
          );
        } else if (cmd === "voicesend") {
          if (sub === "on" || sub === "off") setVoiceSendEnabled(sub === "on");
          else setVoiceSendEnabled(!loadVoiceSendEnabled());
          alert(
            (ctx.locale === "zh" ? "Voice-send：" : "Voice-send: ") +
              (loadVoiceSendEnabled() ? "on" : "off"),
          );
        } else {
          if (sub === "on" || sub === "off") setVoiceEnabled(sub === "on");
          else setVoiceEnabled(!loadVoiceEnabled());
          alert(
            (ctx.locale === "zh" ? "语音输入：" : "Voice input: ") +
              (loadVoiceEnabled() ? "on（点 Composer 麦克风录音）" : "off"),
          );
        }
        return true;
      }
      case "slop": {
        if (!isTauri()) {
          alert(ctx.locale === "zh" ? "slop ledger 仅在桌面版可读" : "slop ledger requires desktop app");
          return true;
        }
        try {
          const raw = await readCodewhaleFile("slop_ledger.json");
          const doc = JSON.parse(raw) as Record<string, unknown>;
          const keys = Object.keys(doc);
          alert(
            (ctx.locale === "zh" ? `Slop ledger：${keys.length} 条记录\n\n` : `Slop ledger: ${keys.length} entries\n\n`) +
              raw.slice(0, 3000),
          );
        } catch {
          alert(ctx.locale === "zh" ? "未找到 ~/.codewhale/slop_ledger.json" : "No ~/.codewhale/slop_ledger.json");
        }
        return true;
      }
      case "swarm":
        alert(
          ctx.locale === "zh"
            ? "/swarm 已在 v0.8.61 门禁。\n请使用 /goal 设定长期目标，或 /agent [N] <任务> 开子代理。"
            : "/swarm is gated in v0.8.61.\nUse /goal for persistent objectives or /agent [N] <task> for a sub-agent.",
        );
        return true;
      case "diff":
        ctx.setShowDiff(true);
        return true;
      case "sessions":
        ctx.setShowSessions(true);
        return true;
      case "task":
      case "tasks":
        ctx.openSettings("tasks");
        return true;
      case "exec":
        ctx.openSettings("tasks");
        return true;
      case "pr":
        ctx.setShowPrPrefill(true);
        return true;
      case "provider":
        ctx.openSettings("models");
        return true;
      case "mcp":
        ctx.openSettings("mcp");
        return true;
      case "hooks":
        ctx.openSettings("hooks");
        return true;
      case "network":
        ctx.openSettings("network");
        return true;
      case "jobs":
        ctx.openSettings("jobs");
        return true;
      case "subagents":
        ctx.openSettings("subagents");
        return true;
      case "memory":
      case "note":
      case "anchor":
        ctx.openSettings("memory");
        return true;
      case "settings":
        ctx.openSettings("models");
        return true;
      case "config":
        ctx.openSettings("connection");
        return true;
      case "load":
        ctx.setShowSessions(true);
        return true;
      case "queue": {
        // /queue <text> 入队；/queue clear 清空；无参时提示
        const sub = arg.trim();
        const low = sub.toLowerCase();
        if (low === "clear") {
          ctx.clearQueue();
          return true;
        }
        if (low === "stash") {
          ctx.stashQueue();
          return true;
        }
        if (sub && low !== "list") {
          ctx.enqueue(sub);
          return true;
        }
        // 无参或 list：队列条已直接展示，给出用法提示
        alert(
          ctx.locale === "zh"
            ? "用法：/queue <消息> 入队；/queue clear 清空；/queue stash 暂存全部"
            : "Usage: /queue <msg> | /queue clear | /queue stash",
        );
        return true;
      }
      case "stash": {
        // /stash 暂存当前队列；/stash pop 弹回；/stash clear 清空
        const low = arg.trim().toLowerCase();
        if (low === "pop") {
          ctx.popStash();
        } else if (low === "clear") {
          ctx.clearStash();
        } else {
          ctx.stashQueue();
        }
        return true;
      }
      case "rlm":
      case "recursive":
        ctx.openSettings("rlm");
        return true;
      case "terminal":
      case "term":
      case "shell":
        ctx.openSettings("terminal");
        return true;
      case "workspace":
        if (arg.trim()) {
          await ctx.openWorkspace(arg.trim());
        } else {
          await ctx.chooseFolder();
        }
        return true;
      case "profile": {
        if (!isTauri()) {
          alert(ctx.locale === "zh" ? "配置档案仅在桌面版可用" : "Profiles require desktop app");
          return true;
        }
        const doc = await listProfiles();
        if (!arg.trim()) {
          const names = doc.profiles
            .map((p) => `· ${p.name}${p.id === doc.active_id ? " ✓" : ""}`)
            .join("\n");
          alert(
            (ctx.locale === "zh" ? "当前档案：\n" : "Profiles:\n") +
              names +
              (ctx.locale === "zh" ? "\n\n用法：/profile 档案名称" : "\n\nUsage: /profile <name>"),
          );
          return true;
        }
        const q = arg.trim().toLowerCase();
        const hit =
          doc.profiles.find((p) => p.name.toLowerCase() === q) ??
          doc.profiles.find((p) => p.id.toLowerCase() === q);
        if (!hit) {
          alert(ctx.locale === "zh" ? `未找到档案：${arg}` : `Profile not found: ${arg}`);
          return true;
        }
        await activateProfile(hit.id);
        alert(ctx.locale === "zh" ? `已切换档案：${hit.name}` : `Activated profile: ${hit.name}`);
        return true;
      }
    }

    if (!ctx.activeId) {
      alert(ctx.locale === "zh" ? "请先新建或选择一个会话" : "Create or select a chat first");
      return true;
    }

    switch (cmd) {
      case "compact":
        await ctx.client.compactThread(ctx.activeId, arg || undefined);
        return true;

      case "fork": {
        const nt = await ctx.client.forkThread(ctx.activeId);
        await ctx.refresh();
        ctx.setActiveId(nt.id);
        return true;
      }

      case "clear": {
        const nt = await ctx.client.forkThread(ctx.activeId);
        await ctx.refresh();
        ctx.setActiveId(nt.id);
        return true;
      }

      case "review": {
        const target = arg.trim();
        const prompt = target
          ? `请对 ${target} 进行代码审查：检查潜在 bug、边界条件、安全与性能问题、可读性，并给出可执行的改进建议（按严重程度分级）。`
          : `请审查本工作区当前的代码改动：先用 git 查看变更，再检查潜在 bug、边界条件、安全与性能问题、可读性，并给出可执行的改进建议（按严重程度分级）。`;
        await ctx.client.startTurn(ctx.activeId, { prompt });
        return true;
      }

      case "export": {
        const detail = await ctx.client.getThread(ctx.activeId);
        const title = (detail.thread.title || "thread")
          .replace(/[^\w\u4e00-\u9fa5-]+/g, "_")
          .slice(0, 40);
        downloadJson(`deepseek-${title}-${ctx.activeId.slice(0, 8)}.json`, detail);
        return true;
      }

      case "model":
        if (!arg.trim()) {
          alert(
            (ctx.locale === "zh" ? "当前模型：" : "Current model: ") +
              (ctx.activeThread?.model ?? "?") +
              (ctx.locale === "zh" ? "\n用法：/model deepseek-v4-pro" : "\nUsage: /model deepseek-v4-pro"),
          );
          return true;
        }
        await ctx.onChangeThreadField({ model: arg.trim() });
        return true;

      case "models":
        alert((ctx.locale === "zh" ? "可用模型：\n" : "Models:\n") + ctx.models.join("\n"));
        return true;

      case "mode": {
        if (!arg.trim()) {
          alert(
            (ctx.locale === "zh" ? "当前模式：" : "Current mode: ") +
              (ctx.activeThread?.mode ?? "?") +
              (ctx.locale === "zh"
                ? "\n用法：/mode plan|agent|yolo"
                : "\nUsage: /mode plan|agent|yolo"),
          );
          return true;
        }
        const mode = parseModeArg(arg);
        if (!mode) {
          alert(ctx.locale === "zh" ? "无效模式，请用 plan、agent 或 yolo" : "Invalid mode");
          return true;
        }
        const patch: { mode: string; auto_approve?: boolean; trust_mode?: boolean } = { mode };
        if (mode === "yolo") {
          patch.auto_approve = true;
          patch.trust_mode = true;
        }
        await ctx.onChangeThreadField(patch);
        return true;
      }

      case "trust": {
        // list/add/remove 子命令打开信任目录面板；on/off 切换信任模式
        const sub = arg.trim().toLowerCase().split(/\s+/)[0];
        if (["list", "add", "remove", "rm", "ls"].includes(sub)) {
          ctx.openSettings("trust");
          return true;
        }
        if (!arg.trim()) {
          alert(
            (ctx.locale === "zh" ? "信任模式：" : "Trust mode: ") +
              (ctx.activeThread?.trust_mode ? "on" : "off") +
              (ctx.locale === "zh" ? "\n用法：/trust on|off" : "\nUsage: /trust on|off"),
          );
          return true;
        }
        const v = parseTrustArg(arg);
        if (v == null) {
          alert(ctx.locale === "zh" ? "用法：/trust on|off" : "Usage: /trust on|off");
          return true;
        }
        await ctx.onChangeThreadField({ trust_mode: v });
        return true;
      }

      case "rename": {
        const title =
          arg.trim() ||
          window.prompt(ctx.locale === "zh" ? "会话名称" : "Thread title", ctx.activeThread?.title || "")?.trim();
        if (!title) return true;
        await ctx.client.patchThread(ctx.activeId, { title });
        await ctx.refresh();
        return true;
      }

      case "cost":
      case "tokens":
        ctx.setShowUsage(true);
        return true;

      case "context": {
        const sub = arg.trim().toLowerCase();
        if (!sub) {
          ctx.setShowContext(true);
          return true;
        }
        if (sub === "report" || sub === "summary") {
          alert(await formatContextText(ctx, sub));
          return true;
        }
        if (sub === "json") {
          downloadJson(`context-${ctx.activeId!.slice(0, 8)}.json`, await buildContextJson(ctx));
          return true;
        }
        alert(
          ctx.locale === "zh"
            ? "未知子命令。可用：report、json、summary"
            : "Unknown subcommand. Use: report, json, summary",
        );
        return true;
      }

      case "init":
        alert(
          ctx.locale === "zh"
            ? "正在启动 AGENTS.md 生成…\nAgent 将分析代码库并写入项目根目录。"
            : "Starting AGENTS.md generation…\nThe agent will analyze the codebase.",
        );
        await ctx.onSend(INIT_AGENT_PROMPT);
        return true;

      case "purge":
        alert(
          ctx.locale === "zh" ? "已触发 Agent 上下文清理…" : "Agent context purge triggered…",
        );
        await ctx.onSend(
          "Run a context purge: analyze the conversation history and use the purge_context tool " +
            "to remove redundant or low-value context while preserving critical decisions and state.",
        );
        return true;

      case "goal":
      case "hunt": {
        const sub = arg.trim();
        const low = sub.toLowerCase();
        if (!sub || low === "status") {
          alert(
            ctx.locale === "zh"
              ? "用法：/goal <目标> [budget: N]\n子命令：done · pause · resume · clear"
              : "Usage: /goal <objective> [budget: N]\nSubcommands: done · pause · resume · clear",
          );
          return true;
        }
        if (low === "clear" || low === "reset") {
          await ctx.onSend(
            "Clear the current long-running goal state. Confirm goal is cleared and stop continuation loops.",
          );
          return true;
        }
        if (["done", "complete", "hunted"].includes(low)) {
          await ctx.onSend("Mark the current goal as complete and write a brief trophy summary.");
          return true;
        }
        if (["pause", "paused", "wound", "wounded"].includes(low)) {
          await ctx.onSend("Pause the current goal. Save progress; stop auto-continuation until resumed.");
          return true;
        }
        if (["resume", "continue"].includes(low)) {
          await ctx.onSend("Resume the paused goal and continue working toward the objective.");
          return true;
        }
        if (["block", "blocked", "escape", "escaped"].includes(low)) {
          await ctx.onSend("Mark the current goal as blocked and document why progress stopped.");
          return true;
        }
        await ctx.onSend(sub);
        return true;
      }

      case "share": {
        if (arg.trim().toLowerCase() === "help") {
          alert(
            ctx.locale === "zh"
              ? "/share — 导出当前会话为 HTML 并上传 GitHub Gist（需 gh CLI）"
              : "/share — Export session HTML to GitHub Gist (requires gh CLI)",
          );
          return true;
        }
        await ctx.onSend(
          "Export this session transcript as standalone HTML and upload to a public GitHub Gist " +
            "using the gh CLI if available. Return the Gist URL when done.",
        );
        return true;
      }

      case "save":
        // GUI 的会话由后端持续持久化，无需手动保存；提示并引导导出
        alert(
          ctx.locale === "zh"
            ? "GUI 会话会自动保存。如需导出文件，请使用 /export。"
            : "GUI sessions auto-save. Use /export to write a file.",
        );
        return true;

      case "relay": {
        // 生成会话接力：指示模型写 .deepseek/handoff.md（对齐 TUI /relay）
        const focus = arg.trim();
        const instruction =
          `Create a compact session relay (接力) for a future thread and write it to ` +
          `\`.deepseek/handoff.md\`. Summarize the goal, key decisions, current state, ` +
          `open tasks, and any gotchas.` +
          (focus ? ` Focus especially on: ${focus}.` : "");
        await ctx.onSend(instruction);
        return true;
      }

      case "undo": {
        // 优先 POST /v1/threads/{id}/undo；失败时回退快照还原
        try {
          const res = await ctx.client.undoThread(ctx.activeId);
          ctx.setActiveId(res.thread.id);
          await ctx.refresh();
          ctx.afterRestore?.();
          const hint = res.original_user_text
            ? `\n${ctx.locale === "zh" ? "原消息：" : "Original: "}${res.original_user_text.slice(0, 120)}`
            : "";
          alert((ctx.locale === "zh" ? "已撤销上一回合" : "Undid last turn") + hint);
        } catch {
          try {
            const res = await ctx.client.listSnapshots(ctx.activeId, 50);
            const preTurn = res.snapshots.find((s) => s.label.startsWith("pre-turn"));
            const target = preTurn ?? res.snapshots[0];
            if (!target) {
              alert(ctx.locale === "zh" ? "暂无可撤销的快照" : "No snapshot to undo");
              return true;
            }
            const r = await ctx.client.restoreSnapshot(ctx.activeId, target.id);
            ctx.afterRestore?.();
            alert(
              (ctx.locale === "zh" ? "已撤销到快照 " : "Reverted to ") + r.restored.slice(0, 8),
            );
          } catch (e) {
            alert((ctx.locale === "zh" ? "撤销失败：" : "Undo failed: ") + (e as Error).message);
          }
        }
        return true;
      }

      case "restore": {
        const n = arg.trim();
        // 无参：打开快照浏览模态框
        if (!n) {
          ctx.setShowSnapshots(true);
          return true;
        }
        // /restore N：还原到第 N 新的快照（1 基，最新优先）
        const idx = Number(n);
        if (!Number.isInteger(idx) || idx < 1) {
          ctx.setShowSnapshots(true);
          return true;
        }
        try {
          const res = await ctx.client.listSnapshots(ctx.activeId, Math.max(idx, 50));
          const target = res.snapshots[idx - 1];
          if (!target) {
            alert(ctx.locale === "zh" ? `第 ${idx} 个快照不存在` : `Snapshot #${idx} not found`);
            return true;
          }
          const r = await ctx.client.restoreSnapshot(ctx.activeId, target.id);
          ctx.afterRestore?.();
          alert(
            (ctx.locale === "zh" ? "已还原到快照 " : "Restored to ") + r.restored.slice(0, 8),
          );
        } catch (e) {
          alert((ctx.locale === "zh" ? "还原失败：" : "Restore failed: ") + (e as Error).message);
        }
        return true;
      }

      case "agent": {
        // 解析 "/agent [N] <task>"：可选深度前缀 N(0-3) + 任务描述
        let depth = 1;
        let task = arg.trim();
        const m = task.match(/^(\d)\s+(.*)$/s);
        if (m) {
          const n = Number(m[1]);
          if (n >= 0 && n <= 3) {
            depth = n;
            task = m[2].trim();
          }
        }
        if (!task) {
          alert(
            ctx.locale === "zh"
              ? "用法：/agent [深度0-3] <任务描述>"
              : "Usage: /agent [depth 0-3] <task>",
          );
          return true;
        }
        // 指示模型开启持久子代理会话（对齐 TUI /agent 行为）
        const instruction =
          `Open a persistent sub-agent session for this task. Call \`agent_open\` with name ` +
          `\`slash_agent\`, \`prompt: ${JSON.stringify(task)}\`, and \`max_depth: ${depth}\`. ` +
          `Use \`agent_eval\` to wait for the next projection and \`handle_read\` on the returned ` +
          `transcript_handle if you need more detail. Verify any claimed side effects before reporting success.`;
        await ctx.onSend(instruction);
        return true;
      }

      case "edit": {
        if (!ctx.lastUserMessage) {
          alert(ctx.locale === "zh" ? "没有可编辑的上一条用户消息" : "No user message to edit");
          return true;
        }
        ctx.editInComposer(ctx.lastUserMessage);
        return true;
      }

      case "system": {
        const sp =
          ctx.systemPromptDraft ||
          ctx.activeThread?.system_prompt ||
          (ctx.locale === "zh" ? "（未设置）" : "(not set)");
        const preview = sp.length > 500 ? `${sp.slice(0, 500)}…` : sp;
        alert(
          (ctx.locale === "zh" ? `System prompt (${ctx.activeThread?.mode ?? "?"}):\n\n` : `System prompt (${ctx.activeThread?.mode ?? "?"}):\n\n`) +
            preview +
            (ctx.locale === "zh" ? "\n\n已打开编辑面板。" : "\n\nEditor panel opened."),
        );
        ctx.setShowSystemPrompt(true);
        return true;
      }

      case "retry": {
        if (!ctx.lastUserMessage) {
          alert(ctx.locale === "zh" ? "没有可重试的用户消息" : "No user message to retry");
          return true;
        }
        await ctx.onSend(ctx.lastUserMessage);
        return true;
      }

      case "attach": {
        let filePath = arg.trim();
        if (!filePath && isTauri()) {
          filePath = (await pickFile()) ?? "";
        }
        if (!filePath) {
          alert(ctx.locale === "zh" ? "用法：/attach 文件路径" : "Usage: /attach <path>");
          return true;
        }
        if (!ctx.rootPath) {
          alert(ctx.locale === "zh" ? "请先打开项目文件夹" : "Open a workspace folder first");
          return true;
        }
        const normRoot = ctx.rootPath.replace(/\\/g, "/").replace(/\/$/, "");
        const normFile = filePath.replace(/\\/g, "/");
        let rel: string;
        if (normFile.startsWith(normRoot + "/")) {
          rel = normFile.slice(normRoot.length + 1);
        } else if (normFile.startsWith(normRoot)) {
          rel = normFile.slice(normRoot.length).replace(/^\/+/, "");
        } else {
          rel = normFile;
        }
        ctx.insertAttachmentPath(rel);
        return true;
      }

      default:
        alert(
          ctx.locale === "zh" ? `未知命令：/${cmd}（输入 /help 查看）` : `Unknown: /${cmd} (see /help)`,
        );
        return true;
    }
  } catch (e) {
    alert((ctx.locale === "zh" ? "命令执行失败：" : "Command failed: ") + (e as Error).message);
    return true;
  }
}
