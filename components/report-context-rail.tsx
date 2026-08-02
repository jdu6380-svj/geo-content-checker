"use client";

import { ArrowRight, CalendarDays, FileText, ShieldAlert, Sparkles } from "lucide-react";

import { EvidenceStatusBadge } from "@/components/evidence-status-badge";
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
  contentAvailable: boolean;
  restoredFromCache: boolean;
  announceLoading: boolean;
  canRetry: boolean;
  onRetryScoring: () => void;
  onFocusQuestion: (question: string) => void;
  onScrollToSection: (sectionId: string) => void;
  onBackToEditor: () => void;
};

const RISK_PRIORITY = { low: 1, medium: 2, high: 3 } as const;

const RISK_META = {
  low: { label: "低风险", className: "bg-[#e4f2ef] text-[#0b6b63]" },
  medium: { label: "中风险", className: "bg-[#fff5dc] text-[#8a5b12]" },
  high: { label: "高风险", className: "bg-[#fff0ed] text-[#a43e2b]" },
} as const;

const ANSWERABILITY_STYLE = {
  "可以完全回答": "bg-[#e4f2ef] text-[#0b6b63]",
  "信息不足": "bg-[#fff5dc] text-[#8a5b12]",
  "有风险": "bg-[#fff0ed] text-[#a43e2b]",
} as const;

export function ReportContextRail({
  title,
  publishedAt,
  reportStatus,
  scoring,
  scoreBand,
  diagnostics,
  questionOrder,
  contentAvailable,
  restoredFromCache,
  announceLoading,
  canRetry,
  onRetryScoring,
  onFocusQuestion,
  onScrollToSection,
  onBackToEditor,
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
  const diagnosticsPending = Object.values(diagnostics).some(
    (item) => item.status === "queued" || item.status === "loading",
  );

  return (
    <section id="report-core" className="report-overview-panel surface-flat min-w-0 overflow-hidden border-t-[3px] border-t-[#0f766e]">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e7e9ed] px-5 py-4 sm:px-6 sm:py-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-[#858c97]">
          <FileText aria-hidden="true" className="size-3.5" />
            当前报告
          </div>
          <h1 className="mt-2 break-words text-xl font-semibold leading-8 text-[#111827] sm:text-2xl">
            {title || "内容可信度报告"}
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

      <div className="report-overview-grid grid lg:grid-cols-[300px_minmax(0,1fr)_300px]">
        <ReportScoreRail
          scoring={scoring}
          band={scoreBand}
          announceLoading={announceLoading}
          canRetry={canRetry}
          onRetry={onRetryScoring}
        />

        <section className="report-priority-risk min-w-0 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="section-kicker text-[#60706e]">最大风险</p>
            <ShieldAlert aria-hidden="true" className="size-4 text-[#c65d4b]" />
          </div>

          {priorityItem?.data && priorityRisk ? (
            <>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <span className={`status-badge px-2.5 py-1 text-xs font-semibold ${priorityRisk.className}`}>
                  {priorityRisk.label}
                </span>
                <span className={`status-badge px-2.5 py-1 text-xs font-semibold ${ANSWERABILITY_STYLE[priorityItem.data.answerability]}`}>
                  {priorityItem.data.answerability}
                </span>
                <EvidenceStatusBadge status={priorityItem.data.evidenceStatus} />
              </div>
              <h2 className="mt-4 text-lg font-semibold leading-7 text-[#111827]">
                {priorityItem.question}
              </h2>
              <p className="mt-3 text-xs leading-5 text-[#737d89]">
                已完成诊断中：高风险 {riskCounts.high} · 中风险 {riskCounts.medium} · 低风险 {riskCounts.low}
              </p>
              <button
                type="button"
                onClick={() => onFocusQuestion(priorityItem.question)}
                className="mt-5 inline-flex h-9 items-center gap-2 text-sm font-semibold text-[#0f766e] hover:text-[#0a5f59]"
              >
                查看诊断与原文证据
                <ArrowRight aria-hidden="true" className="size-4" />
              </button>
            </>
          ) : diagnosticsPending || questionOrder.length === 0 ? (
            <div role="status" aria-live="polite" className="mt-5">
              <div className="h-5 w-28 animate-pulse rounded bg-[#e8ebef] motion-reduce:animate-none" />
              <div className="mt-4 h-4 w-full animate-pulse rounded bg-[#eef0f3] motion-reduce:animate-none" />
              <div className="mt-2 h-4 w-4/5 animate-pulse rounded bg-[#eef0f3] motion-reduce:animate-none" />
              <p className="mt-5 text-sm leading-6 text-[#687386]">诊断完成后显示优先处理的问题。</p>
            </div>
          ) : (
            <p className="mt-5 text-sm leading-6 text-[#687386]">当前没有可展示的已完成诊断。</p>
          )}
        </section>

        <section className="report-next-action min-w-0 bg-[#f7faf9] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="section-kicker text-[#60706e]">下一步行动</p>
            <Sparkles aria-hidden="true" className="size-4 text-[#5964cf]" />
          </div>
          <h2 className="mt-5 text-lg font-semibold leading-7 text-[#111827]">
            {restoredFromCache && !contentAvailable
              ? "恢复正文后重新分析"
              : priorityItem?.data
                ? "先核对证据，再执行修改"
                : "等待报告完成"}
          </h2>
          <p className="text-clamp-3 mt-3 text-sm leading-6 text-[#59636f]">
            {restoredFromCache && !contentAvailable
              ? "缓存报告不含正文与逐字引用。返回编辑器恢复内容后，可重新生成完整报告。"
              : priorityItem?.data
                ? priorityItem.data.recommendation
                : "报告完成后，这里会给出基于诊断结果的优先行动。"}
          </p>

          <div className="mt-5 grid gap-2">
            {restoredFromCache && !contentAvailable ? (
              <button type="button" onClick={onBackToEditor} className="dark-button h-10 w-full px-4 text-sm font-semibold">
                返回编辑器
              </button>
            ) : priorityItem?.data ? (
              <button
                type="button"
                onClick={() => onScrollToSection("patch-workshop")}
                className="primary-button h-10 w-full px-4 text-sm font-semibold"
              >
                前往修改与复核
                <ArrowRight aria-hidden="true" className="size-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onScrollToSection("diagnostic-section")}
                disabled={!questionOrder.length}
                className="secondary-button h-10 w-full px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                查看诊断进度
              </button>
            )}
            <p className="text-xs leading-5 text-[#858c97]">修改内容仍需人工核对，应用后请重新运行分析。</p>
          </div>
        </section>
      </div>
    </section>
  );
}
