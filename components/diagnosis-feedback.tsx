"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";

type DiagnosisFeedbackProps = {
  value?: boolean;
  enabled: boolean;
  onSubmit: (helpful: boolean) => void;
};

export function DiagnosisFeedback({ value, enabled, onSubmit }: DiagnosisFeedbackProps) {
  if (!enabled && value === undefined) return null;
  const canSubmit = enabled && value === undefined;

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-[#e1e6ea] pt-4">
      <span className="text-xs text-[#737d89]">这条诊断有帮助吗？</span>
      <button
        type="button"
        aria-label="这条诊断有帮助"
        title="有帮助"
        aria-pressed={value === true}
        disabled={!canSubmit}
        onClick={() => onSubmit(true)}
        className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold transition-colors motion-reduce:transition-none ${
          value === true
            ? "status-success"
            : "feedback-button hover:text-[var(--geo-status-success)]"
        } disabled:cursor-default disabled:opacity-70`}
      >
        <ThumbsUp aria-hidden="true" className="size-3.5" />
        有帮助
      </button>
      <button
        type="button"
        aria-label="这条诊断没有帮助"
        title="没帮助"
        aria-pressed={value === false}
        disabled={!canSubmit}
        onClick={() => onSubmit(false)}
        className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold transition-colors motion-reduce:transition-none ${
          value === false
            ? "status-danger"
            : "feedback-button hover:text-[var(--geo-status-danger)]"
        } disabled:cursor-default disabled:opacity-70`}
      >
        <ThumbsDown aria-hidden="true" className="size-3.5" />
        没帮助
      </button>
      {value !== undefined ? <span className="text-xs text-[#737d89]">感谢反馈</span> : null}
    </div>
  );
}
