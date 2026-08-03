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
        <BarChart3 aria-hidden="true" className="size-5 text-[var(--geo-status-danger)]" />
        <h2 className="mt-4 font-semibold">评分未完成</h2>
        <p role="alert" className="mt-2 text-sm leading-6 text-[var(--geo-text-muted)]">
          {scoring.error}
        </p>
        <p className="mt-2 text-xs leading-5 text-[var(--geo-text-soft)]">已完成的诊断会继续保留。重新运行会从头生成本次报告。</p>
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
        <span className="section-kicker">总体可信度评分</span>
        <BarChart3 aria-hidden="true" className="size-4 text-[var(--geo-primary)]" />
      </div>
      <div
        className="score-ring-wrap mt-5"
        role="progressbar"
        aria-label="总体可信度评分"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={report.totalScore}
      >
        <svg className="score-ring-svg" viewBox="0 0 128 128" aria-hidden="true">
          <circle className="score-ring-track" cx="64" cy="64" r="52" />
          <circle
            className="score-ring-value"
            cx="64"
            cy="64"
            r="52"
            pathLength="100"
            strokeDasharray={`${report.totalScore} 100`}
          />
        </svg>
        <div className="score-ring-center">
          <strong>{report.totalScore}</strong>
          <span>可信度评分</span>
        </div>
      </div>
      {band ? (
        <div className="mt-5 border-t border-[var(--geo-border)] pt-5">
          <span className={`status-badge inline-flex px-2.5 py-1 text-[11px] font-semibold ${BAND_STYLE[band.label] ?? "status-neutral"}`}>
            {band.label}
          </span>
          <p className="mt-2 text-sm font-medium leading-6 text-[var(--geo-text-body)]">{band.note}</p>
        </div>
      ) : null}

      <div className="mt-5 flex items-start gap-3 border-t border-[var(--geo-border)] pt-5">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--geo-info)]" />
        <div>
          <p className="text-xs font-semibold text-[var(--geo-text-body)]">四项固定维度，权重合计 100</p>
          <p className="mt-1 text-[11px] leading-5 text-[var(--geo-text-soft)]">下方评分账本说明每项得分及其审查依据。</p>
        </div>
      </div>
      <p className="mt-4 text-[11px] leading-5 text-[var(--geo-text-soft)]">
        评分衡量内容准备度，不代表实际收录或排名。
      </p>
    </aside>
  );
}
