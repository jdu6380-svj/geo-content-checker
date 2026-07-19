"use client";

import { ArrowLeft, CalendarDays, FileText } from "lucide-react";

import { ReportScoreRail, type ReportScoreBand } from "@/components/report-score-rail";
import type { LoadState } from "@/lib/client/report-state";
import type { EvaluateScoringResponse } from "@/lib/schemas/geo";

type ReportContextRailProps = {
  title: string;
  publishedAt: string;
  reportStatus: {
    label: string;
    className: string;
  };
  scoring: LoadState<EvaluateScoringResponse>;
  scoreBand: ReportScoreBand | null;
  announceLoading: boolean;
  canRetry: boolean;
  onBackToEditor: () => void;
  onRetryScoring: () => void;
};

export function ReportContextRail({
  title,
  publishedAt,
  reportStatus,
  scoring,
  scoreBand,
  announceLoading,
  canRetry,
  onBackToEditor,
  onRetryScoring,
}: ReportContextRailProps) {
  return (
    <div id="report-core" className="report-context-rail min-w-0">
      <section className="surface-flat border-t-[3px] border-t-[#0f766e] p-4">
        <button
          type="button"
          onClick={onBackToEditor}
          className="inline-flex h-8 items-center gap-2 text-xs font-semibold text-[#69717d] hover:text-[#111827]"
        >
          <ArrowLeft aria-hidden="true" className="size-3.5" />
          返回编辑
        </button>

        <div className="mt-5 flex items-center gap-2 text-[11px] font-semibold text-[#858c97]">
          <FileText aria-hidden="true" className="size-3.5" />
          当前文章
        </div>
        <h1 className="mt-2 break-words text-lg font-semibold leading-7 text-[#111827]">
          {title || "体检报告"}
        </h1>

        <div className="mt-4 grid gap-2 border-t border-[#e7e9ed] pt-4 text-xs text-[#69717d]">
          <span className="inline-flex items-center gap-2">
            <CalendarDays aria-hidden="true" className="size-3.5" />
            {publishedAt || "未设置发布日期"}
          </span>
          <span className={`status-badge w-fit border px-2.5 py-1 text-[11px] font-semibold ${reportStatus.className}`}>
            {reportStatus.label}
          </span>
        </div>
      </section>

      <div className="mt-3">
        <ReportScoreRail
          scoring={scoring}
          band={scoreBand}
          announceLoading={announceLoading}
          canRetry={canRetry}
          onRetry={onRetryScoring}
        />
      </div>
    </div>
  );
}
