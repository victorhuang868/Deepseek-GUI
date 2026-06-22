// 输出翻译工具（对齐 TUI translation.rs）：检测英文思考块并后置翻译为中文

import type { Locale } from "../i18n";

/** 拉丁字母占比阈值：超过则视为需翻译的英文 */
const ENGLISH_LATIN_RATIO_THRESHOLD = 0.6;
/** 最少字母数，避免短串误判 */
const MIN_ALPHA_CHARS_FOR_DETECTION = 10;
/** CJK 字符相对拉丁字母的信息权重 */
const CJK_CHAR_WEIGHT = 3;

/** 判断字符是否属于 CJK 范围 */
function isCjk(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return (
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x2e80 && code <= 0x2eff) ||
    (code >= 0x3000 && code <= 0x303f) ||
    (code >= 0xff00 && code <= 0xffef) ||
    (code >= 0x3040 && code <= 0x309f) ||
    (code >= 0x30a0 && code <= 0x30ff)
  );
}

/**
 * 检测文本是否以英文为主、需要翻译（与 TUI needs_translation 一致）。
 * @param text 待检测正文
 */
export function needsTranslation(text: string): boolean {
  let latinCount = 0;
  let cjkCount = 0;
  for (const ch of text) {
    if (/[A-Za-z]/.test(ch)) latinCount += 1;
    else if (isCjk(ch)) cjkCount += 1;
  }
  const totalAlpha = latinCount + cjkCount * CJK_CHAR_WEIGHT;
  if (totalAlpha < MIN_ALPHA_CHARS_FOR_DETECTION) return false;
  if (cjkCount * CJK_CHAR_WEIGHT > latinCount) return false;
  return latinCount / totalAlpha >= ENGLISH_LATIN_RATIO_THRESHOLD;
}

/** 根据界面语言返回翻译 API 的目标语言名 */
export function translationTargetForLocale(locale: Locale): string {
  return locale === "zh" ? "简体中文" : "English";
}

/** GUI locale → CodeWhale runtime locale_tag */
export function codewhaleLocaleTag(locale: Locale): string {
  return locale === "zh" ? "zh-Hans" : "en";
}

/**
 * /translate on 时随 startTurn 传给后端：在 system prompt 注入中文思考/回复要求。
 * 仍保留后置翻译作英文泄漏兜底。
 */
export function startTurnTranslationFields(
  locale: Locale,
  translateOn: boolean,
): { translation_enabled: boolean; locale_tag?: string } {
  if (!translateOn || locale !== "zh") {
    return { translation_enabled: false };
  }
  return {
    translation_enabled: true,
    locale_tag: codewhaleLocaleTag(locale),
  };
}

/** 流式思考时的占位文案（/translate on） */
export function thinkingStreamPlaceholder(locale: Locale): string {
  return locale === "zh"
    ? "正在思考，完成后翻译为简体中文..."
    : "Thinking; translating when complete...";
}

/** 思考块落定后、翻译进行中的占位 */
export function thinkingTranslatingLabel(locale: Locale): string {
  return locale === "zh" ? "正在翻译思考内容..." : "Translating thinking content...";
}

/** 翻译失败时的后缀提示 */
export function thinkingTranslationFailedNote(locale: Locale): string {
  return locale === "zh" ? "（思考内容翻译失败，已显示原文）" : "(Translation failed; showing original)";
}
