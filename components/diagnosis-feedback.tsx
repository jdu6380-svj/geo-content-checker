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
            ? "border-[#b9d9d4] bg-[#e7f4f1] text-[#0e766e]"
            : "border-[#dfe4e8] bg-white text-[#687386] hover:border-[#b9d9d4] hover:text-[#0e766e]"
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
            ? "border-[#f0d6d1] bg-[#fff8f6] text-[#a43e2b]"
            : "border-[#dfe4e8] bg-white text-[#687386] hover:border-[#f0d6d1] hover:text-[#a43e2b]"
        } disabled:cursor-default disabled:opacity-70`}
      >
        <ThumbsDown aria-hidden="true" className="size-3.5" />
        没帮助
      </button>
      {value !== undefined ? <span className="text-xs text-[#737d89]">感谢反馈</span> : null}
    </div>
  );
}
