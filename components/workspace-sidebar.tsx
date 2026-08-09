"use client";

import {
  Bot,
  ChevronDown,
  CircleHelp,
  FileClock,
  FileText,
  Folder,
  Home,
  LayoutGrid,
  MessageSquareText,
  RotateCcw,
  Settings,
  UsersRound,
} from "lucide-react";

import type { ReportWorkspaceView } from "@/components/report-workspace";
import type { WorkspaceStage } from "@/components/workspace-command-bar";

type WorkspaceSidebarProps = {
  stage: WorkspaceStage;
  reportView: ReportWorkspaceView;
  canOpenReport: boolean;
  canOpenAdvice: boolean;
  canOpenRecheck: boolean;
  onOpenReview: () => void;
  onOpenReport: () => void;
  onOpenEvidence: () => void;
  onOpenDiagnosis: () => void;
  onOpenAdvice: () => void;
  onOpenRecheck: () => void;
  feedbackUrl?: string;
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
          <button type="button" aria-disabled="true"><Folder aria-hidden="true" />草稿箱</button>
          <button type="button" aria-disabled="true"><UsersRound aria-hidden="true" />团队空间</button>
        </div>

        <div className="phase-sidebar-section">
          <p>工具</p>
          <button type="button" onClick={onOpenAdvice} disabled={!canOpenAdvice} className={stage === "advice" ? "is-active" : ""}>
            <Bot aria-hidden="true" />AI 修改建议
          </button>
          <button type="button" onClick={onOpenRecheck} disabled={!canOpenRecheck} className={stage === "recheck" ? "is-active" : ""}>
            <RotateCcw aria-hidden="true" />重新验证
          </button>
          <button type="button" aria-disabled="true"><LayoutGrid aria-hidden="true" />模板库</button>
        </div>

        <div className="phase-sidebar-section">
          <p>账户</p>
          <button type="button" aria-disabled="true"><Settings aria-hidden="true" />设置</button>
          <button type="button" aria-disabled="true"><CircleHelp aria-hidden="true" />帮助中心</button>
          <a href="/feedback" target="_blank" rel="noreferrer" onClick={onFeedbackClick}>
            <MessageSquareText aria-hidden="true" />反馈建议
          </a>
        </div>
      </nav>

      <div className="phase-sidebar-footer">
        <span className="phase-user-avatar">N</span>
        <div>
          <strong>Nana</strong>
          <span>Pro Plan</span>
        </div>
        <ChevronDown aria-hidden="true" />
      </div>

      <span className="phase-sidebar-hidden-icon" aria-hidden="true"><FileClock /></span>
    </aside>
  );
}
