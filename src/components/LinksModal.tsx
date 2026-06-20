// 外链列表弹窗：/links

import { DEESEEK_LINKS } from "../utils/deepseekLinks";
import { openExternalUrl } from "../api/tauri";
import type { Locale } from "../i18n";

interface LinksModalProps {
  locale: Locale;
  onClose: () => void;
}

/** DeepSeek / CodeWhale 链接模态框 */
export function LinksModal({ locale, onClose }: LinksModalProps) {
  const zh = locale === "zh";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="usage-modal links-modal" onClick={(e) => e.stopPropagation()}>
        <div className="usage-modal-head">
          <h3>{zh ? "链接" : "Links"}</h3>
          <button type="button" className="settings-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="usage-modal-body links-modal-body">
          {DEESEEK_LINKS.map((link) => (
            <button
              key={link.url}
              type="button"
              className="links-modal-row"
              onClick={() => void openExternalUrl(link.url)}
            >
              <span className="links-modal-label">{zh ? link.labelZh : link.labelEn}</span>
              <span className="links-modal-url">{link.url}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
