// Composer Vim 模式：Normal/Insert 基础键位（对齐 TUI composer vim 子集）

import { useCallback, useEffect, useState, type KeyboardEvent, type RefObject } from "react";
import {
  loadComposerVimEnabled,
  setComposerVimEnabled,
  type ComposerVimMode,
} from "../utils/guiPrefs";

/** Vim 键位处理参数 */
export interface ComposerVimOptions {
  /** 当前文本 */
  text: string;
  /** 更新文本 */
  setText: (next: string) => void;
  /** textarea 引用 */
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

/** 在 textarea 上设置光标位置 */
function setCaret(ta: HTMLTextAreaElement, pos: number): void {
  const p = Math.max(0, Math.min(pos, ta.value.length));
  ta.setSelectionRange(p, p);
  ta.focus();
}

/** 行首偏移 */
function lineStart(val: string, pos: number): number {
  return val.lastIndexOf("\n", pos - 1) + 1;
}

/** 行首/行尾/上下行移动 */
function moveLine(ta: HTMLTextAreaElement, dir: -1 | 1): void {
  const val = ta.value;
  const pos = ta.selectionStart;
  const ls = lineStart(val, pos);
  let lineEnd = val.indexOf("\n", pos);
  if (lineEnd === -1) lineEnd = val.length;
  const col = pos - ls;
  if (dir === -1 && ls > 0) {
    const prevStart = val.lastIndexOf("\n", ls - 2) + 1;
    const prevEnd = ls - 1;
    const prevLen = prevEnd - prevStart;
    setCaret(ta, prevStart + Math.min(col, prevLen));
  } else if (dir === 1 && lineEnd < val.length) {
    const nextStart = lineEnd + 1;
    const nextEnd = val.indexOf("\n", nextStart);
    const nextLen = (nextEnd === -1 ? val.length : nextEnd) - nextStart;
    setCaret(ta, nextStart + Math.min(col, nextLen));
  }
}

/** Composer Vim 状态与控制 */
export function useComposerVim(opts: ComposerVimOptions) {
  const [vimOn, setVimOn] = useState(() => loadComposerVimEnabled());
  const [mode, setMode] = useState<ComposerVimMode>("insert");

  useEffect(() => {
    const sync = () => setVimOn(loadComposerVimEnabled());
    window.addEventListener("ds-prefs-changed", sync);
    return () => window.removeEventListener("ds-prefs-changed", sync);
  }, []);

  /** Normal 模式键位 */
  const handleVimKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (!vimOn || mode !== "normal") return false;
      const ta = opts.textareaRef.current;
      if (!ta) return false;

      const pos = ta.selectionStart;
      const val = opts.text;

      switch (e.key) {
        case "i":
          setMode("insert");
          e.preventDefault();
          return true;
        case "a":
          setMode("insert");
          setCaret(ta, pos + 1);
          e.preventDefault();
          return true;
        case "h":
          setCaret(ta, pos - 1);
          e.preventDefault();
          return true;
        case "l":
          setCaret(ta, pos + 1);
          e.preventDefault();
          return true;
        case "k":
        case "ArrowUp":
          moveLine(ta, -1);
          e.preventDefault();
          return true;
        case "j":
        case "ArrowDown":
          moveLine(ta, 1);
          e.preventDefault();
          return true;
        case "0":
          setCaret(ta, lineStart(val, pos));
          e.preventDefault();
          return true;
        case "$": {
          let lineEnd = val.indexOf("\n", pos);
          if (lineEnd === -1) lineEnd = val.length;
          setCaret(ta, lineEnd);
          e.preventDefault();
          return true;
        }
        case "x":
          if (pos < val.length) {
            opts.setText(val.slice(0, pos) + val.slice(pos + 1));
            setCaret(ta, pos);
          }
          e.preventDefault();
          return true;
        case "o": {
          const lineEnd = val.indexOf("\n", pos);
          const ins = lineEnd === -1 ? val.length : lineEnd;
          opts.setText(`${val.slice(0, ins)}\n${val.slice(ins)}`);
          setMode("insert");
          setCaret(ta, ins + 1);
          e.preventDefault();
          return true;
        }
        default:
          return false;
      }
    },
    [vimOn, mode, opts],
  );

  /** Escape → Normal */
  const onEscapeToNormal = useCallback(() => {
    if (vimOn) setMode("normal");
  }, [vimOn]);

  const toggleVim = useCallback((on?: boolean) => {
    const next = on ?? !loadComposerVimEnabled();
    setComposerVimEnabled(next);
    setVimOn(next);
    setMode("insert");
  }, []);

  return {
    vimOn,
    vimMode: mode,
    toggleVim,
    handleVimKeyDown,
    onEscapeToNormal,
  };
}
