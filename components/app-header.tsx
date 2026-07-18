"use client";

import { BarChart3, Circle, FileText, Lock, Plus, Sparkles } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

type AppHeaderProps = {
  analysisStarted: boolean;
  onShowEditor: () => void;
  onShowReport: () => void;
  onShowPatches: () => void;
  onNewAnalysis: () => void;
  feedbackUrl?: string;
  onFeedbackClick: () => void;
};

export function AppHeader({
  analysisStarted,
  onShowEditor,
  onShowReport,
  onShowPatches,
  onNewAnalysis,
  feedbackUrl,
  onFeedbackClick,
}: AppHeaderProps) {
  return (
    <header className="app-header sticky top-0 z-40 border-b border-[#dfe4e8] bg-white">
      <div className="mx-auto flex h-[var(--app-header-height)] max-w-[1440px] items-center gap-5 px-4 sm:px-6 lg:px-10">
        <button
          type="button"
          onClick={onShowEditor}
          className="group flex shrink-0 items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#0f766e]/15"
          aria-label="返回内容体检工作台"
        >
          <span className="brand-mark grid size-9 place-items-center rounded-md bg-[#15181d] text-xs font-bold text-white">
            理
          </span>
          <span className="leading-none">
            <span className="block text-sm font-semibold text-[#111827]">理据 GEO</span>
            <span className="mt-1 block text-[10px] font-medium text-[#89919c]">内容可信度工作台</span>
          </span>
        </button>

        <nav className="hidden h-full items-center gap-1 md:flex" aria-label="产品导航">
          <button
            type="button"
            data-active={!analysisStarted}
            aria-current={!analysisStarted ? "page" : undefined}
            onClick={onShowEditor}
            className="app-nav-item"
          >
            <FileText aria-hidden="true" className="size-3.5" />
            体检
          </button>
          <button
            type="button"
            data-active={analysisStarted}
            aria-current={analysisStarted ? "page" : undefined}
            disabled={!analysisStarted}
            onClick={onShowReport}
            className="app-nav-item disabled:cursor-default disabled:opacity-35"
          >
            <BarChart3 aria-hidden="true" className="size-3.5" />
            报告
          </button>
          <button
            type="button"
            data-active={false}
            disabled={!analysisStarted}
            onClick={onShowPatches}
            className="app-nav-item disabled:cursor-default disabled:opacity-35"
          >
            <Sparkles aria-hidden="true" className="size-3.5" />
            改写建议
          </button>
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <span className="hidden items-center gap-3 lg:inline-flex">
            <Link
              href="/privacy"
              className="text-xs font-medium text-[#7c8591] hover:text-[#111827] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#0f766e]/15"
            >
              隐私
            </Link>
            <Link
              href="/terms"
              className="text-xs font-medium text-[#7c8591] hover:text-[#111827] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#0f766e]/15"
            >
              条款
            </Link>
          </span>
          {feedbackUrl ? (
            <a
              href={feedbackUrl}
              target="_blank"
              rel="noreferrer"
              onClick={onFeedbackClick}
              className="text-xs font-medium text-[#66707c] underline-offset-4 hover:text-[#111827] hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#0f766e]/15"
            >
              反馈
            </a>
          ) : null}
          <span className="privacy-badge hidden items-center gap-1.5 border border-[#dfe4e8] bg-[#f8fafb] px-2.5 py-1.5 text-[11px] font-medium text-[#66707c] sm:inline-flex">
            <Lock aria-hidden="true" className="size-3" />
            正文不保存
          </span>
          {analysisStarted ? (
            <Button type="button" onClick={onNewAnalysis} className="h-9 rounded-md bg-[#15181d] px-3.5 text-xs font-semibold text-white shadow-none hover:bg-[#252a32]">
              <Plus aria-hidden="true" className="size-3.5" />
              新建体检
            </Button>
          ) : (
            <span className="hidden items-center gap-1.5 text-[11px] font-medium text-[#7c8591] min-[480px]:inline-flex">
              <Circle aria-hidden="true" className="size-1.5 fill-[#159587] text-[#159587]" />
              本地运行
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
