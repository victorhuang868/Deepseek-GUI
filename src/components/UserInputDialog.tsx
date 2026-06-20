// 用户输入弹窗：处理 request_user_input 工具的 SSE user_input.required 事件

import { useMemo, useState } from "react";
import type { UserInputAnswerPayload, UserInputQuestion } from "../api/types";
import type { PendingUserInput } from "../state/useConversation";

interface UserInputDialogProps {
  pending: PendingUserInput;
  onSubmit: (inputId: string, answers: UserInputAnswerPayload[]) => void;
  onDismiss?: () => void;
}

/** 单题选项选择状态 */
type SelectionState = Record<string, Set<string>>;

/** 自由文本「其他」答案 */
type FreeTextState = Record<string, string>;

/** request_user_input 交互弹窗 */
export function UserInputDialog({ pending, onSubmit, onDismiss }: UserInputDialogProps) {
  const questions = pending.request.questions;
  const [selections, setSelections] = useState<SelectionState>(() => ({}));
  const [freeText, setFreeText] = useState<FreeTextState>(() => ({}));
  const [showOther, setShowOther] = useState<Record<string, boolean>>({});

  /** 切换单选/多选选项 */
  const toggleOption = (q: UserInputQuestion, label: string) => {
    setSelections((prev) => {
      const next = { ...prev };
      const set = new Set(next[q.id] ?? []);
      if (q.multi_select) {
        if (set.has(label)) set.delete(label);
        else set.add(label);
      } else {
        next[q.id] = new Set([label]);
        return next;
      }
      next[q.id] = set;
      return next;
    });
  };

  /** 是否已满足提交条件（每题至少一个答案） */
  const canSubmit = useMemo(() => {
    return questions.every((q) => {
      const picked = selections[q.id];
      if (picked && picked.size > 0) return true;
      if (q.allow_free_text && showOther[q.id] && (freeText[q.id]?.trim() ?? "")) return true;
      return false;
    });
  }, [questions, selections, freeText, showOther]);

  /** 组装后端 SubmitUserInputBody.answers */
  const handleSubmit = () => {
    const answers: UserInputAnswerPayload[] = [];
    for (const q of questions) {
      const picked = selections[q.id] ?? new Set<string>();
      for (const label of picked) {
        const opt = q.options.find((o) => o.label === label);
        answers.push({ id: q.id, label, value: label });
        if (opt?.description) {
          /* description 仅展示，value 用 label 与 TUI 一致 */
        }
      }
      if (q.allow_free_text && showOther[q.id]) {
        const text = (freeText[q.id] ?? "").trim();
        if (text) {
          answers.push({ id: q.id, label: "Other", value: text });
        }
      }
    }
    onSubmit(pending.inputId, answers);
  };

  return (
    <div className="modal-mask">
      <div className="modal modal-wide">
        <h3 className="modal-title">需要你的输入</h3>
        {questions.map((q) => (
          <div key={q.id} className="user-input-question">
            <h4 className="user-input-header">{q.header}</h4>
            <p className="user-input-prompt">{q.question}</p>
            <div className="user-input-options">
              {q.options.map((opt) => {
                const active = selections[q.id]?.has(opt.label) ?? false;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    className={`btn btn-mini user-input-opt${active ? " active" : ""}`}
                    onClick={() => toggleOption(q, opt.label)}
                  >
                    <strong>{opt.label}</strong>
                    {opt.description && (
                      <span className="user-input-opt-desc">{opt.description}</span>
                    )}
                  </button>
                );
              })}
            </div>
            {q.allow_free_text && (
              <div className="user-input-other">
                <label className="cfg-check">
                  <input
                    type="checkbox"
                    checked={!!showOther[q.id]}
                    onChange={(e) =>
                      setShowOther((s) => ({ ...s, [q.id]: e.target.checked }))
                    }
                  />
                  其他（自由输入）
                </label>
                {showOther[q.id] && (
                  <input
                    className="user-input-text"
                    value={freeText[q.id] ?? ""}
                    onChange={(e) =>
                      setFreeText((s) => ({ ...s, [q.id]: e.target.value }))
                    }
                    placeholder="输入自定义答案…"
                  />
                )}
              </div>
            )}
          </div>
        ))}
        <div className="modal-actions">
          {onDismiss && (
            <button type="button" className="btn" onClick={onDismiss}>
              稍后
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            提交
          </button>
        </div>
      </div>
    </div>
  );
}
