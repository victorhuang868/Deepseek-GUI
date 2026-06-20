// CLI Exec 面板：对齐 TUI `deepseek exec`，在任务页运行一次性非交互命令

import { useCallback, useState } from "react";
import { isTauri, runCliExec } from "../api/tauri";
import type { Locale } from "../i18n";

interface ExecPanelProps {
  locale: Locale;
  /** 当前工作区根目录 */
  workspace: string | null;
}

/** 非交互 exec 表单与输出 */
export function ExecPanel({ locale, workspace }: ExecPanelProps) {
  const zh = locale === "zh";
  const [prompt, setPrompt] = useState("");
  const [auto, setAuto] = useState(false);
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<string | null>(null);

  /** 调用 codewhale-tui exec */
  const onRun = useCallback(async () => {
    if (!prompt.trim()) {
      alert(zh ? "请填写 prompt" : "Enter a prompt");
      return;
    }
    if (!isTauri()) {
      alert(zh ? "exec 仅在桌面版可用" : "exec requires desktop app");
      return;
    }
    setRunning(true);
    setOutput(null);
    try {
      const text = await runCliExec({
        prompt: prompt.trim(),
        auto,
        workspace: workspace ?? undefined,
      });
      setOutput(text || (zh ? "(无输出)" : "(no output)"));
    } catch (e) {
      setOutput(String((e as Error).message));
    } finally {
      setRunning(false);
    }
  }, [prompt, auto, workspace, zh]);

  if (!isTauri()) {
    return (
      <div className="exec-panel exec-panel-disabled">
        <p>{zh ? "CLI Exec 需桌面版 Tauri 壳。" : "CLI Exec requires the desktop app."}</p>
      </div>
    );
  }

  return (
    <div className="exec-panel">
      <h4 className="exec-panel-title">{zh ? "CLI Exec（deepseek exec）" : "CLI Exec (deepseek exec)"}</h4>
      <p className="exec-panel-desc">
        {zh
          ? "一次性非交互 Agent 运行；开启「Auto」等同 --auto（工具自动批准）。"
          : "One-shot non-interactive agent run; Auto maps to --auto."}
      </p>
      <textarea
        className="exec-prompt"
        rows={2}
        placeholder={zh ? "例如：列出 src 目录并总结结构" : "e.g. summarize the src/ layout"}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <div className="exec-form-row">
        <label className="task-check">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          --auto
        </label>
        <button type="button" className="btn btn-mini btn-primary" disabled={running} onClick={() => void onRun()}>
          {running ? (zh ? "运行中…" : "Running…") : zh ? "运行 exec" : "Run exec"}
        </button>
      </div>
      {output != null && <pre className="exec-output">{output}</pre>}
    </div>
  );
}
