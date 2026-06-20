// 主题选择弹窗：/theme（P3）

import { applyTheme, loadThemeId, THEMES } from "../utils/theme";
import type { Locale } from "../i18n";

interface ThemeModalProps {
  locale: Locale;
  onClose: () => void;
}

/** /theme 主题切换 */
export function ThemeModal({ locale, onClose }: ThemeModalProps) {
  const zh = locale === "zh";
  const current = loadThemeId();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="usage-modal theme-modal" onClick={(e) => e.stopPropagation()}>
        <div className="usage-modal-head">
          <h3>{zh ? "主题" : "Theme"}</h3>
          <button type="button" className="settings-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="usage-modal-body links-modal-body">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`links-modal-row${current === t.id ? " active" : ""}`}
              onClick={() => {
                applyTheme(t.id);
              }}
            >
              <span className="links-modal-label">{zh ? t.nameZh : t.nameEn}</span>
              {current === t.id && <span className="links-modal-url">✓</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
