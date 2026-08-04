"use client";

import { ArrowRight, FileSearch } from "lucide-react";

import { EvidenceStatusBadge } from "@/components/evidence-status-badge";
import { ReportActionRail } from "@/components/report-action-rail";
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
  completedCount: number;
  evidenceCount: number;
  contentAvailable: boolean;
  restoredFromCache: boolean;
  onBackToEditor: () => void;
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
  completedCount,
  evidenceCount,
  contentAvailable,
  restoredFromCache,
  onBackToEditor,
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
  const priorityRisk = priorityItem?.data ? RISK_META[priorityItem.data.riskLevel] : null;
  const diagnosticsPending = Object.values(diagnostics).some(
    (item) => item.status === "queued" || item.status === "loading",
  );

  return (
    <section id="report-core" className="report-overview-panel min-w-0">
      <header className="report-header-line">
        <div className="min-w-0">
          <p className="section-kicker">审查报告</p>
          <h1 className="report-page-title">
            {title || "未命名内容"}
          </h1>
          <p className="report-page-subtitle">内容可信度审查 · 结论、判断依据与下一步行动</p>
        </div>
        <span className={`report-status-label ${reportStatus.className}`}>
          {reportStatus.label}
        </span>
      </header>

      <div className="report-hero-grid">
        <ReportScoreRail
          scoring={scoring}
          announceLoading={announceLoading}
          canRetry={canRetry}
          onRetry={onRetryScoring}
        />

        <section className="report-priority-risk" aria-labelledby="priority-risk-heading">
          <p className="section-kicker">审查结论</p>

          {priorityItem?.data && priorityRisk ? (
            <>
              <h2 id="priority-risk-heading" className="report-conclusion-title">
                当前风险：<span className={priorityRisk.className}>{priorityRisk.label.replace("风险", "")}</span>
              </h2>
              <p className="report-conclusion-summary">{priorityRisk.impact}</p>
              {scoreBand ? <p className="report-score-band-note">{scoreBand.label} · {scoreBand.note}</p> : null}
              <div className="report-conclusion-block report-conclusion-issues">
                <span>主要问题</span>
                <ul>
                  {keyFindings.map(({ question }) => <li key={question}>{question}</li>)}
                </ul>
              </div>
              <div className="report-conclusion-block is-evidence">
                <span>证据状态</span>
                <EvidenceStatusBadge status={priorityItem.data.evidenceStatus} />
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

        <ReportActionRail
          completedCount={completedCount}
          totalCount={questionOrder.length}
          evidenceCount={evidenceCount}
          contentAvailable={contentAvailable}
          restoredFromCache={restoredFromCache}
          onScrollToSection={onScrollToSection}
          onBackToEditor={onBackToEditor}
        />
      </div>

      <section className="report-key-findings" aria-labelledby="report-key-findings-heading">
        <header className="report-key-findings-header">
          <div>
            <p className="section-kicker">优先级</p>
            <h2 id="report-key-findings-heading">关键风险（Top 3）</h2>
          </div>
          <span>{keyFindings.length ? `基于 ${keyFindings.length} 项最高优先级诊断` : "等待诊断"}</span>
        </header>

        {keyFindings.length ? (
          <ol className="report-key-findings-list">
            {keyFindings.map(({ question, data }, index) => {
              const risk = RISK_META[data.riskLevel];
              return (
                <li key={question}>
                  <button type="button" onClick={() => onFocusQuestion(question)}>
                    <span className={`report-finding-index risk-${data.riskLevel}`}>{String(index + 1).padStart(2, "0")}</span>
                    <span className="report-finding-copy">
                      <strong>{question}</strong>
                      <small>影响：{risk.impact}</small>
                    </span>
                    <span className="report-finding-copy-meta">
                      <span className={`report-finding-state ${risk.className}`}>{risk.label.replace("风险", "")}</span>
                      <span className="report-finding-evidence">证据：{EVIDENCE_LABEL[data.evidenceStatus]}</span>
                    </span>
                    <ArrowRight aria-hidden="true" className="report-finding-arrow size-4" />
                  </button>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="report-key-findings-empty">诊断完成后，这里会列出需要优先处理的风险与证据状态。</p>
        )}
        <div className="report-key-findings-footer">
          <button type="button" onClick={() => onScrollToSection("evidence-section")}>
            <FileSearch aria-hidden="true" className="size-4" />
            查看完整判断依据
            <ArrowRight aria-hidden="true" className="size-4" />
          </button>
        </div>
      </section>

      {scoring.status === "success" ? <ReportDimensionLedger report={scoring.data} /> : null}
    </section>
  );
}
