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
  announceLoading: boolean;
  canRetry: boolean;
  onRetry: () => void;
};

const DIMENSION_META = [
  { key: "questionCoverage", label: "问题覆盖度", barClassName: "bg-[#08766e]" },
  { key: "factCompleteness", label: "事实完整度", barClassName: "bg-[#416b8a]" },
  { key: "structureClarity", label: "结构清晰度", barClassName: "bg-[#b7791f]" },
  { key: "freshness", label: "时效性", barClassName: "bg-[#c65d4b]" },
] as const;

function ScoreSkeleton({ announce }: { announce: boolean }) {
  return (
    <aside
      className="score-rail min-h-[318px] animate-pulse p-5 motion-reduce:animate-none sm:p-6"
      role={announce ? "status" : undefined}
      aria-live={announce ? "polite" : undefined}
      aria-label="正在生成评分"
    >
      <div className="h-3 w-24 rounded bg-[#e5e7eb]" />
      <div className="mt-6 h-16 w-32 rounded bg-[#eceef1]" />
      <div className="mt-5 h-1 w-full rounded-full bg-[#eceef1]" />
      <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-[#eceef1] pt-5">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index}>
            <div className="h-3 w-20 rounded bg-[#e5e7eb]" />
            <div className="mt-3 h-1 w-full rounded-full bg-[#eceef1]" />
          </div>
        ))}
      </div>
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
    <aside className="score-rail min-w-0 p-5 sm:p-6">
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
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#e8eeec]">
        <div
          className="h-full rounded-full bg-[#0f766e] transition-[width] duration-500 motion-reduce:transition-none"
          style={{ width: `${report.totalScore}%` }}
        />
      </div>
      {band ? (
        <div className="mt-4">
          <span className="status-badge inline-flex border border-[#cfe1de] bg-[#eef8f6] px-2.5 py-1 text-[11px] font-semibold text-[#0f766e]">
            {band.label}
          </span>
          <p className="mt-2 text-xs leading-5 text-[#687386]">{band.note}</p>
        </div>
      ) : null}

      <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-[#e7e9ed] pt-5">
        {DIMENSION_META.map(({ key, label, barClassName }) => {
          const dimension = report.dimensions[key];
          const percentage = Math.round((dimension.score / dimension.max) * 100);
          return (
            <div key={key} className="min-w-0">
              <div className="flex items-start justify-between gap-2 text-[11px]">
                <span className="font-semibold leading-4 text-[#4e5561]">{label}</span>
                <span className="shrink-0 tabular-nums text-[#7a818d]">
                  {dimension.score}/{dimension.max}
                </span>
              </div>
              <div className="metric-track mt-2">
                <div
                  className={`h-full rounded-full ${barClassName} transition-[width] duration-500 motion-reduce:transition-none`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-5 text-[11px] leading-5 text-[#858c97]">
        评分衡量内容准备度，不代表实际收录或排名。
      </p>
    </aside>
  );
}
