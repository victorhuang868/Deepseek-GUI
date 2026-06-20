// PR 预填模态框：从 git 日志/diff 生成 PR 描述（对齐 roadmap 4.6）

import { useCallback, useEffect, useState } from "react";
import { generatePrPrefill, isTauri, openExternalUrl } from "../api/tauri";
import type { Locale } from "../i18n";

interface PrPrefillModalProps {
  locale: Locale;
  workspace: string | null;
  onClose: () => void;
}

/** PR 描述预填弹窗 */
export function PrPrefillModal({ locale, workspace, onClose }: PrPrefillModalProps) {
  const zh = locale === "zh";
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** 拉取 git 预填正文 */
  useEffect(() => {
    if (!isTauri()) {
      setError(zh ? "PR 预填需桌面版（读取 git）" : "PR prefill requires desktop app");
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        const text = await generatePrPrefill({
          workspace: workspace ?? undefined,
          title: title.trim() || undefined,
        });
        setBody(text);
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [workspace, zh]);

  /** 标题变更后重新生成 */
  const refresh = useCallback(async () => {
    if (!isTauri()) return;
    setLoading(true);
    try {
      const text = await generatePrPrefill({
        workspace: workspace ?? undefined,
        title: title.trim() || undefined,
      });
      setBody(text);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [workspace, title]);

  /** 复制到剪贴板 */
  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(body);
      alert(zh ? "已复制 PR 描述" : "PR body copied");
    } catch {
      alert(zh ? "复制失败" : "Copy failed");
    }
  }, [body, zh]);

  /** 打开 GitHub 新建 PR 页（需远程 origin） */
  const onOpenGh = useCallback(() => {
    void openExternalUrl("https://github.com/compare");
  }, []);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal pr-prefill-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{zh ? "PR 描述预填" : "PR description prefill"}</h3>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <label className="cfg-field">
            <span className="cfg-label">{zh ? "标题（可选）" : "Title (optional)"}</span>
            <input
              className="cfg-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={zh ? "feat: …" : "feat: …"}
            />
          </label>
          <button type="button" className="btn btn-mini" disabled={loading} onClick={() => void refresh()}>
            {zh ? "重新生成" : "Regenerate"}
          </button>
          {loading && <p>{zh ? "生成中…" : "Generating…"}</p>}
          {error && <div className="banner banner-warn">{error}</div>}
          {!loading && body && <pre className="pr-prefill-body">{body}</pre>}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-mini" onClick={() => void onOpenGh()}>
            GitHub Compare
          </button>
          <button type="button" className="btn btn-mini btn-primary" disabled={!body} onClick={() => void onCopy()}>
            {zh ? "复制描述" : "Copy body"}
          </button>
        </div>
      </div>
    </div>
  );
}
