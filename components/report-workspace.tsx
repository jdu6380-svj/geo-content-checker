"use client";

import type { FormEvent, RefObject } from "react";
import { AnalysisFlowStatus } from "@/components/analysis-flow-status";
import { DiagnosisSection } from "@/components/diagnosis-section";
import { PatchWorkshop } from "@/components/patch-workshop";
import { ReportContextRail } from "@/components/report-context-rail";
import { ReportEvidencePanel } from "@/components/report-evidence-panel";
import { RecheckComparison } from "@/components/recheck-comparison";
import type { ReportScoreBand } from "@/components/report-score-rail";
import type { DiagnosticsState, LoadState } from "@/lib/client/report-state";
import {
  createReportComparisonSnapshot,
  type ReportComparisonSnapshot,
} from "@/lib/client/report-comparison";
import type {
  EvaluateScoringResponse,
  Paragraph,
  PredictQuestionsResponse,
} from "@/lib/schemas/geo";

type ReportSessionState =
  | { status: "idle" | "loading" | "success" }
  | { status: "error"; error: string };

type ReportStatusPresentation = {
  label: string;
  className: string;
};

type ReportWorkspaceProps = {
  title: string;
  runId: string | null;
  contentAvailable: boolean;
  reportStatus: ReportStatusPresentation;
  session: ReportSessionState;
  scoring: LoadState<EvaluateScoringResponse>;
  questions: LoadState<PredictQuestionsResponse>;
  scoreBand: ReportScoreBand | null;
  questionOrder: string[];
  diagnostics: DiagnosticsState;
  recheckBaseline: ReportComparisonSnapshot | null;
  completedCount: number;
  expandedQuestion: string | null;
  latestQuestion: string | null;
  latestQuestionRef: RefObject<HTMLDivElement | null>;
  restoredFromCache: boolean;
  paragraphs: Paragraph[];
  followUpQuestion: string;
  followUpError: string;
  canAskFollowUp: boolean;
  canSubmitFollowUp: boolean;
  customQuestionCount: number;
  answeredCustomQuestionCount: number;
  feedbackByQuestion: Record<string, boolean | undefined>;
  feedbackEnabled: boolean;
  canRetryDiagnostic: (question: string) => boolean;
  onBackToEditor: () => void;
  onRestartAnalysis: () => void;
  onRetryScoring: () => void;
  onRetryQuestions: () => void;
  onRetryDiagnostic: (question: string) => void;
  onToggleQuestion: (question: string) => void;
  onFollowUpQuestionChange: (value: string) => void;
  onSubmitFollowUp: (event: FormEvent<HTMLFormElement>) => void;
  onDiagnosisFeedback: (question: string, helpful: boolean) => void;
  onScrollToSection: (sectionId: string) => void;
};

export function ReportWorkspace({
  title,
  runId,
  contentAvailable,
  reportStatus,
  session,
  scoring,
  questions,
  scoreBand,
  questionOrder,
  diagnostics,
  recheckBaseline,
  completedCount,
  expandedQuestion,
  latestQuestion,
  latestQuestionRef,
  restoredFromCache,
  paragraphs,
  followUpQuestion,
  followUpError,
  canAskFollowUp,
  canSubmitFollowUp,
  customQuestionCount,
  answeredCustomQuestionCount,
  feedbackByQuestion,
  feedbackEnabled,
  canRetryDiagnostic,
  onBackToEditor,
  onRestartAnalysis,
  onRetryScoring,
  onRetryQuestions,
  onRetryDiagnostic,
  onToggleQuestion,
  onFollowUpQuestionChange,
  onSubmitFollowUp,
  onDiagnosisFeedback,
  onScrollToSection,
}: ReportWorkspaceProps) {
  const evidenceCount = Object.values(diagnostics).reduce(
    (count, item) => count + (item.data?.evidence.length ?? 0),
    0,
  );
  const diagnosticsPending = Object.values(diagnostics).some(
    (item) => item.status === "queued" || item.status === "loading",
  );
  const diagnosticsFailed = Object.values(diagnostics).some((item) => item.status === "error");
  const diagnosticsComplete = questionOrder.length > 0 && questionOrder.every((question) => {
    const status = diagnostics[question]?.status;
    return status === "success" || status === "error";
  });
  const sessionComplete = session.status === "success" || restoredFromCache;
  const flowHasError = session.status === "error" || scoring.status === "error" || questions.status === "error" || diagnosticsFailed;
  const flowComplete = sessionComplete && scoring.status === "success" && questions.status === "success" && diagnosticsComplete;
  const comparisonComplete = sessionComplete && scoring.status === "success" && questions.status === "success" &&
    questionOrder.length > 0 && questionOrder.every((question) => diagnostics[question]?.status === "success");
  const currentComparison = comparisonComplete && scoring.status === "success"
    ? createReportComparisonSnapshot(scoring.data, questionOrder, diagnostics)
    : null;
  const recheckStatus = restoredFromCache
    ? "cached" as const
    : flowHasError
      ? "error" as const
      : comparisonComplete
        ? "complete" as const
        : "running" as const;
  const loadingMessage = session.status === "loading"
    ? "正在建立分析会话并整理文章结构。"
    : scoring.status === "loading" && questions.status === "loading"
      ? "正在评估文章结构并识别读者问题。"
      : scoring.status === "loading"
        ? "正在评估文章结构与信息完整度。"
        : questions.status === "loading"
          ? "正在识别读者可能提出的问题。"
          : diagnosticsPending
            ? "正在逐题验证原文证据并生成诊断。"
            : null;
  const flowPresentation = flowHasError
    ? {
        title: "分析需要处理",
        description: "已完成的结果会保留。请在对应模块重试，或返回编辑后重新运行完整分析。",
        tone: "error" as const,
      }
    : restoredFromCache
      ? {
          title: "已载入最近报告",
          description: "评分与诊断已恢复。证据和修改建议是否可用，取决于本地是否仍保留本次正文。",
          tone: "success" as const,
        }
    : flowComplete
      ? {
          title: recheckBaseline ? "重新验证已完成" : "报告已就绪",
          description: recheckBaseline
            ? "已按同一套规则完成复检。请对照改善、无变化与下降项。"
            : "评分与诊断已完成。先查看最大风险与原文证据，再决定是否进入修改建议。",
          tone: "success" as const,
        }
      : {
          title: "正在生成内容可信度报告",
          description: loadingMessage ?? "正在准备分析结果。完成的模块会立即显示，不需要刷新页面。",
          tone: "loading" as const,
        };

  return (
    <section
      id="report-overview"
      className="report-workspace section-anchor surface-enter"
      aria-busy={Boolean(loadingMessage)}
    >
      <div className="report-workspace-grid">
        {!flowComplete || restoredFromCache ? (
          <div className="report-status-inline" aria-label="报告生成状态">
            <AnalysisFlowStatus
              title={flowPresentation.title}
              description={flowPresentation.description}
              tone={flowPresentation.tone}
            />
          </div>
        ) : null}

        <div className="report-main-column min-w-0">
          {recheckBaseline ? (
            <RecheckComparison baseline={recheckBaseline} current={currentComparison} status={recheckStatus} />
          ) : null}

          {session.status === "error" ? (
            <div role="alert" className="report-error-state surface-flat border-l-[3px] p-5 sm:p-6">
              <h2 className="text-base font-semibold text-[var(--geo-status-danger)]">分析会话未能建立</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--geo-text-body)]">{session.error}</p>
              <p className="mt-2 text-xs leading-5 text-[var(--geo-text-muted)]">文章内容仍保留在本地。重新开始会运行完整分析，返回编辑不会丢失草稿。</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button type="button" onClick={onRestartAnalysis} className="dark-button h-10 px-5 text-sm font-semibold">重新运行分析</button>
                <button type="button" onClick={onBackToEditor} className="secondary-button h-10 px-5 text-sm font-semibold text-[var(--geo-status-danger)]">返回编辑</button>
              </div>
            </div>
          ) : (
            <div className="report-main-stack">
              <ReportContextRail
                title={title}
                reportStatus={reportStatus}
                scoring={scoring}
                scoreBand={scoreBand}
                diagnostics={diagnostics}
                questionOrder={questionOrder}
                announceLoading={session.status !== "loading"}
                canRetry={!restoredFromCache && contentAvailable}
                onRetryScoring={onRetryScoring}
                onFocusQuestion={(question) => {
                  if (expandedQuestion !== question) onToggleQuestion(question);
                  onScrollToSection("diagnostic-section");
                }}
                onScrollToSection={onScrollToSection}
                completedCount={completedCount}
                evidenceCount={evidenceCount}
                contentAvailable={contentAvailable}
                restoredFromCache={restoredFromCache}
                onBackToEditor={onBackToEditor}
              />

              <ReportEvidencePanel
                diagnostics={diagnostics}
                questionOrder={questionOrder}
                restoredFromCache={restoredFromCache}
              />

              <DiagnosisSection
                questions={questions}
                sessionLoading={session.status === "loading"}
                questionOrder={questionOrder}
                diagnostics={diagnostics}
                completedCount={completedCount}
                totalCount={questionOrder.length}
                expandedQuestion={expandedQuestion}
                latestQuestion={latestQuestion}
                latestQuestionRef={latestQuestionRef}
                restoredFromCache={restoredFromCache}
                canRetryQuestions={!restoredFromCache && paragraphs.length > 0}
                canRetryDiagnostic={canRetryDiagnostic}
                followUpQuestion={followUpQuestion}
                followUpError={followUpError}
                canAskFollowUp={canAskFollowUp}
                canSubmitFollowUp={canSubmitFollowUp}
                customQuestionCount={customQuestionCount}
                answeredCustomQuestionCount={answeredCustomQuestionCount}
                feedbackByQuestion={feedbackByQuestion}
                feedbackEnabled={feedbackEnabled}
                onRetryQuestions={onRetryQuestions}
                onRetryDiagnostic={onRetryDiagnostic}
                onToggleQuestion={onToggleQuestion}
                onFollowUpQuestionChange={onFollowUpQuestionChange}
                onSubmitFollowUp={onSubmitFollowUp}
                onDiagnosisFeedback={onDiagnosisFeedback}
              />

              <PatchWorkshop
                title={title}
                paragraphs={paragraphs}
                diagnostics={diagnostics}
                runId={runId}
                onBackToEditor={onBackToEditor}
              />
            </div>
          )}
        </div>

      </div>
    </section>
  );
}
