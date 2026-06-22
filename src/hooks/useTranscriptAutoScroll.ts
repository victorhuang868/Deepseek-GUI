// 聊天 transcript 自动滚底：打开/切换会话定位到最新消息，发送后跳底，流式时在底部跟随

import { useCallback, useEffect, useRef } from "react";

/** 距底部多少像素内视为「在底部」 */
const BOTTOM_THRESHOLD = 96;
/** 切换会话后强制滚底的窗口（覆盖 REST hydrate / Markdown 布局） */
const OPEN_SCROLL_MS = 800;

/**
 * 管理聊天消息区滚动：打开会话滚到底；发送后强制滚底；流式更新时仅在用户未上滑时跟随。
 * @param items 消息列表（长度或内容变化时触发跟随滚动）
 * @param running 是否正在生成（流式阶段持续跟随）
 * @param threadId 当前线程 id（切换会话时滚到底）
 */
export function useTranscriptAutoScroll(
  items: readonly unknown[],
  running: boolean,
  threadId: string | null,
) {
  const ref = useRef<HTMLDivElement>(null);
  /** 发送/转向后短暂强制滚底，忽略用户上滑状态 */
  const forceScrollRef = useRef(false);
  /** 打开会话后的强制滚底截止时间戳 */
  const openScrollUntilRef = useRef(0);

  /** 判断滚动容器是否接近底部 */
  const isNearBottom = useCallback(() => {
    const el = ref.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD;
  }, []);

  /** 滚到最底部 */
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  /** 连续滚底，覆盖 DOM 尚未完成布局的首帧 */
  const flushScrollToBottom = useCallback(() => {
    scrollToBottom("auto");
    requestAnimationFrame(() => {
      scrollToBottom("auto");
      requestAnimationFrame(() => scrollToBottom("auto"));
    });
  }, [scrollToBottom]);

  /** 是否处于「打开会话强制滚底」窗口 */
  const inOpenScrollWindow = useCallback(() => {
    return Date.now() < openScrollUntilRef.current;
  }, []);

  /** 用户发送/转向后立即滚底（Composer 提交时调用） */
  const scrollAfterSend = useCallback(() => {
    forceScrollRef.current = true;
    flushScrollToBottom();
    requestAnimationFrame(() => {
      scrollToBottom("smooth");
      requestAnimationFrame(() => {
        flushScrollToBottom();
        forceScrollRef.current = false;
      });
    });
  }, [scrollToBottom, flushScrollToBottom]);

  // 切换/打开会话：强制滚底直到历史消息灌入并完成布局
  useEffect(() => {
    if (!threadId) {
      openScrollUntilRef.current = 0;
      return;
    }
    openScrollUntilRef.current = Date.now() + OPEN_SCROLL_MS;
    forceScrollRef.current = true;
    flushScrollToBottom();
    const t1 = window.setTimeout(flushScrollToBottom, 80);
    const t2 = window.setTimeout(flushScrollToBottom, 200);
    const t3 = window.setTimeout(flushScrollToBottom, 400);
    const end = window.setTimeout(() => {
      forceScrollRef.current = false;
    }, OPEN_SCROLL_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(end);
    };
  }, [threadId, flushScrollToBottom]);

  // 消息列表或流式状态变化：在底部、刚发送或刚打开会话时跟随
  const tailKey =
    items.length > 0
      ? String((items[items.length - 1] as { text?: string; done?: boolean })?.text?.length ?? 0)
      : "0";

  useEffect(() => {
    if (
      forceScrollRef.current ||
      inOpenScrollWindow() ||
      isNearBottom() ||
      running
    ) {
      flushScrollToBottom();
    }
  }, [
    items.length,
    tailKey,
    running,
    isNearBottom,
    inOpenScrollWindow,
    flushScrollToBottom,
  ]);

  return { ref, scrollAfterSend, scrollToBottom };
}
