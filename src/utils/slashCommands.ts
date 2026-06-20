// 斜杠命令注册表：供 /help 与 Composer 自动补全使用

import type { Locale } from "../i18n";

/** 单条斜杠命令元数据 */
export interface SlashCommandDef {
  /** 主命令名（不含 /） */
  name: string;
  /** 别名 */
  aliases?: string[];
  /** 用法示例 */
  usage: string;
  /** 中文说明 */
  descZh: string;
  /** 英文说明 */
  descEn: string;
  /** 是否需要活动会话 */
  requiresThread?: boolean;
}

/** GUI 已实现的斜杠命令列表 */
export const SLASH_COMMANDS: SlashCommandDef[] = [
  { name: "help", aliases: ["?", "bangzhu", "帮助"], usage: "/help", descZh: "显示命令帮助", descEn: "Show command help" },
  { name: "new", usage: "/new", descZh: "新建会话", descEn: "New chat thread" },
  { name: "context", usage: "/context [report|json|summary]", descZh: "上下文窗口用量", descEn: "Context window usage", requiresThread: true },
  { name: "skills", usage: "/skills [前缀]", descZh: "列出可用技能", descEn: "List skills" },
  { name: "skill", usage: "/skill <名称>", descZh: "运行指定技能", descEn: "Run a skill", requiresThread: true },
  { name: "init", usage: "/init", descZh: "生成 AGENTS.md", descEn: "Generate AGENTS.md", requiresThread: true },
  { name: "purge", aliases: ["qingchu"], usage: "/purge", descZh: "Agent 驱动上下文清理", descEn: "Agent context purge", requiresThread: true },
  { name: "goal", aliases: ["hunt"], usage: "/goal [目标|done|pause|resume|clear]", descZh: "设定/管理长期目标", descEn: "Set or manage goal", requiresThread: true },
  { name: "status", usage: "/status", descZh: "运行时状态摘要", descEn: "Runtime status summary" },
  { name: "share", usage: "/share", descZh: "导出会话为可分享链接", descEn: "Export session share URL", requiresThread: true },
  { name: "lsp", usage: "/lsp [on|off|status]", descZh: "LSP 诊断开关/状态", descEn: "LSP diagnostics toggle/status" },
  { name: "edit", usage: "/edit", descZh: "编辑上一条用户消息", descEn: "Edit last user message", requiresThread: true },
  { name: "system", usage: "/system", descZh: "查看/编辑 system prompt", descEn: "View/edit system prompt", requiresThread: true },
  { name: "home", usage: "/home", descZh: "首页仪表盘", descEn: "Home dashboard" },
  { name: "links", usage: "/links", descZh: "DeepSeek 链接", descEn: "DeepSeek links" },
  { name: "feedback", usage: "/feedback [bug|feature|security]", descZh: "提交反馈", descEn: "Send feedback" },
  { name: "change", aliases: ["changelog"], usage: "/change [版本]", descZh: "查看更新记录", descEn: "View changelog" },
  { name: "exit", aliases: ["quit", "q"], usage: "/exit", descZh: "退出应用", descEn: "Quit app" },
  { name: "logout", usage: "/logout", descZh: "清除 API Key", descEn: "Clear API key" },
  { name: "hf", usage: "/hf [status|setup]", descZh: "HuggingFace MCP", descEn: "HuggingFace MCP" },
  { name: "plugins", usage: "/plugins [名称]", descZh: "脚本插件列表", descEn: "List script plugins" },
  { name: "sidebar", usage: "/sidebar [on|off|tasks|agents|context]", descZh: "侧栏开关/跳转", descEn: "Sidebar toggle/panel" },
  { name: "theme", usage: "/theme", descZh: "切换界面主题", descEn: "Switch UI theme" },
  { name: "statusline", usage: "/statusline", descZh: "配置状态栏项", descEn: "Configure status bar" },
  { name: "balance", usage: "/balance", descZh: "账户余额", descEn: "Account balance" },
  { name: "cache", usage: "/cache [stats|warmup]", descZh: "Prefix cache 调试", descEn: "Prefix cache debug" },
  { name: "translate", usage: "/translate [on|off]", descZh: "输出翻译开关", descEn: "Output translation toggle" },
  { name: "verbose", usage: "/verbose [on|off]", descZh: "Verbose 推理展示", descEn: "Verbose reasoning display" },
  { name: "voice", usage: "/voice [on|off]", descZh: "语音输入开关", descEn: "Voice input toggle" },
  { name: "voicecontrol", usage: "/voicecontrol", descZh: "语音控制模式", descEn: "Voice control mode" },
  { name: "voicesend", usage: "/voicesend", descZh: "语音发送模式", descEn: "Voice send mode" },
  { name: "doctor", usage: "/doctor", descZh: "运行环境诊断", descEn: "Run doctor diagnostics" },
  { name: "slop", usage: "/slop [query]", descZh: "Slop ledger 调试", descEn: "Slop ledger debug" },
  { name: "swarm", aliases: ["fanout"], usage: "/swarm [N] <task>", descZh: "Swarm（已门禁）", descEn: "Swarm (gated)" },
  { name: "compact", aliases: ["yasuo"], usage: "/compact [原因]", descZh: "压缩上下文", descEn: "Compact context", requiresThread: true },
  { name: "fork", usage: "/fork", descZh: "复刻当前会话", descEn: "Fork current thread", requiresThread: true },
  { name: "clear", aliases: ["qingping"], usage: "/clear", descZh: "清空上下文（fork 副本）", descEn: "Clear context via fork", requiresThread: true },
  { name: "review", aliases: ["shencha"], usage: "/review [@文件]", descZh: "代码审查", descEn: "Code review", requiresThread: true },
  { name: "diff", usage: "/diff", descZh: "查看工作区变更", descEn: "View workspace diff" },
  { name: "sessions", aliases: ["resume"], usage: "/sessions", descZh: "浏览历史会话", descEn: "Browse saved sessions" },
  { name: "export", aliases: ["daochu"], usage: "/export", descZh: "导出当前会话 JSON", descEn: "Export thread JSON", requiresThread: true },
  { name: "model", aliases: ["moxing"], usage: "/model [名称]", descZh: "切换模型", descEn: "Switch model", requiresThread: true },
  { name: "models", aliases: ["moxingliebiao"], usage: "/models", descZh: "列出可用模型", descEn: "List models", requiresThread: true },
  { name: "mode", aliases: ["jihua", "zidong"], usage: "/mode [plan|agent|yolo]", descZh: "切换 Plan/Agent/YOLO", descEn: "Switch mode", requiresThread: true },
  { name: "trust", aliases: ["xinren"], usage: "/trust [on|off]", descZh: "信任模式开关", descEn: "Toggle trust mode", requiresThread: true },
  { name: "rename", aliases: ["gaiming"], usage: "/rename [标题]", descZh: "重命名会话", descEn: "Rename thread", requiresThread: true },
  { name: "cost", usage: "/cost", descZh: "Token 用量与费用", descEn: "Token usage & cost", requiresThread: true },
  { name: "tokens", usage: "/tokens", descZh: "Token 用量详情", descEn: "Token usage details", requiresThread: true },
  { name: "retry", aliases: ["chongshi"], usage: "/retry", descZh: "重发上一条用户消息", descEn: "Resend last user message", requiresThread: true },
  { name: "workspace", aliases: ["cwd"], usage: "/workspace [路径]", descZh: "切换工作区", descEn: "Switch workspace" },
  { name: "task", aliases: ["tasks"], usage: "/task", descZh: "打开任务面板", descEn: "Open tasks panel" },
  { name: "exec", usage: "/exec", descZh: "CLI 非交互 exec", descEn: "Non-interactive CLI exec" },
  { name: "pr", usage: "/pr [标题]", descZh: "PR 描述预填", descEn: "PR description prefill" },
  { name: "provider", usage: "/provider", descZh: "打开模型配置", descEn: "Open model settings" },
  { name: "attach", aliases: ["fujian", "image"], usage: "/attach [路径]", descZh: "插入文件附件引用", descEn: "Attach file reference", requiresThread: true },
  { name: "profile", aliases: ["dangan"], usage: "/profile [名称]", descZh: "切换配置档案", descEn: "Switch config profile" },
  { name: "mcp", usage: "/mcp", descZh: "打开 MCP 配置", descEn: "Open MCP settings" },
  { name: "hooks", usage: "/hooks", descZh: "打开 Hooks 配置", descEn: "Open hooks settings" },
  { name: "network", usage: "/network", descZh: "打开网络策略", descEn: "Open network policy" },
  { name: "jobs", usage: "/jobs", descZh: "查看 Jobs / 后台任务", descEn: "View jobs panel" },
  { name: "subagents", aliases: ["agents"], usage: "/subagents", descZh: "Subagent 状态", descEn: "Subagent state" },
  { name: "rlm", aliases: ["recursive"], usage: "/rlm", descZh: "RLM 会话列表", descEn: "RLM sessions" },
  { name: "terminal", aliases: ["term", "shell"], usage: "/terminal", descZh: "集成终端", descEn: "Integrated terminal" },
  { name: "memory", aliases: ["jiyi"], usage: "/memory", descZh: "用户记忆", descEn: "User memory" },
  { name: "note", aliases: ["notes", "biji"], usage: "/note", descZh: "工作区笔记", descEn: "Workspace notes" },
  { name: "anchor", aliases: ["anchors", "maodian"], usage: "/anchor", descZh: "上下文锚点", descEn: "Context anchors" },
  { name: "agent", aliases: ["subagent"], usage: "/agent [N] <任务>", descZh: "开持久子代理", descEn: "Open persistent sub-agent", requiresThread: true },
  { name: "settings", aliases: ["shezhi"], usage: "/settings", descZh: "打开设置", descEn: "Open settings" },
  { name: "config", aliases: ["peizhi"], usage: "/config", descZh: "打开后端连接配置", descEn: "Open connection settings" },
  { name: "load", aliases: ["resume2"], usage: "/load", descZh: "加载历史会话", descEn: "Load saved session" },
  { name: "save", usage: "/save", descZh: "保存会话（GUI 自动保存）", descEn: "Save session (auto)", requiresThread: true },
  { name: "relay", aliases: ["jieli", "接力"], usage: "/relay [焦点]", descZh: "生成会话接力 handoff", descEn: "Write session relay handoff", requiresThread: true },
  { name: "queue", aliases: ["paidui"], usage: "/queue <消息>|clear|stash", descZh: "消息排队（回合后发送）", descEn: "Queue messages" },
  { name: "stash", aliases: ["zancun"], usage: "/stash [pop|clear]", descZh: "暂存/弹回队列", descEn: "Stash / pop queue" },
  { name: "undo", aliases: ["chexiao"], usage: "/undo", descZh: "撤销上一回合的文件改动", descEn: "Undo last turn's edits", requiresThread: true },
  { name: "restore", aliases: ["huanyuan"], usage: "/restore [N]", descZh: "还原到此前快照", descEn: "Restore an earlier snapshot", requiresThread: true },
];

/** 别名 → 主命令名 */
const ALIAS_MAP: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const c of SLASH_COMMANDS) {
    m.set(c.name, c.name);
    for (const a of c.aliases ?? []) m.set(a, c.name);
  }
  return m;
})();

/** 解析斜杠输入为规范命令名与参数 */
export function parseSlashInput(raw: string): { cmd: string; arg: string } {
  const text = raw.trim();
  const body = text.startsWith("/") ? text.slice(1) : text;
  const [first, ...rest] = body.split(/\s+/);
  const key = (first ?? "").toLowerCase();
  const cmd = ALIAS_MAP.get(key) ?? key;
  return { cmd, arg: rest.join(" ") };
}

/** 命令说明（当前语言） */
export function slashDesc(c: SlashCommandDef, locale: Locale): string {
  return locale === "zh" ? c.descZh : c.descEn;
}

/** 过滤补全候选（匹配命令名前缀） */
export function filterSlashCommands(query: string): SlashCommandDef[] {
  const q = query.toLowerCase();
  if (!q) return SLASH_COMMANDS.slice(0, 16);
  return SLASH_COMMANDS.filter(
    (c) =>
      c.name.startsWith(q) ||
      (c.aliases?.some((a) => a.startsWith(q)) ?? false),
  ).slice(0, 16);
}

/** 生成 /help 全文 */
export function formatSlashHelp(locale: Locale): string {
  const lines = SLASH_COMMANDS.map(
    (c) => `${c.usage.padEnd(28)} ${slashDesc(c, locale)}`,
  );
  const footer =
    locale === "zh"
      ? "\n快捷键：Ctrl+K 命令面板 · Ctrl+P 快速打开 · Shift+Tab 切换推理强度"
      : "\nShortcuts: Ctrl+K palette · Ctrl+P quick open · Shift+Tab reasoning effort";
  return (locale === "zh" ? "可用斜杠命令：\n\n" : "Slash commands:\n\n") + lines.join("\n") + footer;
}
