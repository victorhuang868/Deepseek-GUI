// Fleet 面板：GET /v1/fleet/runs 管理多 Worker 编排运行

import { useCallback, useEffect, useState } from "react";
import type { RuntimeClient } from "../api/client";
import type { FleetRunSummary, FleetWorkerDetail } from "../api/types";
import type { Locale } from "../i18n";

interface FleetPanelProps {
  client: RuntimeClient;
  locale: Locale;
}

/** 从 status 对象提取运行中计数 */
function countFromStatus(status: Record<string, unknown>, key: string): number {
  const v = status[key];
  return typeof v === "number" ? v : 0;
}

/** Fleet 运行管理面板 */
export function FleetPanel({ client, locale }: FleetPanelProps) {
  const zh = locale === "zh";
  const [globalStatus, setGlobalStatus] = useState<Record<string, unknown>>({});
  const [runs, setRuns] = useState<FleetRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [workers, setWorkers] = useState<FleetWorkerDetail[]>([]);
  const [busy, setBusy] = useState(false);

  /** 刷新 Fleet 列表 */
  const refresh = useCallback(async () => {
    try {
      const res = await client.listFleetRuns();
      setGlobalStatus(res.status ?? {});
      setRuns(res.runs ?? []);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(id);
  }, [refresh]);

  /** 加载某次运行的 Worker */
  const loadWorkers = async (runId: string) => {
    setSelectedId(runId);
    setWorkers([]);
    try {
      const res = await client.listFleetRunWorkers(runId);
      setWorkers(res.workers ?? []);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  /** 停止 Fleet 运行 */
  const onStopRun = async (runId: string) => {
    if (!window.confirm(zh ? `停止 Fleet 运行 ${runId}？` : `Stop fleet run ${runId}?`)) return;
    setBusy(true);
    try {
      await client.stopFleetRun(runId);
      await refresh();
      if (selectedId === runId) await loadWorkers(runId);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** Worker 操作 */
  const onWorkerAction = async (workerId: string, action: "interrupt" | "restart") => {
    setBusy(true);
    try {
      if (action === "interrupt") await client.interruptFleetWorker(workerId);
      else await client.restartFleetWorker(workerId);
      if (selectedId) await loadWorkers(selectedId);
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-section adv-settings">
      <h3 className="settings-section-title">Fleet</h3>
      <p className="settings-section-desc">
        {zh
          ? "多 Worker 编排运行（GET /v1/fleet/runs），每 4 秒刷新。"
          : "Multi-worker fleet runs via /v1/fleet/runs."}
      </p>
      {err && <p className="settings-hint settings-hint-error">{err}</p>}

      <div className="adv-toolbar">
        <button type="button" className="btn btn-mini" onClick={() => void refresh()}>
          {zh ? "刷新" : "Refresh"}
        </button>
        <span className="adv-list-meta">
          {zh ? "排队" : "Queued"}: {countFromStatus(globalStatus, "queued")} ·{" "}
          {zh ? "运行" : "Running"}: {countFromStatus(globalStatus, "running")} ·{" "}
          {zh ? "完成" : "Done"}: {countFromStatus(globalStatus, "completed")}
        </span>
      </div>

      {loading ? (
        <p>{zh ? "加载中…" : "Loading…"}</p>
      ) : runs.length === 0 ? (
        <p className="settings-hint">
          {zh ? "暂无 Fleet 运行（由 TUI /fleet 或 CLI 启动）。" : "No fleet runs yet."}
        </p>
      ) : (
        <ul className="adv-list">
          {runs.map((r) => (
            <li key={r.id} className={`adv-list-item${selectedId === r.id ? " active" : ""}`}>
              <button type="button" className="adv-list-btn" onClick={() => void loadWorkers(r.id)}>
                <span className="adv-list-title">{r.name || r.id}</span>
                <span className="adv-list-meta">
                  {r.worker_count} workers · {r.task_count} tasks · {r.id.slice(0, 8)}
                </span>
              </button>
              <button
                type="button"
                className="btn btn-mini"
                disabled={busy}
                onClick={() => void onStopRun(r.id)}
              >
                {zh ? "停止" : "Stop"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {selectedId && workers.length > 0 && (
        <div className="adv-detail">
          <h4>{zh ? "Workers" : "Workers"} — {selectedId.slice(0, 8)}</h4>
          <ul className="adv-list">
            {workers.map((w) => (
              <li key={w.worker_id} className="adv-list-item">
                <div className="adv-list-main">
                  <span className="adv-list-title">{w.worker_id.slice(0, 12)}</span>
                  <span className="adv-list-meta">
                    {w.status}
                    {w.role ? ` · ${w.role}` : ""}
                    {w.last_error ? ` · ${w.last_error.slice(0, 60)}` : ""}
                  </span>
                </div>
                <div className="adv-list-actions">
                  <button
                    type="button"
                    className="btn btn-mini"
                    disabled={busy}
                    onClick={() => void onWorkerAction(w.worker_id, "interrupt")}
                  >
                    {zh ? "中断" : "Interrupt"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-mini"
                    disabled={busy}
                    onClick={() => void onWorkerAction(w.worker_id, "restart")}
                  >
                    {zh ? "重启" : "Restart"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
