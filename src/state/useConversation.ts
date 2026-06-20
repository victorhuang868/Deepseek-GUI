// 会话状态管理 Hook
// 职责：订阅 SSE 事件流，按 item_id 聚合增量（item.delta）并落定（item.completed），
// 维护审批请求队列，以 seq 单调序去重，断线自动续传。
// P5：切换线程时保留缓存，SSE 从 latest_seq 续传而非每次从 0 全量回放。

import { useCallback, useEffect, useRef, useState } from "react";
import { RuntimeClient, type ClientConfig } from "../api/client";
import { subscribeThreadEvents } from "../api/events";
import type { RuntimeEvent, TurnItemKind, TurnItemRecord, UserInputRequest } from "../api/types";
import { extractPathsFromToolInput, extractPathsFromToolPayload, parsePathsFromDiff } from "../utils/workspacePaths";
import { getThreadConvCache, setThreadConvCache } from "./threadConvCache";
import { isTauri, translateText } from "../api/tauri";
import {
  needsTranslation,
  thinkingTranslatingLabel,
} from "../utils/translation";

/** 思考块后置翻译配置（/translate on + 中文界面） */
export interface ThinkingTranslateConfig {
  /** 目标语言（如「简体中文」）；null 表示不翻译 */
  targetLanguage: string | null;
  /** 翻译使用的模型（会话 model 或默认） */
  model: string | null;
  /** 界面语言，用于占位文案 */
  locale: "zh" | "en";
}

/** UI 层使用的消息条目模型 */
export interface UiItem {
  id: string;
  kind: TurnItemKind;
  text: string;
  /** 是否已落定（completed/failed），用于区分流式中与完成态 */
  done: boolean;
  failed?: boolean;
  /** 工具/命令名称（用于卡片标题），来自 tool.name 或 item.summary */
  title?: string;
  /** 条目开始时间戳（ms），用于推理块计时 */
  startedAt?: number;
  /** 推理/工具耗时（ms），落定时计算 */
  durationMs?: number;
  /** 文件变更关联的路径（write_file / edit_file / apply_patch） */
  filePaths?: string[];
  /** 思考块正在后置翻译中 */
  translating?: boolean;
  /** 思考块翻译失败（仍显示原文） */
  translationFailed?: boolean;
}

/** 系统级通知（沙箱拒绝、一致性状态等） */
export interface SystemNotice {
  id: string;
  kind: "sandbox" | "coherence";
  title: string;
  detail: string;
  ts: number;
}

/** 从 item 对象 / tool 对象中提取可读标题（工具名/命令） */
function extractTitle(
  payload: Record<string, unknown>,
  item: Record<string, unknown>,
): string | undefined {
  const tool = payload.tool as Record<string, unknown> | undefined;
  if (tool && typeof tool.name === "string") return tool.name;
  if (typeof item.summary === "string" && item.summary) return item.summary;
  return undefined;
}

/** 将线程详情 API 返回的 item 转为 UI 条目（冷启动灌入，避免 SSE 从 0 回放历史并弹 toast） */
function uiItemFromRecord(rec: TurnItemRecord): UiItem {
  const text = rec.detail?.trim() || rec.summary?.trim() || "";
  const st = (rec.status || "").toLowerCase();
  const done = st !== "in_progress" && st !== "queued";
  const failed = st === "failed" || st === "interrupted" || rec.kind === "error";
  return { id: rec.id, kind: rec.kind, text, done, failed };
}

/** 尝试将字符串解析为 JSON（工具 input 常存于 detail） */
function tryParseJson(text: string): unknown {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** 判断是否为会改动工作区文件的工具 */
function isFileMutatingTool(kind: string | undefined, title: string | undefined): boolean {
  if (kind === "file_change") return true;
  const t = (title || "").toLowerCase();
  return (
    t.includes("write_file") ||
    t.includes("edit_file") ||
    t.includes("apply_patch") ||
    t.includes("create_file")
  );
}

/** 从 item.completed 聚合可能变更的文件路径 */
function collectFilePathsFromCompleted(
  payload: Record<string, unknown>,
  item: Record<string, unknown>,
  existing: UiItem | undefined,
  finalText: string,
): string[] {
  const kind = (item.kind as string | undefined) || existing?.kind;
  const title = extractTitle(payload, item) || existing?.title;
  if (!isFileMutatingTool(kind, title) && !existing?.filePaths?.length) {
    return [];
  }
  const paths: string[] = [];
  if (existing?.filePaths?.length) paths.push(...existing.filePaths);
  paths.push(...extractPathsFromToolPayload(payload.tool));
  if (typeof item.detail === "string") {
    paths.push(...extractPathsFromToolInput(tryParseJson(item.detail)));
  }
  if (existing?.text) {
    paths.push(...extractPathsFromToolInput(tryParseJson(existing.text)));
  }
  paths.push(...parsePathsFromDiff(finalText || existing?.text || ""));
  return [...new Set(paths.filter(Boolean))];
}

/** 待处理的用户输入（request_user_input 工具） */
export interface PendingUserInput {
  inputId: string;
  request: UserInputRequest;
}

/** 待处理的审批请求 */
export interface PendingApproval {
  approvalId: string;
  title: string;
  detail: string;
}

/** Hook 返回的会话状态 */
export interface ConversationState {
  items: UiItem[];
  /** 当前是否有回合在进行中 */
  running: boolean;
  /** SSE 连接状态 */
  connected: boolean;
  /** 当前进行中的回合 id（用于打断/转向） */
  currentTurnId: string | null;
  /** 待处理审批 */
  approvals: PendingApproval[];
  /** 待处理用户输入（request_user_input） */
  userInputs: PendingUserInput[];
  /** 系统通知（沙箱/一致性等） */
  notices: SystemNotice[];
  /** 关闭某条系统通知 */
  dismissNotice: (id: string) => void;
  /** 回应审批 */
  resolveApproval: (approvalId: string, decision: "approve" | "reject", remember: boolean) => Promise<void>;
  /** 提交 request_user_input 答案 */
  resolveUserInput: (inputId: string, answers: import("../api/types").UserInputAnswerPayload[]) => Promise<void>;
  /** 每次回合完成自增，用于上层刷新用量统计 */
  usageTick: number;
  /** 每个文件写入完成自增，用于实时刷新资源管理器 */
  fileChangeTick: number;
  /** 最近一次写入完成的路径（用于即时打开编辑器） */
  lastFileChangePaths: string[];
  /** 上一回合 Agent 修改的文件路径（相对或绝对），回合结束时更新 */
  lastTurnChangedPaths: string[];
}

/** 从事件 payload 中安全取字符串字段 */
function str(payload: Record<string, unknown>, key: string): string {
  const v = payload[key];
  return typeof v === "string" ? v : "";
}

/**
 * 订阅指定线程的事件流并维护 UI 状态。
 * 切换线程时从进程内缓存恢复消息，SSE 从已消费的 latest_seq 续传。
 * @param cfg 客户端配置
 * @param threadId 线程 id；为空时不订阅
 * @param thinkingTranslate 思考块后置翻译（/translate on）
 */
export function useConversation(
  cfg: ClientConfig,
  threadId: string | null,
  thinkingTranslate?: ThinkingTranslateConfig,
): ConversationState {
  const [items, setItems] = useState<UiItem[]>([]);
  const [running, setRunning] = useState(false);
  const [connected, setConnected] = useState(false);
  const [currentTurnId, setCurrentTurnId] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [userInputs, setUserInputs] = useState<PendingUserInput[]>([]);
  const [notices, setNotices] = useState<SystemNotice[]>([]);
  const [usageTick, setUsageTick] = useState(0);
  const [fileChangeTick, setFileChangeTick] = useState(0);
  const [lastFileChangePaths, setLastFileChangePaths] = useState<string[]>([]);
  const [lastTurnChangedPaths, setLastTurnChangedPaths] = useState<string[]>([]);
  /** SSE 起始 seq；冷启动需等 GET /threads/{id} 灌入后再订阅，避免历史回放弹错 */
  const [sseSinceSeq, setSseSinceSeq] = useState<number | null>(null);
  const needsHydrateRef = useRef(false);

  const itemMap = useRef<Map<string, UiItem>>(new Map());
  const turnPathsRef = useRef<Set<string>>(new Set());

  /** 记录文件变更并通知 UI 即时刷新资源管理器 */
  const notifyFilePathsChanged = useCallback((paths: string[]) => {
    if (paths.length === 0) return;
    for (const fp of paths) turnPathsRef.current.add(fp);
    setLastFileChangePaths(paths);
    setFileChangeTick((n) => n + 1);
  }, []);
  /** 当前线程已消费的最大 seq */
  const latestSeqRef = useRef(0);
  /** SSE 订阅起始 seq（切换线程时从缓存读取） */
  const sinceSeqRef = useRef(0);
  const client = useRef(new RuntimeClient(cfg));
  const prevThreadRef = useRef<string | null>(null);
  /** 翻译配置（ref 避免 handle 闭包过期） */
  const translateRef = useRef(thinkingTranslate);
  translateRef.current = thinkingTranslate;
  /** 进行中的思考块翻译 item_id */
  const translatingIds = useRef(new Set<string>());

  /** 将 itemMap 同步到 React state（保持插入顺序） */
  const flush = useCallback(() => {
    setItems(Array.from(itemMap.current.values()));
  }, []);

  /** 思考块落定后异步翻译为中文（/translate on） */
  const scheduleThinkingTranslation = useCallback(
    (itemId: string) => {
      const cfgTr = translateRef.current;
      if (!cfgTr?.targetLanguage || !isTauri()) return;
      const item = itemMap.current.get(itemId);
      if (!item || item.kind !== "agent_reasoning" || !item.done) return;
      if (translatingIds.current.has(itemId)) return;
      const original = item.text.trim();
      if (!original || !needsTranslation(original)) return;

      translatingIds.current.add(itemId);
      item.translating = true;
      item.translationFailed = false;
      item.text = thinkingTranslatingLabel(cfgTr.locale);
      flush();

      void translateText(original, cfgTr.model, cfgTr.targetLanguage)
        .then((translated) => {
          const cur = itemMap.current.get(itemId);
          if (!cur) return;
          cur.text = translated;
          cur.translating = false;
          cur.translationFailed = false;
          flush();
        })
        .catch(() => {
          const cur = itemMap.current.get(itemId);
          if (!cur) return;
          cur.text = original;
          cur.translating = false;
          cur.translationFailed = true;
          flush();
        })
        .finally(() => {
          translatingIds.current.delete(itemId);
        });
    },
    [flush],
  );

  /** 持久化当前线程快照到进程内缓存 */
  const persistCurrentThread = useCallback(
    (tid: string) => {
      setThreadConvCache(tid, {
        items: Array.from(itemMap.current.values()),
        itemMap: new Map(itemMap.current),
        latestSeq: latestSeqRef.current,
        running,
        currentTurnId,
        approvals,
        usageTick,
      });
    },
    [running, currentTurnId, approvals, usageTick],
  );

  // 切换线程：保存旧线程、恢复新线程缓存
  useEffect(() => {
    const prev = prevThreadRef.current;
    if (prev && prev !== threadId) {
      setThreadConvCache(prev, {
        items: Array.from(itemMap.current.values()),
        itemMap: new Map(itemMap.current),
        latestSeq: latestSeqRef.current,
        running,
        currentTurnId,
        approvals,
        usageTick,
      });
    }

    if (!threadId) {
      itemMap.current = new Map();
      latestSeqRef.current = 0;
      sinceSeqRef.current = 0;
      setItems([]);
      setRunning(false);
      setCurrentTurnId(null);
      setApprovals([]);
      setNotices([]);
      setLastTurnChangedPaths([]);
      setLastFileChangePaths([]);
      turnPathsRef.current.clear();
      prevThreadRef.current = null;
      setSseSinceSeq(null);
      needsHydrateRef.current = false;
      return;
    }

    const cached = getThreadConvCache(threadId);
    if (cached) {
      itemMap.current = cached.itemMap;
      latestSeqRef.current = cached.latestSeq;
      sinceSeqRef.current = cached.latestSeq;
      setItems(cached.items);
      setRunning(cached.running);
      setCurrentTurnId(cached.currentTurnId);
      setApprovals(cached.approvals);
      setUsageTick(cached.usageTick);
      setSseSinceSeq(cached.latestSeq);
      needsHydrateRef.current = false;
    } else {
      itemMap.current = new Map();
      latestSeqRef.current = 0;
      sinceSeqRef.current = 0;
      setItems([]);
      setRunning(false);
      setCurrentTurnId(null);
      setApprovals([]);
      setUsageTick(0);
      setSseSinceSeq(null);
      needsHydrateRef.current = true;
    }
    setNotices([]);
    setLastTurnChangedPaths([]);
    setLastFileChangePaths([]);
    turnPathsRef.current.clear();
    prevThreadRef.current = threadId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  /** 切换线程后对照后端校正 running / currentTurnId，避免缓存与引擎状态不一致 */
  useEffect(() => {
    if (!threadId) return;
    let cancelled = false;
    void (async () => {
      try {
        const detail = await client.current.getThread(threadId);
        if (cancelled) return;

        // 冷启动：从 REST 灌入历史 item，SSE 从 latest_seq 续传，避免回放旧失败回合弹 toast
        if (needsHydrateRef.current) {
          needsHydrateRef.current = false;
          itemMap.current.clear();
          for (const rec of detail.items) {
            itemMap.current.set(rec.id, uiItemFromRecord(rec));
          }
          latestSeqRef.current = detail.latest_seq;
          sinceSeqRef.current = detail.latest_seq;
          setItems(Array.from(itemMap.current.values()));
        }
        setSseSinceSeq((prev) => prev ?? detail.latest_seq);

        const latestId = detail.thread.latest_turn_id;
        if (!latestId) {
          setRunning(false);
          setCurrentTurnId(null);
          return;
        }
        const latestTurn = detail.turns.find((t) => t.id === latestId);
        if (latestTurn?.status === "in_progress" || latestTurn?.status === "queued") {
          setCurrentTurnId(latestId);
          setRunning(true);
          await client.current.resumeThread(threadId).catch(() => {
            /* 预加载失败不阻断 UI */
          });
        } else {
          setRunning(false);
          setCurrentTurnId(null);
        }
      } catch {
        /* 离线时保留缓存状态 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [threadId, cfg.baseUrl, cfg.token]);

  /** 处理单条运行时事件 */
  const handle = useCallback(
    (evt: RuntimeEvent) => {
      // 更新 latest_seq，供缓存与断线续传
      if (evt.seq > latestSeqRef.current) {
        latestSeqRef.current = evt.seq;
      }

      const p = evt.payload || {};
      switch (evt.event) {
        case "turn.started": {
          if (evt.turn_id) setCurrentTurnId(evt.turn_id);
          setRunning(true);
          turnPathsRef.current.clear();
          break;
        }
        case "turn.completed": {
          setRunning(false);
          setCurrentTurnId(null);
          setApprovals([]);
          setUserInputs([]);
          setLastTurnChangedPaths(Array.from(turnPathsRef.current));
          turnPathsRef.current.clear();
          setUsageTick((n) => n + 1);
          break;
        }
        case "turn.lifecycle":
          break;
        case "item.started": {
          if (!evt.item_id) break;
          const item = (p.item as Record<string, unknown>) || {};
          const kind = ((item.kind as string) || "agent_message") as TurnItemKind;
          const detail = (item.detail as string) || "";
          const filePaths = extractPathsFromToolPayload(p.tool);
          itemMap.current.set(evt.item_id, {
            id: evt.item_id,
            kind,
            text: detail,
            done: false,
            title: extractTitle(p, item),
            startedAt: Date.now(),
            filePaths: filePaths.length > 0 ? filePaths : undefined,
          });
          flush();
          break;
        }
        case "item.delta": {
          if (!evt.item_id) break;
          const existing = itemMap.current.get(evt.item_id);
          const kind = (str(p, "kind") || existing?.kind || "agent_message") as TurnItemKind;
          const delta = str(p, "delta");
          if (existing) {
            existing.text += delta;
            existing.kind = kind;
          } else {
            itemMap.current.set(evt.item_id, { id: evt.item_id, kind, text: delta, done: false });
          }
          flush();
          break;
        }
        case "item.completed": {
          if (!evt.item_id) break;
          const item = (p.item as Record<string, unknown>) || {};
          const finalText = (item.detail as string) || "";
          const kind = (item.kind as string | undefined) as TurnItemKind | undefined;
          const existing = itemMap.current.get(evt.item_id);
          if (existing) {
            // 落盘前保留 started 阶段的 input JSON，便于解析 path
            const pathsBeforeOverwrite = collectFilePathsFromCompleted(p, item, existing, finalText);
            existing.done = true;
            if (kind) existing.kind = kind;
            if (finalText) existing.text = finalText;
            const t = extractTitle(p, item);
            if (t) existing.title = t;
            if (existing.startedAt && existing.durationMs === undefined) {
              existing.durationMs = Date.now() - existing.startedAt;
            }
            if (!existing.failed && pathsBeforeOverwrite.length > 0) {
              existing.filePaths = pathsBeforeOverwrite;
              notifyFilePathsChanged(pathsBeforeOverwrite);
            }
            if (existing.kind === "agent_reasoning") {
              scheduleThinkingTranslation(evt.item_id);
            }
          } else {
            const paths = collectFilePathsFromCompleted(p, item, undefined, finalText);
            itemMap.current.set(evt.item_id, {
              id: evt.item_id,
              kind: kind || "agent_message",
              text: finalText,
              done: true,
              title: extractTitle(p, item),
              filePaths: paths.length > 0 ? paths : undefined,
            });
            if (paths.length > 0) notifyFilePathsChanged(paths);
            if ((kind || "agent_message") === "agent_reasoning") {
              scheduleThinkingTranslation(evt.item_id);
            }
          }
          flush();
          break;
        }
        case "item.failed":
        case "item.interrupted": {
          if (!evt.item_id) break;
          const item = (p.item as Record<string, unknown>) || {};
          const finalText = (item.detail as string) || "";
          const kind = (item.kind as string | undefined) as TurnItemKind | undefined;
          const existing = itemMap.current.get(evt.item_id);
          if (existing) {
            existing.done = true;
            existing.failed = true;
            if (finalText) existing.text = finalText;
            if (kind) existing.kind = kind;
          } else {
            // 鉴权/引擎错误常以 item.failed 直接落盘，无前置 item.started
            itemMap.current.set(evt.item_id, {
              id: evt.item_id,
              kind: kind || "error",
              text: finalText,
              done: true,
              failed: true,
              title: extractTitle(p, item),
            });
          }
          flush();
          break;
        }
        case "user_input.required": {
          const inputId = str(p, "id");
          const request = p.request as UserInputRequest | undefined;
          if (!inputId || !request?.questions?.length) break;
          setUserInputs((prev) =>
            prev.some((u) => u.inputId === inputId)
              ? prev
              : [...prev, { inputId, request }],
          );
          break;
        }
        case "approval.required": {
          const approvalId = str(p, "approval_id") || str(p, "id");
          if (!approvalId) break;
          // 历史回放时跳过已完成的审批
          setApprovals((prev) =>
            prev.some((a) => a.approvalId === approvalId)
              ? prev
              : [
                  ...prev,
                  {
                    approvalId,
                    title: str(p, "tool_name") || "需要确认操作",
                    detail: str(p, "description"),
                  },
                ],
          );
          break;
        }
        case "approval.decided":
        case "approval.timeout": {
          const approvalId = str(p, "approval_id") || str(p, "id");
          if (approvalId) {
            setApprovals((prev) => prev.filter((a) => a.approvalId !== approvalId));
          }
          break;
        }
        case "sandbox.denied": {
          const id = `sandbox_${evt.seq}`;
          setNotices((prev) => [
            ...prev.filter((n) => n.id !== id),
            {
              id,
              kind: "sandbox",
              title: str(p, "tool_name") || str(p, "tool_id"),
              detail: str(p, "reason"),
              ts: Date.now(),
            },
          ]);
          break;
        }
        case "coherence.state": {
          const id = `coherence_${evt.seq}`;
          setNotices((prev) => [
            ...prev.filter((n) => n.id !== id),
            {
              id,
              kind: "coherence",
              title: str(p, "label") || str(p, "state"),
              detail: str(p, "description") || str(p, "reason"),
              ts: Date.now(),
            },
          ]);
          break;
        }
        default:
          break;
      }
    },
    [flush, notifyFilePathsChanged, scheduleThinkingTranslation],
  );

  // 建立/重建 SSE 订阅（冷启动需等 latest_seq 就绪，避免 since_seq=0 回放历史）
  useEffect(() => {
    if (!threadId || sseSinceSeq === null) return;
    client.current = new RuntimeClient(cfg);
    const cancel = subscribeThreadEvents(cfg, threadId, sseSinceSeq, handle, setConnected);
    return () => {
      cancel();
      // 卸载订阅前写入缓存
      if (threadId) {
        setThreadConvCache(threadId, {
          items: Array.from(itemMap.current.values()),
          itemMap: new Map(itemMap.current),
          latestSeq: latestSeqRef.current,
          running,
          currentTurnId,
          approvals,
          usageTick,
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, cfg.baseUrl, cfg.token, sseSinceSeq]);

  // 状态变化时定期同步缓存（运行中/审批变化）
  useEffect(() => {
    if (!threadId) return;
    persistCurrentThread(threadId);
  }, [threadId, items, running, currentTurnId, approvals, usageTick, persistCurrentThread]);

  const dismissNotice = useCallback((id: string) => {
    setNotices((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const resolveApproval = useCallback(
    async (approvalId: string, decision: "approve" | "reject", remember: boolean) => {
      const backendDecision = decision === "approve" ? "allow" : "deny";
      setApprovals((prev) => prev.filter((a) => a.approvalId !== approvalId));
      try {
        await client.current.decideApproval(approvalId, { decision: backendDecision, remember });
      } catch (e) {
        const msg = (e as Error).message;
        if (!msg.includes("404") && !msg.includes("no pending approval")) {
          alert(`回应审批失败：${msg}`);
        }
      }
    },
    [],
  );

  const resolveUserInput = useCallback(
    async (inputId: string, answers: import("../api/types").UserInputAnswerPayload[]) => {
      if (!threadId) return;
      setUserInputs((prev) => prev.filter((u) => u.inputId !== inputId));
      try {
        await client.current.submitUserInput(threadId, inputId, answers);
      } catch (e) {
        alert(`提交输入失败：${(e as Error).message}`);
      }
    },
    [threadId],
  );

  return {
    items,
    running,
    connected,
    currentTurnId,
    approvals,
    userInputs,
    notices,
    dismissNotice,
    resolveApproval,
    resolveUserInput,
    usageTick,
    fileChangeTick,
    lastFileChangePaths,
    lastTurnChangedPaths,
  };
}
