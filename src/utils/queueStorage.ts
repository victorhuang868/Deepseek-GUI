// Composer 排队持久化：按线程 id 写入 localStorage（对齐 TUI /queue 跨重启保留）

const QUEUE_PREFIX = "ds_queue_";

/** 某线程的队列 localStorage 键 */
export function queueStorageKey(threadId: string): string {
  return `${QUEUE_PREFIX}${threadId}`;
}

/** 读取线程排队列表 */
export function loadThreadQueue(threadId: string): string[] {
  try {
    const raw = localStorage.getItem(queueStorageKey(threadId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

/** 保存线程排队列表 */
export function saveThreadQueue(threadId: string, items: string[]): void {
  if (items.length === 0) {
    localStorage.removeItem(queueStorageKey(threadId));
    return;
  }
  localStorage.setItem(queueStorageKey(threadId), JSON.stringify(items));
}
