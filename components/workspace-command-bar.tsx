"use client";

import { BarChart3, Check, FileText, RotateCcw, Sparkles } from "lucide-react";

export type WorkspaceStage = "review" | "report" | "advice" | "recheck";

export type WorkspaceStatus =
  | "empty"
  | "ready"
  | "analyzing"
  | "completed"
  | "warning"
  | "error";

type WorkspaceCommandBarProps = {
  stage: WorkspaceStage;
  status: WorkspaceStatus;
  title: string;
  canOpenReport: boolean;
  canOpenAdvice: boolean;
  canOpenRecheck: boolean;
  onOpenReview: () => void;
  onOpenReport: () => void;
  onOpenAdvice: () => void;
  onOpenRecheck: () => void;
  actionLabel?: string;
  onAction?: () => void;
};

const STAGES = [
  { id: "review", label: "提交内容", icon: FileText },
  { id: "report", label: "审查报告", icon: BarChart3 },
  { id: "advice", label: "修改建议", icon: Sparkles },
  { id: "recheck", label: "重新验证", icon: RotateCcw },
] as const;

const STATUS_META: Record<WorkspaceStatus, { label: string; className: string }> = {
  empty: { label: "等待输入", className: "workspace-state-empty" },
  ready: { label: "可以开始", className: "workspace-state-ready" },
  analyzing: { label: "正在分析", className: "workspace-state-analyzing" },
  completed: { label: "报告已就绪", className: "workspace-state-completed" },
  warning: { label: "需要人工确认", className: "workspace-state-warning" },
  error: { label: "需要处理", className: "workspace-state-error" },
};

function isStageActive(stage: WorkspaceStage, id: typeof STAGES[number]["id"]): boolean {
  if (stage === "review") return id === "review";
  if (stage === "recheck") return id === "recheck";
  if (stage === "advice") return id === "advice";
  return id === "report";
}

function isStageComplete(stage: WorkspaceStage, id: typeof STAGES[number]["id"]): boolean {
  if (stage === "review") return false;
  if (stage === "report") return id === "review";
  if (stage === "advice") return id === "review" || id === "report";
  return id !== "recheck";
}

export function WorkspaceCommandBar({
  stage,
  status,
  canOpenReport,
  canOpenAdvice,
  canOpenRecheck,
  onOpenReview,
  onOpenReport,
  onOpenAdvice,
  onOpenRecheck,
}: WorkspaceCommandBarProps) {
  const statusMeta = STATUS_META[status];
  const handlers = {
    review: onOpenReview,
    report: onOpenReport,
    advice: onOpenAdvice,
    recheck: onOpenRecheck,
  } as const;
  const availability = {
    review: true,
    report: canOpenReport,
    advice: canOpenAdvice,
    recheck: canOpenRecheck,
  } as const;

  const navigation = STAGES.map(({ id, label, icon: Icon }, index) => {
    const active = isStageActive(stage, id);
    const complete = isStageComplete(stage, id);
    const enabled = availability[id];
    return (
      <button
        key={id}
        type="button"
        onClick={handlers[id]}
        disabled={!enabled}
        aria-current={active ? "page" : undefined}
        className={`workspace-stage-button ${active ? "is-active" : ""} ${complete ? "is-complete" : ""}`}
      >
        <span className="workspace-stage-index" aria-hidden="true">
          {complete ? <Check className="size-3" /> : String(index + 1).padStart(2, "0")}
        </span>
        <span className="workspace-stage-label">
          <Icon aria-hidden="true" className="size-3.5" />
          {label}
        </span>
      </button>
    );
  });

  return (
    <>
      <div className="workspace-header-command">
        <nav className="workspace-stage-nav" aria-label="审查工作流">{navigation}</nav>
        <span className={`workspace-status-pill ${statusMeta.className}`}>
          <span className="workspace-status-dot" aria-hidden="true" />
          {statusMeta.label}
        </span>
      </div>
      <nav className="workspace-mobile-nav" aria-label="移动端审查工作流">{navigation}</nav>
    </>
  );
}
