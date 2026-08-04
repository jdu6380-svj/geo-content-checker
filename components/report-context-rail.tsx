"use client";

import { ArrowRight, FileSearch } from "lucide-react";

import { EvidenceStatusBadge } from "@/components/evidence-status-badge";
import { ReportDimensionLedger } from "@/components/report-dimension-ledger";
import { ReportScoreRail, type ReportScoreBand } from "@/components/report-score-rail";
import type { DiagnosticsState, LoadState } from "@/lib/client/report-state";
import type { EvaluateScoringResponse } from "@/lib/schemas/geo";

type ReportContextRailProps = {
  title: string;
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

const EVIDENCE_LABEL = {
  valid: "证据有效",
  missing: "证据缺失",
  invalid: "证据无效",
} as const;

export function ReportContextRail({
  title,
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
  const keyFindings = diagnosticItems
    .flatMap((item) => item.data ? [{ question: item.question, data: item.data }] : [])
    .sort((left, right) => RISK_PRIORITY[right.data.riskLevel] - RISK_PRIORITY[left.data.riskLevel])
    .slice(0, 3);
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
      className="report-overview-panel surface-flat min-w-0 overflow-hidden"
    >
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--geo-border)] px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <p className="section-kicker">内容可信度审查报告</p>
          <h1 className="mt-1.5 break-words text-lg font-semibold leading-7 text-[var(--geo-text-heading)] sm:text-xl">
            {title || "未命名内容"}
          </h1>
        </div>
        <span className={`status-badge w-fit shrink-0 border px-2.5 py-1 text-[11px] font-semibold ${reportStatus.className}`}>
          {reportStatus.label}
        </span>
      </header>

      <div className="report-overview-grid grid lg:grid-cols-[320px_minmax(0,1fr)]">
        <ReportScoreRail
          scoring={scoring}
          band={scoreBand}
          riskLabel={priorityRisk?.label ?? null}
          primaryIssue={priorityItem?.question ?? null}
          announceLoading={announceLoading}
          canRetry={canRetry}
          onRetry={onRetryScoring}
        />

        <section className="report-priority-risk min-w-0 p-5 sm:p-6" aria-labelledby="priority-risk-heading">
          <div className="report-risk-heading">
            <div>
              <p className="section-kicker">风险摘要</p>
              <h2 id="priority-risk-heading" className="mt-1.5 text-base font-semibold text-[var(--geo-text-heading)]">
                当前最需处理的问题
              </h2>
            </div>
            <span className="report-risk-counts">
              高 {riskCounts.high} · 中 {riskCounts.medium} · 低 {riskCounts.low}
            </span>
          </div>

          {priorityItem?.data && priorityRisk ? (
            <>
              <div className="report-risk-conclusion">
                <div>
                  <span>当前风险</span>
                  <strong className={priorityRisk.className}>{priorityRisk.label}</strong>
                </div>
                <div>
                  <span>证据状态</span>
                  <EvidenceStatusBadge status={priorityItem.data.evidenceStatus} />
                </div>
              </div>

              <dl className="report-priority-ledger mt-4">
                <div>
                  <dt><span>01</span>问题</dt>
                  <dd>
                    <strong className="font-semibold text-[var(--geo-text-heading)]">{priorityItem.question}</strong>
                  </dd>
                </div>
                <div>
                  <dt><span>02</span>影响</dt>
                  <dd>{priorityRisk.impact}</dd>
                </div>
                <div>
                  <dt><span>03</span>原文位置</dt>
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
                  <dt><span>04</span>处理方向</dt>
                  <dd>{priorityItem.data.recommendation}</dd>
                </div>
              </dl>

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                <button
                  type="button"
                  onClick={() => onFocusQuestion(priorityItem.question)}
                  className="inline-flex min-h-9 items-center gap-2 text-sm font-semibold text-[var(--geo-primary)] hover:text-[var(--geo-primary-hover)]"
                >
                  查看诊断详情
                  <ArrowRight aria-hidden="true" className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onScrollToSection("evidence-section")}
                  className="inline-flex min-h-9 items-center gap-2 text-sm font-semibold text-[#59636f] hover:text-[#252f38]"
                >
                  <FileSearch aria-hidden="true" className="size-4" />
                  查看原文证据
                </button>
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

      <section className="report-key-findings" aria-labelledby="report-key-findings-heading">
        <header className="report-key-findings-header">
          <div>
            <p className="section-kicker">优先级</p>
            <h2 id="report-key-findings-heading">关键风险（Top 3）</h2>
          </div>
          <span>{keyFindings.length ? `显示 ${keyFindings.length} 项真实诊断` : "等待诊断"}</span>
        </header>

        {keyFindings.length ? (
          <ol className="report-key-findings-list">
            {keyFindings.map(({ question, data }, index) => {
              const risk = RISK_META[data.riskLevel];
              return (
                <li key={question}>
                  <button type="button" onClick={() => onFocusQuestion(question)}>
                    <span className="report-finding-index">{String(index + 1).padStart(2, "0")}</span>
                    <span className="report-finding-copy">
                      <strong>{question}</strong>
                      <small>{risk.impact}</small>
                    </span>
                    <span className={`report-finding-state ${risk.className}`}>{risk.label}</span>
                    <span className="report-finding-evidence">证据：{EVIDENCE_LABEL[data.evidenceStatus]}</span>
                    <ArrowRight aria-hidden="true" className="report-finding-arrow size-4" />
                  </button>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="report-key-findings-empty">诊断完成后，这里会列出需要优先处理的风险与证据状态。</p>
        )}
      </section>
    </section>
  );
}
