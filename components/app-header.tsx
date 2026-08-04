"use client";

import { Plus, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { EvidraBrandMark } from "@/components/evidra-brand-mark";

type AppHeaderProps = {
  analysisStarted: boolean;
  onShowEditor: () => void;
  onNewAnalysis: () => void;
  feedbackUrl?: string;
  onFeedbackClick: () => void;
  navigation: ReactNode;
};

export function AppHeader({
  analysisStarted,
  onShowEditor,
  onNewAnalysis,
  onFeedbackClick,
  navigation,
}: AppHeaderProps) {
  return (
    <header className="app-header sticky top-0 z-40 border-b">
      <div className="app-header-grid h-[var(--app-header-height)]">
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

        <div className="app-header-navigation min-w-0">{navigation}</div>

        <div className="app-header-actions flex items-center justify-end gap-2 sm:gap-3">
          <a
            href="/feedback"
            target="_blank"
            rel="noreferrer"
            onClick={onFeedbackClick}
            className="app-feedback-link underline-offset-4 hover:underline"
          >
            反馈
          </a>
          <span className="app-beta-status inline-flex items-center gap-1.5 border px-2.5 py-1.5">
            <ShieldCheck aria-hidden="true" className="size-3.5" />
            受控 Beta
          </span>
          {analysisStarted ? (
            <Button type="button" onClick={onNewAnalysis} className="app-new-analysis h-9 px-3 text-xs font-semibold">
              <Plus aria-hidden="true" className="size-3.5" />
              新建审查
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
