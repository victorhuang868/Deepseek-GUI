// 环境诊断面板：设置 → 连接页运行 deepseek doctor（M4 / 4.4）

import { useCallback, useState } from "react";
import { isTauri, runDoctor } from "../api/tauri";
import type { Locale } from "../i18n";

interface DoctorPanelProps {
  locale: Locale;
}

/** deepseek doctor 诊断输出 */
export function DoctorPanel({ locale }: DoctorPanelProps) {
  const zh = locale === "zh";
  const [output, setOutput] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /** 运行 doctor 并展示 stdout */
  const run = useCallback(async () => {
    if (!isTauri()) {
      setErr(zh ? "诊断仅在桌面版可用" : "Doctor requires desktop app");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      setOutput(await runDoctor());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [zh]);

  return (
    <div className="doctor-panel">
      <h4 className="settings-subsection-title">{zh ? "环境诊断" : "Diagnostics"}</h4>
      <p className="settings-section-desc">
        {zh
          ? "运行 codewhale-tui doctor，检查 sidecar、配置与网络。"
          : "Run codewhale-tui doctor to check sidecar, config, and network."}
      </p>
      <button type="button" className="btn btn-mini" disabled={loading} onClick={() => void run()}>
        {loading ? (zh ? "运行中…" : "Running…") : "deepseek doctor"}
      </button>
      {err && <p className="settings-hint settings-hint-error">{err}</p>}
      {output && <pre className="doctor-output">{output}</pre>}
    </div>
  );
}
