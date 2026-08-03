"use client";

import { Plus, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EvidraBrandMark } from "@/components/evidra-brand-mark";

type AppHeaderProps = {
  analysisStarted: boolean;
  onShowEditor: () => void;
  onNewAnalysis: () => void;
  feedbackUrl?: string;
  onFeedbackClick: () => void;
};

export function AppHeader({
  analysisStarted,
  onShowEditor,
  onNewAnalysis,
  feedbackUrl,
  onFeedbackClick,
}: AppHeaderProps) {
  return (
    <header className="app-header sticky top-0 z-40 border-b">
      <div className="mx-auto flex h-[var(--app-header-height)] max-w-[1440px] items-center gap-4 px-4 sm:px-6 lg:px-10">
        <button
          type="button"
          onClick={onShowEditor}
          className="app-brand group flex min-h-11 shrink-0 items-center gap-3 text-left"
          aria-label="返回 Evidra 内容审查工作台"
        >
          <EvidraBrandMark className="brand-mark size-9 shrink-0" />
          <span className="leading-none">
            <span className="app-brand-name block">Evidra</span>
            <span className="app-brand-subtitle mt-1 block">内容可信度审查</span>
          </span>
        </button>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <span className="hidden items-center gap-3 lg:inline-flex">
            <Link
              href="/privacy"
              className="app-utility-link"
            >
              隐私
            </Link>
            <Link
              href="/terms"
              className="app-utility-link"
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
              className="app-feedback-link underline-offset-4 hover:underline"
            >
              反馈
            </a>
          ) : null}
          {analysisStarted ? (
            <Button type="button" onClick={onNewAnalysis} className="app-new-analysis h-9 px-3.5 text-xs font-semibold">
              <Plus aria-hidden="true" className="size-3.5" />
              新建审查
            </Button>
          ) : (
            <span className="app-beta-status hidden items-center gap-1.5 border px-2.5 py-1.5 min-[480px]:inline-flex">
              <ShieldCheck aria-hidden="true" className="size-3.5" />
              受控 Beta
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
