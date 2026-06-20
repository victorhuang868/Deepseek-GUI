// 首页仪表盘弹窗：/home 展示会话与工作区概览

import { useCallback, useEffect, useState } from "react";
import type { RuntimeClient } from "../api/client";
import type { RuntimeInfo, ThreadRecord, UsageAggregation, WorkspaceStatus } from "../api/types";
import type { Locale } from "../i18n";

interface HomeModalProps {
  client: RuntimeClient;
  locale: Locale;
  activeId: string | null;
  activeThread: ThreadRecord | null;
  rootPath: string | null;
  queuedCount: number;
  onClose: () => void;
}

/** /home 仪表盘模态框 */
export function HomeModal({
  client,
  locale,
  activeId,
  activeThread,
  rootPath,
  queuedCount,
  onClose,
}: HomeModalProps) {
  const zh = locale === "zh";
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [usage, setUsage] = useState<UsageAggregation | null>(null);
  const [ws, setWs] = useState<WorkspaceStatus | null>(null);
  const [turns, setTurns] = useState(0);
  const [items, setItems] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, u, w] = await Promise.all([
        client.runtimeInfo().catch(() => null),
        client.getUsage().catch(() => null),
        client.getWorkspaceStatus().catch(() => null),
      ]);
      setRuntime(r);
      setUsage(u);
      setWs(w);
      if (activeId) {
        const d = await client.getThread(activeId);
        setTurns(d.turns.length);
        setItems(d.items.length);
      }
    } finally {
      setLoading(false);
    }
  }, [client, activeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const bucket = usage?.buckets?.find((b) => b.key === activeId);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="usage-modal home-modal" onClick={(e) => e.stopPropagation()}>
        <div className="usage-modal-head">
          <h3>{zh ? "首页" : "Home"}</h3>
          <button type="button" className="settings-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {loading && <p className="usage-modal-muted">{zh ? "加载中…" : "Loading…"}</p>}

        {!loading && (
          <div className="usage-modal-body">
            <div className="usage-totals-grid">
              <div className="usage-stat">
                <span className="usage-stat-label">{zh ? "模型" : "Model"}</span>
                <span className="usage-stat-value">{activeThread?.model ?? "—"}</span>
              </div>
              <div className="usage-stat">
                <span className="usage-stat-label">{zh ? "模式" : "Mode"}</span>
                <span className="usage-stat-value">{activeThread?.mode ?? "—"}</span>
              </div>
              <div className="usage-stat">
                <span className="usage-stat-label">{zh ? "回合" : "Turns"}</span>
                <span className="usage-stat-value">{turns}</span>
              </div>
              <div className="usage-stat">
                <span className="usage-stat-label">{zh ? "队列" : "Queued"}</span>
                <span className="usage-stat-value">{queuedCount}</span>
              </div>
              <div className="usage-stat">
                <span className="usage-stat-label">{zh ? "条目" : "Items"}</span>
                <span className="usage-stat-value">{items}</span>
              </div>
            </div>

            <p className="context-modal-path" title={rootPath ?? ""}>
              {rootPath ?? (zh ? "未打开工作区" : "No workspace")}
            </p>

            {bucket && (
              <p className="usage-modal-muted">
                {zh ? "本会话 Token：" : "Thread tokens: "}
                {bucket.input_tokens.toLocaleString()} in · {bucket.output_tokens.toLocaleString()} out ·
                ${bucket.cost_usd.toFixed(4)}
              </p>
            )}

            {usage?.totals && (
              <p className="usage-modal-muted">
                {zh ? "全局：" : "All threads: "}
                {usage.totals.input_tokens.toLocaleString()} in · {usage.totals.turns}{" "}
                {zh ? "回合" : "turns"}
              </p>
            )}

            {ws?.git_repo && (
              <p className="usage-modal-muted">
                Git: {ws.branch ?? "?"} · +{ws.staged + ws.unstaged + ws.untracked}{" "}
                {zh ? "变更" : "changes"}
              </p>
            )}

            {runtime && (
              <p className="usage-modal-muted">
                Runtime v{runtime.version} · {runtime.bind_host}:{runtime.port}
              </p>
            )}

            <p className="context-modal-hint">
              {zh
                ? "快捷：/new · /context · /tokens · /settings · Ctrl+K"
                : "Quick: /new · /context · /tokens · /settings · Ctrl+K"}
            </p>
          </div>
        )}

        <div className="usage-modal-foot">
          <button type="button" className="btn btn-mini" onClick={() => void load()}>
            {zh ? "刷新" : "Refresh"}
          </button>
        </div>
      </div>
    </div>
  );
}
