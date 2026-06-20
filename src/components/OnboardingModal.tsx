// 首次启动向导：API Key + 工作区（M4 / 2.8 Onboarding）

import { useState } from "react";
import { isTauri, pickFolder, saveApiKey, restartBackend } from "../api/tauri";
import type { Locale } from "../i18n";

const ONBOARDING_KEY = "ds_onboarding_v1_done";

interface OnboardingModalProps {
  locale: Locale;
  onComplete: (workspace?: string) => void;
}

/** 是否已完成 onboarding */
export function isOnboardingDone(): boolean {
  return localStorage.getItem(ONBOARDING_KEY) === "1";
}

/** 标记 onboarding 完成 */
export function markOnboardingDone(): void {
  localStorage.setItem(ONBOARDING_KEY, "1");
}

/** 首次启动 Stepper */
export function OnboardingModal({ locale, onComplete }: OnboardingModalProps) {
  const zh = locale === "zh";
  const [step, setStep] = useState(0);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const finish = (workspace?: string) => {
    markOnboardingDone();
    onComplete(workspace);
  };

  /** 保存 API Key 并进入下一步 */
  const saveKey = async () => {
    if (!apiKey.trim()) {
      setErr(zh ? "请输入 API Key" : "Enter API Key");
      return;
    }
    if (!isTauri()) {
      setStep(2);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await saveApiKey(apiKey.trim());
      await restartBackend();
      setStep(2);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** 选择工作区文件夹 */
  const pickWs = async () => {
    if (!isTauri()) {
      finish();
      return;
    }
    setBusy(true);
    try {
      const dir = await pickFolder();
      finish(dir ?? undefined);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay onboarding-overlay">
      <div className="usage-modal onboarding-modal" onClick={(e) => e.stopPropagation()}>
        <div className="usage-modal-head">
          <h3>{zh ? "欢迎使用 Deepseek-GUI" : "Welcome to Deepseek-GUI"}</h3>
        </div>
        <div className="usage-modal-body">
          {step === 0 && (
            <>
              <p>
                {zh
                  ? "Deepseek-GUI 通过本地 sidecar 连接 DeepSeek Agent。接下来配置 API Key 并选择项目文件夹。"
                  : "Deepseek-GUI connects to the local DeepSeek Agent sidecar. Set up your API key and workspace."}
              </p>
              <ul className="onboarding-list">
                <li>{zh ? "三栏 IDE + 多会话 Chat" : "Three-pane IDE + multi-chat"}</li>
                <li>{zh ? "Plan / Agent / YOLO 模式" : "Plan / Agent / YOLO modes"}</li>
                <li>{zh ? "斜杠命令与 /help" : "Slash commands — try /help"}</li>
              </ul>
            </>
          )}
          {step === 1 && (
            <>
              <p>{zh ? "输入 DeepSeek API Key（仅存于本地 config.toml）" : "Enter your DeepSeek API Key (stored locally)"}</p>
              <input
                className="cfg-input onboarding-input"
                type="password"
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </>
          )}
          {step === 2 && (
            <p>
              {zh
                ? "选择项目工作区文件夹（Agent 将在此读写文件）。可稍后在菜单中更改。"
                : "Pick a workspace folder for the agent. You can change it later from the menu."}
            </p>
          )}
          {err && <p className="usage-modal-error">{err}</p>}
        </div>
        <div className="usage-modal-foot onboarding-foot">
          {step > 0 && step < 2 && (
            <button type="button" className="btn btn-mini" onClick={() => setStep((s) => s - 1)}>
              {zh ? "上一步" : "Back"}
            </button>
          )}
          <span className="status-spacer" />
          {step === 0 && (
            <button type="button" className="btn btn-primary btn-mini" onClick={() => setStep(1)}>
              {zh ? "开始" : "Start"}
            </button>
          )}
          {step === 1 && (
            <>
              <button type="button" className="btn btn-mini" onClick={() => setStep(2)}>
                {zh ? "跳过" : "Skip"}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-mini"
                disabled={busy}
                onClick={() => void saveKey()}
              >
                {zh ? "保存并继续" : "Save & continue"}
              </button>
            </>
          )}
          {step === 2 && (
            <>
              <button type="button" className="btn btn-mini" onClick={() => finish()}>
                {zh ? "稍后选择" : "Later"}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-mini"
                disabled={busy}
                onClick={() => void pickWs()}
              >
                {zh ? "选择文件夹" : "Choose folder"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
