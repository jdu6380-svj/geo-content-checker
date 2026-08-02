"use client";

import { ArrowRight, CalendarDays, FileSearch, FileText, ShieldAlert } from "lucide-react";

import { EvidenceStatusBadge } from "@/components/evidence-status-badge";
import { ReportDimensionLedger } from "@/components/report-dimension-ledger";
import { ReportScoreRail, type ReportScoreBand } from "@/components/report-score-rail";
import type { DiagnosticsState, LoadState } from "@/lib/client/report-state";
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
  diagnostics: DiagnosticsState;
  questionOrder: string[];
  announceLoading: boolean;
  canRetry: boolean;
  onRetryScoring: () => void;
  onFocusQuestion: (question: string) => void;
  onScrollToSection: (sectionId: string) => void;
};

const RISK_PRIORITY = { low: 1, medium: 2, high: 3 } as const;

const RISK_META = {
  low: {
    label: "低风险",
    className: "status-success",
    impact: "当前信息基本可支撑判断，仍建议在发布前核对引用与适用边界。",
  },
  medium: {
    label: "中风险",
    className: "status-warning",
    impact: "部分信息仍需补充或澄清，可能增加读者与 AI 搜索理解内容的判断成本。",
  },
  high: {
    label: "高风险",
    className: "status-danger",
    impact: "关键信息不足可能影响内容可信判断，建议在发布前优先核对并处理。",
  },
} as const;

const ANSWERABILITY_STYLE = {
  "可以完全回答": "status-success",
  "信息不足": "status-warning",
  "有风险": "status-danger",
} as const;

export function ReportContextRail({
  title,
  publishedAt,
  reportStatus,
  scoring,
  scoreBand,
  diagnostics,
  questionOrder,
  announceLoading,
  canRetry,
  onRetryScoring,
  onFocusQuestion,
  onScrollToSection,
}: ReportContextRailProps) {
  const diagnosticItems = questionOrder.flatMap((question) => {
    const item = diagnostics[question];
    return item?.status === "success" && item.data ? [item] : [];
  });
  const priorityItem = diagnosticItems.reduce<(typeof diagnosticItems)[number] | null>(
    (current, item) => {
      if (!current || !current.data || !item.data) return item;
      return RISK_PRIORITY[item.data.riskLevel] > RISK_PRIORITY[current.data.riskLevel]
        ? item
        : current;
    },
    null,
  );
  const riskCounts = diagnosticItems.reduce(
    (counts, item) => {
      if (item.data) counts[item.data.riskLevel] += 1;
      return counts;
    },
    { low: 0, medium: 0, high: 0 },
  );
  const priorityRisk = priorityItem?.data ? RISK_META[priorityItem.data.riskLevel] : null;
  const priorityLocations = priorityItem?.data
    ? Array.from(new Set(priorityItem.data.evidence.map((entry) => entry.paragraphId)))
    : [];
  const diagnosticsPending = Object.values(diagnostics).some(
    (item) => item.status === "queued" || item.status === "loading",
  );

  return (
    <section
      id="report-core"
      className="report-overview-panel surface-flat min-w-0 overflow-hidden border-t-[3px] border-t-[var(--geo-primary)]"
    >
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e7e9ed] px-5 py-4 sm:px-6 sm:py-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-[#858c97]">
            <FileText aria-hidden="true" className="size-3.5" />
            内容可信度审查报告
          </div>
          <h1 className="mt-2 break-words text-xl font-semibold leading-8 text-[#111827] sm:text-2xl">
            {title || "未命名内容"}
          </h1>
          <span className="mt-2 inline-flex items-center gap-2 text-xs text-[#69717d]">
            <CalendarDays aria-hidden="true" className="size-3.5" />
            {publishedAt || "未设置发布日期"}
          </span>
        </div>
        <span className={`status-badge w-fit shrink-0 border px-2.5 py-1 text-[11px] font-semibold ${reportStatus.className}`}>
          {reportStatus.label}
        </span>
      </header>

      <div className="report-overview-grid grid lg:grid-cols-[320px_minmax(0,1fr)]">
        <ReportScoreRail
          scoring={scoring}
          band={scoreBand}
          announceLoading={announceLoading}
          canRetry={canRetry}
          onRetry={onRetryScoring}
        />

        <section className="report-priority-risk min-w-0 p-5 sm:p-6" aria-labelledby="priority-risk-heading">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="section-kicker text-[#60706e]">PRIORITY FINDING</p>
              <h2 id="priority-risk-heading" className="mt-1.5 text-base font-semibold text-[#111827]">
                优先审查结论
              </h2>
            </div>
            <ShieldAlert aria-hidden="true" className="size-4 text-[#c65d4b]" />
          </div>

          {priorityItem?.data && priorityRisk ? (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className={`status-badge px-2.5 py-1 text-xs font-semibold ${priorityRisk.className}`}>
                  {priorityRisk.label}
                </span>
                <span className={`status-badge px-2.5 py-1 text-xs font-semibold ${ANSWERABILITY_STYLE[priorityItem.data.answerability]}`}>
                  {priorityItem.data.answerability}
                </span>
                <EvidenceStatusBadge status={priorityItem.data.evidenceStatus} />
              </div>

              <dl className="report-priority-ledger mt-5">
                <div>
                  <dt><span>01</span>问题</dt>
                  <dd className="font-semibold text-[#252f38]">{priorityItem.question}</dd>
                </div>
                <div>
                  <dt><span>02</span>审查影响</dt>
                  <dd>{priorityRisk.impact}</dd>
                </div>
                <div>
                  <dt><span>03</span>证据位置</dt>
                  <dd>
                    {priorityLocations.length ? (
                      <span className="flex flex-wrap gap-1.5">
                        {priorityLocations.map((paragraphId) => (
                          <span key={paragraphId} className="report-paragraph-chip">{paragraphId}</span>
                        ))}
                      </span>
                    ) : priorityItem.data.evidenceStatus === "missing" ? (
                      "原文中未找到足够的支持证据"
                    ) : (
                      "当前没有可逐字定位的有效引用"
                    )}
                  </dd>
                </div>
                <div>
                  <dt><span>04</span>处理建议</dt>
                  <dd>{priorityItem.data.recommendation}</dd>
                </div>
              </dl>

              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[#e1e5e8] pt-4">
                <button
                  type="button"
                  onClick={() => onFocusQuestion(priorityItem.question)}
                  className="inline-flex min-h-9 items-center gap-2 text-sm font-semibold text-[#0f766e] hover:text-[#0a5f59]"
                >
                  打开完整诊断
                  <ArrowRight aria-hidden="true" className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onScrollToSection("evidence-section")}
                  className="inline-flex min-h-9 items-center gap-2 text-sm font-semibold text-[#59636f] hover:text-[#252f38]"
                >
                  <FileSearch aria-hidden="true" className="size-4" />
                  查看证据账本
                </button>
                <span className="w-full text-xs leading-5 text-[#858c97]">
                  已完成诊断：高风险 {riskCounts.high} · 中风险 {riskCounts.medium} · 低风险 {riskCounts.low}
                </span>
              </div>
            </>
          ) : diagnosticsPending || questionOrder.length === 0 ? (
            <div role="status" aria-live="polite" className="mt-5">
              <div className="h-5 w-28 animate-pulse rounded bg-[var(--geo-surface-inset)] motion-reduce:animate-none" />
              <div className="mt-4 h-4 w-full animate-pulse rounded bg-[var(--geo-surface-subtle)] motion-reduce:animate-none" />
              <div className="mt-2 h-4 w-4/5 animate-pulse rounded bg-[var(--geo-surface-subtle)] motion-reduce:animate-none" />
              <p className="mt-5 text-sm leading-6 text-[#687386]">诊断完成后显示需要优先处理的问题、影响和证据位置。</p>
            </div>
          ) : (
            <p className="mt-5 text-sm leading-6 text-[#687386]">当前没有可展示的已完成诊断。</p>
          )}
        </section>
      </div>

      {scoring.status === "success" ? <ReportDimensionLedger report={scoring.data} /> : null}
    </section>
  );
}
