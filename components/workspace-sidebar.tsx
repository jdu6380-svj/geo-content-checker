"use client";

import { BarChart3, FileText, MessageSquareText, RotateCcw, Sparkles } from "lucide-react";
import Link from "next/link";

import type { WorkspaceStage } from "@/components/workspace-command-bar";

type WorkspaceSidebarProps = {
  stage: WorkspaceStage;
  canOpenReport: boolean;
  canOpenAdvice: boolean;
  canOpenRecheck: boolean;
  onOpenReview: () => void;
  onOpenReport: () => void;
  onOpenAdvice: () => void;
  onOpenRecheck: () => void;
  feedbackUrl?: string;
  onFeedbackClick: () => void;
};

const ITEMS = [
  { id: "review", label: "提交内容", icon: FileText },
  { id: "report", label: "审查报告", icon: BarChart3 },
  { id: "advice", label: "修改建议", icon: Sparkles },
  { id: "recheck", label: "重新验证", icon: RotateCcw },
] as const;

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
  const availability = {
    review: true,
    report: canOpenReport,
    advice: canOpenAdvice,
    recheck: canOpenRecheck,
  } as const;
  const handlers = {
    review: onOpenReview,
    report: onOpenReport,
    advice: onOpenAdvice,
    recheck: onOpenRecheck,
  } as const;

  return (
    <aside className="workspace-sidebar" aria-label="Evidra 工作台导航">
      <div>
        <p className="workspace-sidebar-label">审查工作台</p>
        <nav className="workspace-sidebar-nav" aria-label="核心工作流">
          {ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={handlers[id]}
              disabled={!availability[id]}
              aria-current={stage === id ? "page" : undefined}
              className={`workspace-sidebar-link ${stage === id ? "is-active" : ""}`}
            >
              <Icon aria-hidden="true" className="size-4" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="workspace-sidebar-footer">
        <p>内容仅用于本次审查，所有结果需要人工复核。</p>
        <div className="workspace-sidebar-utility">
          <Link href="/privacy">隐私</Link>
          <Link href="/terms">条款</Link>
          <a href="/feedback" target="_blank" rel="noreferrer" onClick={onFeedbackClick}>
            <MessageSquareText aria-hidden="true" className="size-3.5" />
            反馈
          </a>
        </div>
      </div>
    </aside>
  );
}
