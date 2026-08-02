"use client";

import { BarChart3, ShieldCheck } from "lucide-react";

import type { LoadState } from "@/lib/client/report-state";
import type { EvaluateScoringResponse } from "@/lib/schemas/geo";

export type ReportScoreBand = {
  label: string;
  note: string;
};

type ReportScoreRailProps = {
  scoring: LoadState<EvaluateScoringResponse>;
  band: ReportScoreBand | null;
  announceLoading: boolean;
  canRetry: boolean;
  onRetry: () => void;
};

const BAND_STYLE: Record<string, string> = {
  准备充分: "status-success",
  基础良好: "status-info",
  需要补强: "status-warning",
  风险较高: "status-danger",
};

function ScoreSkeleton({ announce }: { announce: boolean }) {
  return (
    <aside
      className="score-rail min-h-[320px] animate-pulse p-5 motion-reduce:animate-none sm:p-6"
      role={announce ? "status" : undefined}
      aria-live={announce ? "polite" : undefined}
      aria-label="正在生成评分"
    >
      <div className="h-3 w-24 rounded bg-[var(--geo-surface-inset)]" />
      <div className="mt-6 h-16 w-32 rounded bg-[var(--geo-surface-inset)]" />
      <div className="mt-5 h-1 w-full rounded-full bg-[var(--geo-surface-inset)]" />
      <div className="mt-6 h-20 rounded-md bg-[var(--geo-surface-subtle)]" />
    </aside>
  );
}

export function ReportScoreRail({
  scoring,
  band,
  announceLoading,
  canRetry,
  onRetry,
}: ReportScoreRailProps) {
  if (scoring.status === "loading" || scoring.status === "idle") {
    return <ScoreSkeleton announce={announceLoading} />;
  }

  if (scoring.status === "error") {
    return (
      <aside className="score-rail flex min-h-[260px] flex-col items-start justify-center p-5 sm:p-6">
        <BarChart3 aria-hidden="true" className="size-5 text-[#c85745]" />
        <h2 className="mt-4 font-semibold">评分未完成</h2>
        <p role="alert" className="mt-2 text-sm leading-6 text-[#68707d]">
          {scoring.error}
        </p>
        <p className="mt-2 text-xs leading-5 text-[#858c97]">已完成的诊断会继续保留。重新运行会从头生成本次报告。</p>
        {canRetry ? (
          <button type="button" onClick={onRetry} className="primary-button mt-4 h-9 px-4 text-sm font-semibold">
            重新运行分析
          </button>
        ) : null}
      </aside>
    );
  }

  const report = scoring.data;

  return (
    <aside className="score-rail report-score-summary min-w-0 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="section-kicker text-[#60706e]">总体可信度评分</span>
        <BarChart3 aria-hidden="true" className="size-4 text-[#0f766e]" />
      </div>
      <div className="mt-5 flex items-end gap-2">
        <strong className="text-[58px] font-semibold leading-none tabular-nums text-[#111827]">
          {report.totalScore}
        </strong>
        <span className="pb-1 text-sm text-[#858c97]">/ 100</span>
      </div>
      <div
        className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--geo-surface-inset)]"
        role="progressbar"
        aria-label="总体可信度评分"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={report.totalScore}
      >
        <div
          className="h-full rounded-full bg-[var(--geo-text-heading)] transition-[width] duration-500 motion-reduce:transition-none"
          style={{ width: `${report.totalScore}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between font-mono text-[9px] text-[#98a0aa]" aria-hidden="true">
        <span>0</span>
        <span>50</span>
        <span>70</span>
        <span>85</span>
        <span>100</span>
      </div>
      {band ? (
        <div className="mt-5 border-t border-[#e7e9ed] pt-5">
          <span className={`status-badge inline-flex px-2.5 py-1 text-[11px] font-semibold ${BAND_STYLE[band.label] ?? "status-neutral"}`}>
            {band.label}
          </span>
          <p className="mt-2 text-sm font-medium leading-6 text-[#46515d]">{band.note}</p>
        </div>
      ) : null}

      <div className="mt-5 flex items-start gap-3 border-t border-[#e7e9ed] pt-5">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[#59636f]" />
        <div>
          <p className="text-xs font-semibold text-[#46515d]">四项固定维度，权重合计 100</p>
          <p className="mt-1 text-[11px] leading-5 text-[#858c97]">下方评分账本说明每项得分及其审查依据。</p>
        </div>
      </div>
      <p className="mt-4 text-[11px] leading-5 text-[#858c97]">
        评分衡量内容准备度，不代表实际收录或排名。
      </p>
    </aside>
  );
}
