"use client";

import { Check, Circle, FileCheck2, FileText, Lightbulb, RotateCcw, SearchCheck } from "lucide-react";

import type { ReportWorkspaceView } from "@/components/report-workspace";

type ReportFlowStepperProps = {
  activeView: ReportWorkspaceView;
  reportComplete: boolean;
  flowComplete: boolean;
  recheckAvailable: boolean;
  onNavigate: (view: ReportWorkspaceView) => void;
};

const STEPS = [
  { view: "overview" as const, label: "总览", detail: "评分结果", icon: FileText },
  { view: "evidence" as const, label: "依据", detail: "Evidence", icon: FileCheck2 },
  { view: "diagnosis" as const, label: "诊断", detail: "问题定位", icon: SearchCheck },
  { view: "patch" as const, label: "优化建议", detail: "可选操作", icon: Lightbulb },
  { view: "recheck" as const, label: "重新验证", detail: "修改后复核", icon: RotateCcw },
];

export function ReportFlowStepper({
  activeView,
  reportComplete,
  flowComplete,
  recheckAvailable,
  onNavigate,
}: ReportFlowStepperProps) {
  const activeIndex = Math.max(0, STEPS.findIndex((step) => step.view === activeView));
  const isUnlocked = (view: ReportWorkspaceView) => {
    if (view === "overview") return true;
    if (view === "evidence" || view === "diagnosis") return reportComplete;
    if (view === "patch") return flowComplete;
    return recheckAvailable;
  };

  return (
    <nav className="report-flow-stepper" aria-label="审查流程">
      <div className="report-flow-stepper-heading">
        <div>
          <span className="data-label">审查流程</span>
          <strong>按步骤完成内容优化</strong>
        </div>
        <span className="report-flow-stepper-progress">第 {activeIndex + 1} 步，共 {STEPS.length} 步</span>
      </div>
      <ol>
        {STEPS.map(({ view, label, detail, icon: Icon }, index) => {
          const unlocked = isUnlocked(view);
          const active = activeView === view;
          const completed = unlocked && index < activeIndex;
          return (
            <li key={view} className={`${active ? "is-active" : ""} ${completed ? "is-complete" : ""} ${!unlocked ? "is-locked" : ""}`}>
              {index > 0 ? <span className="report-flow-stepper-line" aria-hidden="true" /> : null}
              <button
                type="button"
                disabled={!unlocked}
                aria-current={active ? "step" : undefined}
                onClick={() => onNavigate(view)}
              >
                <span className="report-flow-stepper-icon" aria-hidden="true">
                  {completed ? <Check /> : unlocked ? <Icon /> : <Circle />}
                </span>
                <span className="report-flow-stepper-copy"><strong>{label}</strong><small>{detail}</small></span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
