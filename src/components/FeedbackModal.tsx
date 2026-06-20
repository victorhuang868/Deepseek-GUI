// 反馈入口弹窗：/feedback（对齐 TUI GitHub 模板）

import { openExternalUrl } from "../api/tauri";
import type { Locale } from "../i18n";

interface FeedbackModalProps {
  locale: Locale;
  onClose: () => void;
}

/** 反馈类型 */
const FEEDBACK_TYPES = [
  {
    id: "bug",
    labelZh: "Bug 报告",
    labelEn: "Bug report",
    descZh: "报告问题或回归",
    descEn: "Report a problem or regression",
    url: "https://github.com/Hmbown/CodeWhale/issues/new?template=bug_report.md",
  },
  {
    id: "feature",
    labelZh: "功能建议",
    labelEn: "Feature request",
    descZh: "提出想法或改进",
    descEn: "Suggest an idea or improvement",
    url: "https://github.com/Hmbown/CodeWhale/issues/new?template=feature_request.md",
  },
  {
    id: "security",
    labelZh: "安全漏洞",
    labelEn: "Security",
    descZh: "请先阅读安全策略",
    descEn: "Review security policy first",
    url: "https://github.com/Hmbown/CodeWhale/security/policy",
  },
] as const;

/** /feedback 选择器 */
export function FeedbackModal({ locale, onClose }: FeedbackModalProps) {
  const zh = locale === "zh";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="usage-modal feedback-modal" onClick={(e) => e.stopPropagation()}>
        <div className="usage-modal-head">
          <h3>{zh ? "反馈" : "Feedback"}</h3>
          <button type="button" className="settings-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="usage-modal-body links-modal-body">
          {FEEDBACK_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              className="links-modal-row"
              onClick={() => {
                void openExternalUrl(t.url);
                onClose();
              }}
            >
              <span className="links-modal-label">{zh ? t.labelZh : t.labelEn}</span>
              <span className="links-modal-url">{zh ? t.descZh : t.descEn}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
