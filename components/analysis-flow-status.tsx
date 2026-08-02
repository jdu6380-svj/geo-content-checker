"use client";

import { AlertCircle, Check, Circle, LoaderCircle } from "lucide-react";

type AnalysisFlowStepStatus = "waiting" | "active" | "complete" | "error";

export type AnalysisFlowStep = {
  id: string;
  label: string;
  description: string;
  status: AnalysisFlowStepStatus;
  meta?: string;
};

type AnalysisFlowStatusProps = {
  title: string;
  description: string;
  steps: AnalysisFlowStep[];
  tone: "loading" | "success" | "error";
};

const STATUS_LABEL: Record<AnalysisFlowStepStatus, string> = {
  waiting: "等待",
  active: "进行中",
  complete: "完成",
  error: "失败",
};

function StepIcon({ status }: { status: AnalysisFlowStepStatus }) {
  if (status === "complete") return <Check aria-hidden="true" className="size-3.5" />;
  if (status === "active") {
    return <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />;
  }
  if (status === "error") return <AlertCircle aria-hidden="true" className="size-3.5" />;
  return <Circle aria-hidden="true" className="size-2.5" />;
}

export function AnalysisFlowStatus({
  title,
  description,
  steps,
  tone,
}: AnalysisFlowStatusProps) {
  return (
    <section
      className="analysis-flow-status surface-flat mt-4 overflow-hidden"
      aria-busy={tone === "loading"}
    >
      <div
        className="analysis-flow-summary flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`analysis-flow-summary-dot analysis-flow-summary-dot-${tone}`} aria-hidden="true" />
            <h2 className="geo-heading text-sm font-semibold">{title}</h2>
          </div>
          <p className="geo-muted mt-1 text-xs leading-5 sm:ml-4">{description}</p>
        </div>
        {tone === "loading" ? (
          <span className="geo-soft shrink-0 text-[11px] font-medium">评分与问题识别可能并行进行</span>
        ) : null}
      </div>

      <ol className="analysis-flow-steps grid border-t border-[var(--geo-border)] sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((step, index) => (
          <li
            key={step.id}
            className={`analysis-flow-step analysis-flow-step-${step.status} flex min-w-0 gap-3 border-b border-[var(--geo-border)] px-4 py-3 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 xl:border-b-0 xl:border-r xl:last:border-r-0`}
          >
            <span className="analysis-flow-step-icon mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border">
              <StepIcon status={step.status} />
            </span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="geo-soft text-[10px] font-bold tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                <span className="geo-body text-xs font-semibold">{step.label}</span>
                <span className="analysis-flow-step-state text-[10px] font-semibold">{STATUS_LABEL[step.status]}</span>
              </span>
              <span className="geo-muted mt-1 block text-[11px] leading-5">{step.description}</span>
              {step.meta ? <span className="geo-muted mt-1 block text-[10px] font-medium">{step.meta}</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
