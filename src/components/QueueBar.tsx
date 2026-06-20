// Composer 排队 / 暂存条（对齐 TUI /queue 与 /stash）
// - 队列 queue：回合进行中排队，结束后自动按序发送；支持排序、立即发送、按线程持久化。
// - 暂存 stash：停泊到 localStorage，可单条弹回或删除。

import { useState } from "react";
import type { Locale } from "../i18n";

interface QueueBarProps {
  locale: Locale;
  /** 待发送队列 */
  queued: string[];
  /** 已暂存条目 */
  stash: string[];
  /** 编辑某条队列项 */
  onEditQueued: (index: number, text: string) => void;
  /** 删除某条队列项 */
  onDropQueued: (index: number) => void;
  /** 队列项上移 */
  onMoveQueuedUp: (index: number) => void;
  /** 队列项下移 */
  onMoveQueuedDown: (index: number) => void;
  /** 立即发送并移除该队列项 */
  onSendQueuedNow: (index: number) => void;
  /** 清空队列 */
  onClearQueue: () => void;
  /** 队列整体停泊到暂存 */
  onStashQueue: () => void;
  /** 暂存单条弹回队列末尾 */
  onPopStashItem: (index: number) => void;
  /** 删除暂存单条 */
  onDropStashItem: (index: number) => void;
  /** 暂存整体弹回队列 */
  onPopStash: () => void;
  /** 清空暂存 */
  onClearStash: () => void;
}

/** 队列 / 暂存可视化与管理条 */
export function QueueBar({
  locale,
  queued,
  stash,
  onEditQueued,
  onDropQueued,
  onMoveQueuedUp,
  onMoveQueuedDown,
  onSendQueuedNow,
  onClearQueue,
  onStashQueue,
  onPopStashItem,
  onDropStashItem,
  onPopStash,
  onClearStash,
}: QueueBarProps) {
  const zh = locale === "zh";
  const [queueCollapsed, setQueueCollapsed] = useState(false);
  const [stashCollapsed, setStashCollapsed] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");

  if (queued.length === 0 && stash.length === 0) return null;

  /** 截断预览文本 */
  const preview = (s: string) => (s.length > 80 ? `${s.slice(0, 80)}…` : s);

  /** 开始内联编辑队列项 */
  const startEdit = (i: number, text: string) => {
    setEditingIdx(i);
    setEditDraft(text);
  };

  /** 提交内联编辑 */
  const commitEdit = () => {
    if (editingIdx == null) return;
    onEditQueued(editingIdx, editDraft);
    setEditingIdx(null);
    setEditDraft("");
  };

  return (
    <div className="queue-bar">
      {queued.length > 0 && (
        <div className="queue-group">
          <div className="queue-head">
            <button
              type="button"
              className="queue-collapse-btn"
              onClick={() => setQueueCollapsed((v) => !v)}
              aria-expanded={!queueCollapsed}
            >
              {queueCollapsed ? "▸" : "▾"}
            </button>
            <span className="queue-title">
              {zh ? "排队中" : "Queued"} ({queued.length})
            </span>
            <div className="queue-head-actions">
              <button type="button" className="btn-mini" onClick={onStashQueue}>
                {zh ? "全部暂存" : "Stash all"}
              </button>
              <button type="button" className="btn-mini" onClick={onClearQueue}>
                {zh ? "清空" : "Clear"}
              </button>
            </div>
          </div>
          {!queueCollapsed && (
            <ul className="queue-list">
              {queued.map((q, i) => (
                <li key={`q-${i}-${q.slice(0, 12)}`} className="queue-item">
                  <span className="queue-num">{i + 1}</span>
                  {editingIdx === i ? (
                    <input
                      className="queue-edit-input"
                      value={editDraft}
                      autoFocus
                      onChange={(e) => setEditDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit();
                        if (e.key === "Escape") setEditingIdx(null);
                      }}
                      onBlur={commitEdit}
                    />
                  ) : (
                    <span
                      className="queue-text"
                      title={zh ? "双击编辑" : "Double-click to edit"}
                      onDoubleClick={() => startEdit(i, q)}
                    >
                      {preview(q)}
                    </span>
                  )}
                  <div className="queue-item-actions">
                    <button
                      type="button"
                      className="queue-action"
                      title={zh ? "上移" : "Move up"}
                      disabled={i === 0}
                      onClick={() => onMoveQueuedUp(i)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="queue-action"
                      title={zh ? "下移" : "Move down"}
                      disabled={i === queued.length - 1}
                      onClick={() => onMoveQueuedDown(i)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="queue-action queue-send-now"
                      title={zh ? "立即发送" : "Send now"}
                      onClick={() => onSendQueuedNow(i)}
                    >
                      ➤
                    </button>
                    <button
                      type="button"
                      className="queue-del"
                      title={zh ? "删除" : "Drop"}
                      onClick={() => onDropQueued(i)}
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {stash.length > 0 && (
        <div className="queue-group">
          <div className="queue-head">
            <button
              type="button"
              className="queue-collapse-btn"
              onClick={() => setStashCollapsed((v) => !v)}
              aria-expanded={!stashCollapsed}
            >
              {stashCollapsed ? "▸" : "▾"}
            </button>
            <span className="queue-title">
              {zh ? "暂存" : "Stash"} ({stash.length})
            </span>
            <div className="queue-head-actions">
              <button type="button" className="btn-mini" onClick={onPopStash}>
                {zh ? "全部弹回" : "Pop all"}
              </button>
              <button type="button" className="btn-mini" onClick={onClearStash}>
                {zh ? "清空" : "Clear"}
              </button>
            </div>
          </div>
          {!stashCollapsed && (
            <ul className="queue-list">
              {stash.map((s, i) => (
                <li key={`s-${i}-${s.slice(0, 12)}`} className="queue-item queue-item-stash">
                  <span className="queue-num">{i + 1}</span>
                  <span className="queue-text" title={s}>
                    {preview(s)}
                  </span>
                  <div className="queue-item-actions">
                    <button
                      type="button"
                      className="queue-action"
                      title={zh ? "弹回队列" : "Pop to queue"}
                      onClick={() => onPopStashItem(i)}
                    >
                      ↩
                    </button>
                    <button
                      type="button"
                      className="queue-del"
                      title={zh ? "删除" : "Drop"}
                      onClick={() => onDropStashItem(i)}
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
