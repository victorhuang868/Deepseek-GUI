// 变更日志弹窗：/change（展示 GUI-CHANGELOG 最近条目）

import changelogRaw from "../../GUI-CHANGELOG.md?raw";
import type { Locale } from "../i18n";

interface ChangelogModalProps {
  locale: Locale;
  onClose: () => void;
}

/** 提取最近 N 条 ### 序号 块 */
function extractRecentEntries(raw: string, limit: number): string {
  const parts = raw.split(/^### \d+/m);
  const headers = [...raw.matchAll(/^### (\d+)/gm)].map((m) => m[1]);
  if (headers.length === 0) return raw.slice(0, 4000);
  const blocks: string[] = [];
  for (let i = 0; i < Math.min(limit, headers.length); i++) {
    const body = parts[i + 1]?.trim() ?? "";
    blocks.push(`### ${headers[i]}\n${body}`);
  }
  return blocks.join("\n\n");
}

/** /change 变更记录 */
export function ChangelogModal({ locale, onClose }: ChangelogModalProps) {
  const zh = locale === "zh";
  const text = extractRecentEntries(changelogRaw, 8);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="usage-modal changelog-modal" onClick={(e) => e.stopPropagation()}>
        <div className="usage-modal-head">
          <h3>{zh ? "更新记录" : "Changelog"}</h3>
          <button type="button" className="settings-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <pre className="changelog-modal-body">{text}</pre>
      </div>
    </div>
  );
}
