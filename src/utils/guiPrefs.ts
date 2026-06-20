// GUI 本地偏好：主题、状态栏芯片、verbose、翻译开关（对齐 TUI /theme /statusline /verbose /translate）

/** localStorage 键名 */
export const THEME_KEY = "ds_theme";
export const STATUSLINE_KEY = "ds_statusline_chips";
export const VERBOSE_KEY = "ds_verbose_transcript";
export const TRANSLATE_KEY = "ds_translate_enabled";
export const VOICE_KEY = "ds_voice_enabled";
export const VOICE_SEND_KEY = "ds_voice_send_enabled";
export const VOICE_CONTROL_KEY = "ds_voice_control_enabled";
export const VIM_KEY = "ds_composer_vim_enabled";

/** Composer Vim 模式 */
export type ComposerVimMode = "normal" | "insert";

/** 状态栏可显示项 id */
export type StatusChipId = "workspace" | "file" | "tokens" | "cost" | "backend" | "model" | "mode";

/** 默认状态栏芯片 */
export const DEFAULT_STATUS_CHIPS: StatusChipId[] = [
  "workspace",
  "file",
  "tokens",
  "cost",
  "backend",
];

/** 读取 verbose 模式（推理块默认展开） */
export function loadVerbose(): boolean {
  return localStorage.getItem(VERBOSE_KEY) === "1";
}

/** 写入 verbose 开关 */
export function setVerbose(on: boolean): void {
  localStorage.setItem(VERBOSE_KEY, on ? "1" : "0");
  window.dispatchEvent(new CustomEvent("ds-prefs-changed"));
}

/** 读取 UI 翻译开关（占位：完整拦截需后端配合） */
export function loadTranslateEnabled(): boolean {
  return localStorage.getItem(TRANSLATE_KEY) === "1";
}

/** 写入翻译开关 */
export function setTranslateEnabled(on: boolean): void {
  localStorage.setItem(TRANSLATE_KEY, on ? "1" : "0");
  window.dispatchEvent(new CustomEvent("ds-prefs-changed"));
}

/** 读取语音输入开关（占位） */
export function loadVoiceEnabled(): boolean {
  return localStorage.getItem(VOICE_KEY) === "1";
}

/** 写入语音开关 */
export function setVoiceEnabled(on: boolean): void {
  localStorage.setItem(VOICE_KEY, on ? "1" : "0");
  window.dispatchEvent(new CustomEvent("ds-prefs-changed"));
}

/** 读取 voice-send（转写句末自动发送） */
export function loadVoiceSendEnabled(): boolean {
  return localStorage.getItem(VOICE_SEND_KEY) === "1";
}

/** 写入 voice-send */
export function setVoiceSendEnabled(on: boolean): void {
  localStorage.setItem(VOICE_SEND_KEY, on ? "1" : "0");
  window.dispatchEvent(new CustomEvent("ds-prefs-changed"));
}

/** 读取 voice-control（AI 辅助听写，见当前 Composer 文本） */
export function loadVoiceControlEnabled(): boolean {
  return localStorage.getItem(VOICE_CONTROL_KEY) === "1";
}

/** 写入 voice-control */
export function setVoiceControlEnabled(on: boolean): void {
  localStorage.setItem(VOICE_CONTROL_KEY, on ? "1" : "0");
  window.dispatchEvent(new CustomEvent("ds-prefs-changed"));
}

/** 读取 Composer Vim 模式开关 */
export function loadComposerVimEnabled(): boolean {
  return localStorage.getItem(VIM_KEY) === "1";
}

/** 写入 Composer Vim 开关 */
export function setComposerVimEnabled(on: boolean): void {
  localStorage.setItem(VIM_KEY, on ? "1" : "0");
  window.dispatchEvent(new CustomEvent("ds-prefs-changed"));
}

/** 读取状态栏芯片配置 */
export function loadStatusChips(): StatusChipId[] {
  try {
    const raw = localStorage.getItem(STATUSLINE_KEY);
    if (!raw) return [...DEFAULT_STATUS_CHIPS];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_STATUS_CHIPS];
    return parsed.filter((x): x is StatusChipId =>
      typeof x === "string" &&
      ["workspace", "file", "tokens", "cost", "backend", "model", "mode"].includes(x),
    );
  } catch {
    return [...DEFAULT_STATUS_CHIPS];
  }
}

/** 保存状态栏芯片并通知刷新 */
export function saveStatusChips(chips: StatusChipId[]): void {
  localStorage.setItem(STATUSLINE_KEY, JSON.stringify(chips));
  window.dispatchEvent(new CustomEvent("ds-prefs-changed"));
}
