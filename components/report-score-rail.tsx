"use client";

import { BarChart3, Info } from "lucide-react";

import { AnimatedNumber } from "@/components/ui/animated-number";
import type { LoadState } from "@/lib/client/report-state";
import type { EvaluateScoringResponse } from "@/lib/schemas/geo";

export type ReportScoreBand = {
  label: string;
  note: string;
};

type ReportScoreRailProps = {
  scoring: LoadState<EvaluateScoringResponse>;
  announceLoading: boolean;
  canRetry: boolean;
  onRetry: () => void;
};

function ScoreSkeleton({ announce }: { announce: boolean }) {
  return (
    <aside
      className="phase2-score-card animate-pulse motion-reduce:animate-none"
      role={announce ? "status" : undefined}
      aria-live={announce ? "polite" : undefined}
      aria-label="正在生成评分"
    >
      <div className="h-4 w-24 rounded bg-[var(--geo-surface-inset)]" />
      <div className="mt-5 h-16 w-36 rounded bg-[var(--geo-surface-inset)]" />
      <div className="mt-4 h-4 w-full rounded bg-[var(--geo-surface-subtle)]" />
    </aside>
  );
}

export function ReportScoreRail({
  scoring,
  announceLoading,
  canRetry,
  onRetry,
}: ReportScoreRailProps) {
  if (scoring.status === "loading" || scoring.status === "idle") {
    return <ScoreSkeleton announce={announceLoading} />;
  }

  if (scoring.status === "error") {
    return (
      <aside className="phase2-score-card is-error">
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
    <aside
      className="phase2-score-card"
      role="progressbar"
      aria-label="总体可信度评分"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={report.totalScore}
    >
      <span className="phase2-score-label">可信度评分 <Info aria-hidden="true" /></span>
      <div className="phase2-score-value">
        <strong><AnimatedNumber value={report.totalScore} /></strong>
        <span>/100</span>
      </div>
      <p>基于事实、来源、结构与可验证性的综合评估。</p>
    </aside>
  );
}
