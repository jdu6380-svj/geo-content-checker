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
  UsersRound,
} from "lucide-react";
import Link from "next/link";

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
          {canOpenReport ? (
            <button type="button" onClick={onOpenReport} className={stage === "report" ? "is-active" : ""}>
              <FileText aria-hidden="true" />我的审查
            </button>
          ) : null}
          <Link href="/dashboard"><UsersRound aria-hidden="true" />商业工作区</Link>
        </div>

        <div className="phase-sidebar-section">
          <p>工具</p>
          {canOpenAdvice ? (
            <button type="button" onClick={onOpenAdvice} className={stage === "advice" ? "is-active" : ""}>
              <Bot aria-hidden="true" />AI 修改建议
            </button>
          ) : null}
          {canOpenRecheck ? (
            <button type="button" onClick={onOpenRecheck} className={stage === "recheck" ? "is-active" : ""}>
              <RotateCcw aria-hidden="true" />重新验证
            </button>
          ) : null}
          <button type="button" onClick={onOpenReview}><LayoutGrid aria-hidden="true" />审查模板</button>
        </div>

        <div className="phase-sidebar-section">
          <p>账户与支持</p>
          <Link href="/sign-in"><CircleHelp aria-hidden="true" />登录或注册</Link>
          <a href="/feedback" target="_blank" rel="noreferrer" onClick={onFeedbackClick}>
            <MessageSquareText aria-hidden="true" />反馈建议
          </a>
        </div>
      </nav>

      <div className="phase-sidebar-footer">
        <span className="phase-user-avatar">E</span>
        <div>
          <strong>Evidra</strong>
          <span>内容审查工作台</span>
        </div>
        <ChevronDown aria-hidden="true" />
      </div>

      <span className="phase-sidebar-hidden-icon" aria-hidden="true"><FileClock /></span>
    </aside>
  );
}
