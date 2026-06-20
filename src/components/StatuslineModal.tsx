// 状态栏配置弹窗：/statusline（P3）

import { useState } from "react";
import {
  DEFAULT_STATUS_CHIPS,
  loadStatusChips,
  saveStatusChips,
  type StatusChipId,
} from "../utils/guiPrefs";
import type { Locale } from "../i18n";

interface StatuslineModalProps {
  locale: Locale;
  onClose: () => void;
}

/** 芯片标签 */
const CHIP_LABELS: Record<StatusChipId, { zh: string; en: string }> = {
  workspace: { zh: "工作区", en: "Workspace" },
  file: { zh: "当前文件", en: "Active file" },
  tokens: { zh: "Token 用量", en: "Tokens" },
  cost: { zh: "费用", en: "Cost" },
  backend: { zh: "后端状态", en: "Backend" },
  model: { zh: "模型", en: "Model" },
  mode: { zh: "模式", en: "Mode" },
};

const ALL_CHIPS: StatusChipId[] = [
  "workspace",
  "file",
  "tokens",
  "cost",
  "backend",
  "model",
  "mode",
];

/** /statusline 多选配置 */
export function StatuslineModal({ locale, onClose }: StatuslineModalProps) {
  const zh = locale === "zh";
  const [chips, setChips] = useState<StatusChipId[]>(() => loadStatusChips());

  const toggle = (id: StatusChipId) => {
    setChips((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="usage-modal statusline-modal" onClick={(e) => e.stopPropagation()}>
        <div className="usage-modal-head">
          <h3>{zh ? "状态栏" : "Status bar"}</h3>
          <button type="button" className="settings-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="usage-modal-body links-modal-body">
          {ALL_CHIPS.map((id) => (
            <label key={id} className="statusline-row">
              <input
                type="checkbox"
                checked={chips.includes(id)}
                onChange={() => toggle(id)}
              />
              <span>{zh ? CHIP_LABELS[id].zh : CHIP_LABELS[id].en}</span>
            </label>
          ))}
        </div>
        <div className="usage-modal-foot">
          <button
            type="button"
            className="btn btn-mini"
            onClick={() => setChips([...DEFAULT_STATUS_CHIPS])}
          >
            {zh ? "恢复默认" : "Reset"}
          </button>
          <button
            type="button"
            className="btn btn-mini btn-primary"
            onClick={() => {
              saveStatusChips(chips);
              onClose();
            }}
          >
            {zh ? "保存" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
