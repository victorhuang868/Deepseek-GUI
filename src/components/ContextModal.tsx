// 上下文窗口用量弹窗：/context 命令展示当前会话的结构化上下文摘要

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RuntimeClient } from "../api/client";
import type { RuntimeInfo, ThreadDetail, UsageAggregation, WorkspaceStatus } from "../api/types";
import type { Locale } from "../i18n";

interface ContextModalProps {
  client: RuntimeClient;
  locale: Locale;
  /** 当前活动线程 id */
  threadId: string;
  onClose: () => void;
}

/** 按 item kind 统计数量 */
function countItemsByKind(detail: ThreadDetail): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of detail.items) {
    counts[item.kind] = (counts[item.kind] ?? 0) + 1;
  }
  return counts;
}

/** 上下文用量模态框（对齐 TUI /context 交互入口） */
export function ContextModal({ client, locale, threadId, onClose }: ContextModalProps) {
  const zh = locale === "zh";
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [usage, setUsage] = useState<UsageAggregation | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceStatus | null>(null);
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** 拉取线程详情、用量与工作区状态 */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, u, w, r] = await Promise.all([
        client.getThread(threadId),
        client.getUsage().catch(() => null),
        client.getWorkspaceStatus().catch(() => null),
        client.runtimeInfo().catch(() => null),
      ]);
      setDetail(d);
      setUsage(u);
      setWorkspace(w);
      setRuntime(r);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [client, threadId]);

  useEffect(() => {
    void load();
  }, [load]);

  const kindCounts = useMemo(
    () => (detail ? countItemsByKind(detail) : {}),
    [detail],
  );

  const threadUsage = useMemo(() => {
    if (!usage?.buckets) return null;
    return usage.buckets.find((b) => b.key === threadId) ?? null;
  }, [usage, threadId]);

  const t = detail?.thread;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="usage-modal context-modal" onClick={(e) => e.stopPropagation()}>
        <div className="usage-modal-head">
          <h3>{zh ? "上下文窗口" : "Context window"}</h3>
          <button type="button" className="settings-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {loading && <p className="usage-modal-muted">{zh ? "加载中…" : "Loading…"}</p>}
        {error && <p className="usage-modal-error">{error}</p>}

        {!loading && t && (
          <div className="usage-modal-body">
            <div className="usage-totals-grid">
              <div className="usage-stat">
                <span className="usage-stat-label">{zh ? "模型" : "Model"}</span>
                <span className="usage-stat-value">{t.model}</span>
              </div>
              <div className="usage-stat">
                <span className="usage-stat-label">{zh ? "模式" : "Mode"}</span>
                <span className="usage-stat-value">{t.mode}</span>
              </div>
              <div className="usage-stat">
                <span className="usage-stat-label">{zh ? "回合数" : "Turns"}</span>
                <span className="usage-stat-value">{detail!.turns.length}</span>
              </div>
              <div className="usage-stat">
                <span className="usage-stat-label">{zh ? "条目数" : "Items"}</span>
                <span className="usage-stat-value">{detail!.items.length}</span>
              </div>
            </div>

            {threadUsage && (
              <>
                <h4 className="usage-section-title">{zh ? "本会话 Token" : "Thread tokens"}</h4>
                <div className="usage-totals-grid">
                  <div className="usage-stat">
                    <span className="usage-stat-label">{zh ? "输入" : "Input"}</span>
                    <span className="usage-stat-value">
                      {threadUsage.input_tokens.toLocaleString()}
                    </span>
                  </div>
                  <div className="usage-stat">
                    <span className="usage-stat-label">{zh ? "输出" : "Output"}</span>
                    <span className="usage-stat-value">
                      {threadUsage.output_tokens.toLocaleString()}
                    </span>
                  </div>
                  <div className="usage-stat">
                    <span className="usage-stat-label">{zh ? "费用" : "Cost"}</span>
                    <span className="usage-stat-value">${threadUsage.cost_usd.toFixed(4)}</span>
                  </div>
                </div>
              </>
            )}

            {Object.keys(kindCounts).length > 0 && (
              <>
                <h4 className="usage-section-title">{zh ? "条目类型分布" : "Item kinds"}</h4>
                <div className="usage-groups">
                  {Object.entries(kindCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([kind, n]) => (
                      <div key={kind} className="usage-group-row">
                        <span className="usage-group-key">{kind}</span>
                        <span className="usage-group-meta">{n}</span>
                      </div>
                    ))}
                </div>
              </>
            )}

            <h4 className="usage-section-title">{zh ? "工作区" : "Workspace"}</h4>
            <p className="context-modal-path" title={t.workspace}>
              {t.workspace}
            </p>
            {workspace && (
              <p className="usage-modal-muted">
                {workspace.git_repo
                  ? `${zh ? "Git" : "Git"}: ${workspace.branch ?? "?"} · staged ${workspace.staged} · unstaged ${workspace.unstaged}`
                  : zh
                    ? "非 Git 仓库"
                    : "Not a git repo"}
              </p>
            )}

            {runtime && (
              <p className="usage-modal-muted">
                {zh ? "运行时" : "Runtime"} v{runtime.version} · {runtime.bind_host}:{runtime.port}
              </p>
            )}

            {detail!.turns.length > 0 && (
              <>
                <h4 className="usage-section-title">{zh ? "回合时间线（调试）" : "Turn timeline (debug)"}</h4>
                <div className="context-turn-list">
                  {[...detail!.turns]
                    .slice(-12)
                    .reverse()
                    .map((turn) => {
                      const itemCount = detail!.items.filter((it) => it.turn_id === turn.id).length;
                      const when = turn.created_at
                        ? new Date(turn.created_at).toLocaleTimeString()
                        : "—";
                      return (
                        <div key={turn.id} className="context-turn-row">
                          <span className="context-turn-status">{turn.status}</span>
                          <span className="context-turn-meta">
                            {itemCount} {zh ? "条" : "items"} · {turn.id.slice(0, 8)}
                          </span>
                          <span className="context-turn-time">{when}</span>
                        </div>
                      );
                    })}
                </div>
              </>
            )}

            <p className="usage-modal-muted context-modal-hint">
              {zh
                ? "提示：/context report|summary|json 导出；/undo 优先 patch-undo 回滚文件；/save 写入历史存档。"
                : "Tip: /context report|summary|json; /undo uses patch-undo; /save writes session archive."}
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
