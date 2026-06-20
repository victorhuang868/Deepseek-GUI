// Markdown 编辑器视图切换：Preview（渲染） / Markdown（源码），样式对齐 Cursor

import type { MdEditorViewMode } from "../utils/markdownPath";

interface MarkdownViewToggleProps {
  mode: MdEditorViewMode;
  onChange: (mode: MdEditorViewMode) => void;
}

/** Preview / Markdown 分段切换按钮 */
export function MarkdownViewToggle({ mode, onChange }: MarkdownViewToggleProps) {
  return (
    <div className="md-view-toggle" role="tablist" aria-label="Markdown view">
      <button
        type="button"
        role="tab"
        aria-selected={mode === "preview"}
        className={mode === "preview" ? "active" : ""}
        onClick={() => onChange("preview")}
      >
        Preview
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "source"}
        className={mode === "source" ? "active" : ""}
        onClick={() => onChange("source")}
      >
        Markdown
      </button>
    </div>
  );
}
