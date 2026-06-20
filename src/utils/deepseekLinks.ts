// DeepSeek 平台链接（对齐 TUI /links）

import type { Locale } from "../i18n";

/** 单条外链 */
export interface ExternalLink {
  labelZh: string;
  labelEn: string;
  url: string;
}

/** 常用 DeepSeek / CodeWhale 链接 */
export const DEESEEK_LINKS: ExternalLink[] = [
  {
    labelZh: "DeepSeek 控制台",
    labelEn: "DeepSeek Dashboard",
    url: "https://platform.deepseek.com",
  },
  {
    labelZh: "API 文档",
    labelEn: "API Docs",
    url: "https://platform.deepseek.com/docs",
  },
  {
    labelZh: "CodeWhale 仓库",
    labelEn: "CodeWhale Repository",
    url: "https://github.com/Hmbown/CodeWhale",
  },
  {
    labelZh: "提交 Bug",
    labelEn: "Report a bug",
    url: "https://github.com/Hmbown/CodeWhale/issues/new?template=bug_report.md",
  },
  {
    labelZh: "功能建议",
    labelEn: "Feature request",
    url: "https://github.com/Hmbown/CodeWhale/issues/new?template=feature_request.md",
  },
  {
    labelZh: "安全策略",
    labelEn: "Security policy",
    url: "https://github.com/Hmbown/CodeWhale/security/policy",
  },
];

/** 格式化为纯文本（/links alert 回退） */
export function formatLinksText(locale: Locale): string {
  const zh = locale === "zh";
  const lines = DEESEEK_LINKS.map((l) => `· ${zh ? l.labelZh : l.labelEn}\n  ${l.url}`);
  return (
    (zh ? "DeepSeek / CodeWhale 链接\n\n" : "DeepSeek / CodeWhale links\n\n") +
    lines.join("\n\n") +
    (zh ? "\n\n在 GUI 中点击链接可在浏览器打开。" : "\n\nClick links in the modal to open in browser.")
  );
}
