"use client";

import {
  Bot,
  FileText,
  Home,
  MessageSquareText,
  RotateCcw,
} from "lucide-react";

import type { WorkspaceStage } from "@/components/workspace-command-bar";

type WorkspaceSidebarProps = {
  stage: WorkspaceStage;
  canOpenReport: boolean;
  canOpenAdvice: boolean;
  canOpenRecheck: boolean;
  onOpenReview: () => void;
  onOpenReport: () => void;
  onOpenEvidence: () => void;
  onOpenDiagnosis: () => void;
  onOpenAdvice: () => void;
  onOpenRecheck: () => void;
  onFeedbackClick: () => void;
};

export function WorkspaceSidebar({
  stage,
  canOpenReport,
  canOpenAdvice,
  canOpenRecheck,
  onOpenReview,
  onOpenReport,
  onOpenAdvice,
  onOpenRecheck,
  onFeedbackClick,
}: WorkspaceSidebarProps) {
  return (
    <aside className="workspace-sidebar" aria-label="Evidra 工作台导航">
      <nav className="phase-sidebar-nav">
        <button
          type="button"
          className={`phase-sidebar-home ${stage === "review" ? "is-active" : ""}`}
          onClick={onOpenReview}
          aria-current={stage === "review" ? "page" : undefined}
        >
          <Home aria-hidden="true" />
          首页
        </button>

        <div className="phase-sidebar-section">
          <p>工作空间</p>
          <button type="button" onClick={onOpenReport} disabled={!canOpenReport} className={stage === "report" ? "is-active" : ""}>
            <FileText aria-hidden="true" />我的审查
          </button>
        </div>

        <div className="phase-sidebar-section">
          <p>工具</p>
          <button type="button" onClick={onOpenAdvice} disabled={!canOpenAdvice} className={stage === "advice" ? "is-active" : ""}>
            <Bot aria-hidden="true" />修改建议
          </button>
          <button type="button" onClick={onOpenRecheck} disabled={!canOpenRecheck} className={stage === "recheck" ? "is-active" : ""}>
            <RotateCcw aria-hidden="true" />重新验证
          </button>
        </div>

        <div className="phase-sidebar-section">
          <p>交流</p>
          <a href="/feedback" target="_blank" rel="noreferrer" onClick={onFeedbackClick}>
            <MessageSquareText aria-hidden="true" />反馈建议
          </a>
        </div>
      </nav>

    </aside>
  );
}
