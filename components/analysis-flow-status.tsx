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
  steps?: AnalysisFlowStep[];
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
  steps = [],
  tone,
}: AnalysisFlowStatusProps) {
  return (
    <section
      className="analysis-flow-status mt-4 overflow-hidden"
      aria-busy={tone === "loading"}
    >
      <div
        className="analysis-flow-summary flex flex-col gap-2 px-1 py-2 sm:flex-row sm:items-center sm:justify-between"
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
      </div>

      {steps.length ? (
        <ol className="analysis-flow-steps mt-2 grid overflow-hidden rounded-md border border-[var(--geo-border)] bg-white sm:grid-cols-2 xl:grid-cols-4">
          {steps.map((step, index) => (
            <li
              key={step.id}
              className={`analysis-flow-step analysis-flow-step-${step.status} flex min-w-0 items-center gap-2 border-b border-[var(--geo-border)] px-3 py-2.5 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 xl:border-b-0 xl:border-r xl:last:border-r-0`}
              aria-label={`${step.label}：${STATUS_LABEL[step.status]}`}
            >
              <span className="analysis-flow-step-icon grid size-7 shrink-0 place-items-center rounded-md border">
                <StepIcon status={step.status} />
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="geo-soft text-[10px] font-bold tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                  <span className="geo-body text-xs font-semibold">{step.label}</span>
                </span>
                {step.meta ? <span className="geo-muted mt-0.5 block text-[10px] font-medium">{step.meta}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
