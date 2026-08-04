"use client";

import { BarChart3 } from "lucide-react";

import type { LoadState } from "@/lib/client/report-state";
import type { EvaluateScoringResponse } from "@/lib/schemas/geo";

export type ReportScoreBand = {
  label: string;
  note: string;
};

type ReportScoreRailProps = {
  scoring: LoadState<EvaluateScoringResponse>;
  band: ReportScoreBand | null;
  riskLabel: string | null;
  primaryIssue: string | null;
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

const RISK_STYLE: Record<string, string> = {
  低风险: "status-success",
  中风险: "status-warning",
  高风险: "status-danger",
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
  riskLabel,
  primaryIssue,
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
      <span className="section-kicker">总体可信度</span>
      <div
        className="score-ring-wrap mt-4"
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
          <span><b>/ 100</b>可信度评分</span>
        </div>
      </div>
      <dl className="report-score-conclusion">
        <div>
          <dt>当前风险</dt>
          <dd className={RISK_STYLE[riskLabel ?? ""] ?? BAND_STYLE[band?.label ?? ""] ?? "status-neutral"}>
            {riskLabel ?? band?.label ?? "待评估"}
          </dd>
        </div>
        <div>
          <dt>主要问题</dt>
          <dd>{primaryIssue ?? band?.note ?? "正在汇总诊断结果"}</dd>
        </div>
      </dl>
    </aside>
  );
}
