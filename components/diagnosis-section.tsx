"use client";

import type { FormEvent, RefObject } from "react";
import { useState } from "react";
import { ArrowLeft, CheckCircle2, ChevronDown, Circle, ShieldAlert } from "lucide-react";

import { DiagnosticDetailPanel } from "@/components/diagnostic-detail-panel";
import {
  getReportIssueStatus,
  summarizeReportIssueStatuses,
  type ReportIssueStatus,
} from "@/lib/client/report-comparison";
import type { DiagnosticItem, DiagnosticsState, LoadState } from "@/lib/client/report-state";
import type { PredictQuestionsResponse } from "@/lib/schemas/geo";

type DiagnosisSectionProps = {
  questions: LoadState<PredictQuestionsResponse>;
  sessionLoading: boolean;
  questionOrder: string[];
  diagnostics: DiagnosticsState;
  diagnosticsSettled: boolean;
  diagnosticsSucceeded: boolean;
  completedCount: number;
  totalCount: number;
  expandedQuestion: string | null;
  latestQuestion: string | null;
  latestQuestionRef: RefObject<HTMLDivElement | null>;
  restoredFromCache: boolean;
  canRetryQuestions: boolean;
  canRetryDiagnostic: (question: string) => boolean;
  followUpQuestion: string;
  followUpError: string;
  canAskFollowUp: boolean;
  canSubmitFollowUp: boolean;
  customQuestionCount: number;
  answeredCustomQuestionCount: number;
  feedbackByQuestion: Record<string, boolean | undefined>;
  feedbackEnabled: boolean;
  onRetryQuestions: () => void;
  onRetryDiagnostic: (question: string) => void;
  onToggleQuestion: (question: string) => void;
  onFollowUpQuestionChange: (value: string) => void;
  onSubmitFollowUp: (event: FormEvent<HTMLFormElement>) => void;
  onDiagnosisFeedback: (question: string, helpful: boolean) => void;
  onOpenOverview: () => void;
  onOpenEvidence: () => void;
  onOpenPatch: () => void;
};

type DiagnosisFilter = "all" | ReportIssueStatus;

const RISK_META = {
  high: { label: "高风险", shortLabel: "高风险 · High", className: "is-danger" },
  attention: { label: "中风险", shortLabel: "注意 · Medium", className: "is-warning" },
  passed: { label: "低风险", shortLabel: "通过 · Low", className: "is-success" },
} as const;

const PENDING_RISK = {
  label: "待确认",
  className: "is-warning",
} as const;

const RISK_IMPACT = {
  high: "关键依据不足可能直接影响内容可信判断。",
  attention: "信息缺口会增加读者与 AI 系统确认内容可靠性的成本。",
  passed: "当前信息与证据能够支持判断。",
} as const;

function createDiagnosticItem(question: string, diagnostics: DiagnosticsState): DiagnosticItem {
  return diagnostics[question] ?? {
    question,
    status: "queued",
    errorCount: 0,
  };
}

export function DiagnosisSection({
  questions,
  sessionLoading,
  questionOrder,
  diagnostics,
  diagnosticsSettled,
  diagnosticsSucceeded,
  completedCount,
  totalCount,
  expandedQuestion,
  latestQuestion,
  latestQuestionRef,
  restoredFromCache,
  canRetryQuestions,
  canRetryDiagnostic,
  feedbackByQuestion,
  feedbackEnabled,
  onRetryQuestions,
  onRetryDiagnostic,
  onToggleQuestion,
  onDiagnosisFeedback,
  onOpenOverview,
  onOpenEvidence,
  onOpenPatch,
}: DiagnosisSectionProps) {
  const [filter, setFilter] = useState<DiagnosisFilter>("all");
  const diagnosticItems = questionOrder.map((question) => createDiagnosticItem(question, diagnostics));
  const failedCount = diagnosticItems.filter((item) => item.status === "error").length;
  const completedResults = diagnosticItems.flatMap((item) => item.status === "success" && item.data ? [item.data] : []);
  const riskSummary = summarizeReportIssueStatuses(completedResults);
  const issueCount = riskSummary.high + riskSummary.attention;
  const hasUnconfirmedDiagnostics = !diagnosticsSucceeded && totalCount > 0;
  const unconfirmedCount = Math.max(failedCount, totalCount - completedResults.length);
  const knownRisk = riskSummary.high
    ? RISK_META.high
    : riskSummary.attention
      ? RISK_META.attention
      : null;
  const overallRisk = hasUnconfirmedDiagnostics ? knownRisk ?? PENDING_RISK : knownRisk ?? RISK_META.passed;
  const issueSummary = hasUnconfirmedDiagnostics
    ? completedResults.length === 0
      ? `${unconfirmedCount || totalCount} 个问题待确认`
      : `${issueCount} 个已确认可信度问题 · ${unconfirmedCount} 个问题待确认`
    : `${issueCount} 个可信度问题`;
  const visibleItems = diagnosticItems.filter((item) => (
    filter === "all" || (item.data ? getReportIssueStatus(item.data) === filter : false)
  ));

  return (
    <section id="diagnostic-section" className="phase2-diagnosis-page section-anchor">
      <header className="phase2-subpage-header">
        <div>
          <p className="phase2-breadcrumb">我的审查 <span>/</span> Report Overview <span>/</span> Diagnosis</p>
          <h1>问题诊断</h1>
          <p>基于观点、证据与来源链路，定位影响内容可信度的问题。</p>
        </div>
        <div className="phase2-subpage-actions">
          <span className={diagnosticsSucceeded ? "is-success" : diagnosticsSettled ? "is-warning" : "is-info"}>
            {diagnosticsSucceeded ? <CheckCircle2 aria-hidden="true" /> : <ShieldAlert aria-hidden="true" />}
            {diagnosticsSucceeded
              ? `分析已完成 · ${totalCount} 个问题`
              : diagnosticsSettled
                ? `分析部分完成 · ${completedCount}/${totalCount} 个问题，${failedCount} 项失败`
                : "分析进行中"}
          </span>
          <button type="button" onClick={onOpenOverview}><ArrowLeft aria-hidden="true" />返回报告概览</button>
        </div>
      </header>

      {questions.status === "loading" || questions.status === "idle" ? (
        <div className="phase2-loading-surface" role={sessionLoading ? undefined : "status"} aria-live={sessionLoading ? undefined : "polite"}>
          正在整理问题诊断…
        </div>
      ) : questions.status === "error" ? (
        <div className="phase2-loading-surface is-error">
          <strong>读者问题未生成</strong>
          <p>{questions.error}</p>
          {canRetryQuestions ? <button type="button" onClick={onRetryQuestions}>重新运行分析</button> : null}
        </div>
      ) : (
        <>
          <section className="phase2-diagnosis-summary">
            <div>
              <span>发现</span>
              <strong>{issueSummary}</strong>
            </div>
            <div>
              <span>风险等级</span>
              <strong className={overallRisk.className}>{overallRisk.label}</strong>
            </div>
            <div><Circle className="is-danger" aria-hidden="true" /><span>高风险</span><strong>{riskSummary.high}</strong></div>
            <div><Circle className="is-warning" aria-hidden="true" /><span>注意</span><strong>{riskSummary.attention}</strong></div>
            <div><Circle className="is-success" aria-hidden="true" /><span>通过</span><strong>{riskSummary.passed}</strong></div>
            <p>Evidence First · 风险判断均可追溯至具体观点、证据与来源。</p>
          </section>

          <div className="phase2-diagnosis-toolbar">
            <h2>发现的问题</h2>
            <div role="group" aria-label="诊断风险筛选">
              {([
                ["all", `全部 ${totalCount}`],
                ["high", `高风险 ${riskSummary.high}`],
                ["attention", `注意 ${riskSummary.attention}`],
                ["passed", `通过 ${riskSummary.passed}`],
              ] as const).map(([value, label]) => (
                <button key={value} type="button" className={filter === value ? "is-active" : ""} onClick={() => setFilter(value)}>{label}</button>
              ))}
            </div>
          </div>

          <div ref={latestQuestion ? latestQuestionRef : undefined} className="phase2-diagnosis-list">
            {visibleItems.map((item) => {
              const itemIndex = Math.max(questionOrder.indexOf(item.question), 0);
              const triggerId = `diagnostic-trigger-${itemIndex}`;
              const detailId = `diagnostic-detail-${itemIndex}`;
              const isExpanded = expandedQuestion === item.question;
              const status = item.data ? getReportIssueStatus(item.data) : "attention";
              const risk = RISK_META[status];
              const reason = status === "passed"
                ? "原文已提供可核验依据，当前观点能够得到支持。"
                : item.data?.missingInfo[0]
                  || (item.data?.evidenceStatus === "invalid" ? "现有引用未通过原文校验。" : "当前观点缺少足够 Evidence 支撑。");
              return (
                <article key={item.question} className={`phase2-diagnosis-row ${risk.className} ${expandedQuestion === item.question ? "is-expanded" : ""}`}>
                  <button
                    id={triggerId}
                    type="button"
                    disabled={item.status !== "success" && item.status !== "error"}
                    aria-expanded={item.status === "success" || item.status === "error" ? isExpanded : false}
                    aria-controls={detailId}
                    onClick={() => onToggleQuestion(item.question)}
                  >
                    <span className="phase2-diagnosis-question"><small>问题 {String(itemIndex + 1).padStart(2, "0")}</small><strong>{item.question}</strong></span>
                    <span><small>影响</small><p>{item.data ? RISK_IMPACT[status] : "等待分析结果。"}</p></span>
                    <span><small>原因</small><p>{reason}</p></span>
                    <span><small>建议</small><p>{item.data?.recommendation || "完成分析后显示处理建议。"}</p></span>
                    <b>
                      {item.status === "error" ? "分析失败" : risk.shortLabel}
                      <ChevronDown aria-hidden="true" />
                    </b>
                  </button>
                  <div
                    id={detailId}
                    role="region"
                    aria-labelledby={triggerId}
                    aria-hidden={!isExpanded}
                    hidden={!isExpanded}
                  >
                    {isExpanded ? (
                      <DiagnosticDetailPanel
                        item={item}
                        itemIndex={itemIndex}
                        fromCachedReport={restoredFromCache}
                        canRetry={canRetryDiagnostic(item.question)}
                        feedback={feedbackByQuestion[item.question]}
                        feedbackEnabled={feedbackEnabled}
                        canOpenPatch={diagnosticsSucceeded}
                        onRetry={() => onRetryDiagnostic(item.question)}
                        onFeedback={(helpful) => onDiagnosisFeedback(item.question, helpful)}
                        onOpenEvidence={onOpenEvidence}
                        onOpenPatch={onOpenPatch}
                      />
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>

          <footer className="phase2-diagnosis-pass">
            {diagnosticsSucceeded ? <CheckCircle2 aria-hidden="true" /> : <ShieldAlert aria-hidden="true" />}
            <strong>{diagnosticsSucceeded ? "诊断已完成" : `${completedCount} / ${totalCount} 已完成 · ${failedCount} 项失败`}</strong>
            <span>{diagnosticsSucceeded ? "文章结构、作者信息与主要术语定义已完成基础核验。" : "已完成结果会保留；重试失败问题后才能生成修改建议。"}</span>
          </footer>
        </>
      )}
    </section>
  );
}
