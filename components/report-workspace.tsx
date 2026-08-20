"use client";

import type { FormEvent, RefObject } from "react";
import { AnalysisProgressWorkspace } from "@/components/analysis-progress-workspace";
import { DiagnosisSection } from "@/components/diagnosis-section";
import { PatchWorkshop } from "@/components/patch-workshop";
import { ReportCompletionSummary } from "@/components/report-completion-summary";
import { ReportContextRail } from "@/components/report-context-rail";
import { ReportEvidencePanel } from "@/components/report-evidence-panel";
import { RecheckComparison } from "@/components/recheck-comparison";
import type { ReportScoreBand } from "@/components/report-score-rail";
import type { PatchChecklistItem } from "@/lib/client/patch-checklist";
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

export type ReportWorkspaceView = "overview" | "evidence" | "diagnosis" | "patch" | "recheck";

type ReportSessionState =
  | { status: "idle" | "loading" | "success" }
  | { status: "error"; error: string };

type ReportStatusPresentation = {
  label: string;
  className: string;
};

type ReportWorkspaceProps = {
  view: ReportWorkspaceView;
  title: string;
  runId: string | null;
  analysisSignal?: AbortSignal;
  contentAvailable: boolean;
  reportStatus: ReportStatusPresentation;
  session: ReportSessionState;
  scoring: LoadState<EvaluateScoringResponse>;
  questions: LoadState<PredictQuestionsResponse>;
  scoreBand: ReportScoreBand | null;
  questionOrder: string[];
  diagnostics: DiagnosticsState;
  diagnosticsSettled: boolean;
  diagnosticsSucceeded: boolean;
  patchChecklist: PatchChecklistItem[];
  recheckBaseline: ReportComparisonSnapshot | null;
  completedCount: number;
  expandedQuestion: string | null;
  latestQuestion: string | null;
  latestQuestionRef: RefObject<HTMLDivElement | null>;
  restoredFromCache: boolean;
  analysisProgressStep: number;
  analysisProgressAnimationKey: number;
  analysisProgressComplete: boolean;
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
  onReturnToEditor: () => void;
  onRestartAnalysis: () => void;
  onRetryScoring: () => void;
  onRetryQuestions: () => void;
  onRetryDiagnostic: (question: string) => void;
  onToggleQuestion: (question: string) => void;
  onFollowUpQuestionChange: (value: string) => void;
  onSubmitFollowUp: (event: FormEvent<HTMLFormElement>) => void;
  onDiagnosisFeedback: (question: string, helpful: boolean) => void;
  onAddPatchChecklistItem: (item: PatchChecklistItem) => void;
  onScrollToSection: (sectionId: string) => void;
};

export function ReportWorkspace({
  view,
  title,
  runId,
  analysisSignal,
  contentAvailable,
  reportStatus,
  session,
  scoring,
  questions,
  scoreBand,
  questionOrder,
  diagnostics,
  diagnosticsSettled,
  diagnosticsSucceeded,
  patchChecklist,
  recheckBaseline,
  completedCount,
  expandedQuestion,
  latestQuestion,
  latestQuestionRef,
  restoredFromCache,
  analysisProgressStep,
  analysisProgressAnimationKey,
  analysisProgressComplete,
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
  onReturnToEditor,
  onRestartAnalysis,
  onRetryScoring,
  onRetryQuestions,
  onRetryDiagnostic,
  onToggleQuestion,
  onFollowUpQuestionChange,
  onSubmitFollowUp,
  onDiagnosisFeedback,
  onAddPatchChecklistItem,
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
  const diagnosticsIncomplete = questions.status === "success" && !diagnosticsSettled;
  const diagnosticsStillPending = diagnosticsPending || diagnosticsIncomplete;
  const sessionComplete = session.status === "success" || restoredFromCache;
  const flowHasError = session.status === "error" || scoring.status === "error" || questions.status === "error" || diagnosticsFailed;
  const reportComplete = (restoredFromCache || analysisProgressComplete) && sessionComplete &&
    scoring.status === "success" && questions.status === "success" && diagnosticsSettled;
  const flowComplete = reportComplete && diagnosticsSucceeded;
  const comparisonComplete = flowComplete && scoring.status === "success";
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
          : diagnosticsStillPending
            ? "正在逐题验证原文证据并生成诊断。"
            : null;
  const analysisBusy = !restoredFromCache && (
    session.status === "loading" ||
    scoring.status === "loading" ||
    questions.status === "loading" ||
    diagnosticsStillPending ||
    (!flowHasError && !analysisProgressComplete)
  );
  const recheckAvailable = flowComplete && contentAvailable;
  return (
    <section
      id="report-overview"
      className={`report-workspace section-anchor surface-enter ${view === "overview" && !reportComplete ? "is-analysis-progress" : ""}`}
      aria-busy={analysisBusy || Boolean(loadingMessage)}
    >
      <div className="report-workspace-grid">
        <nav className="report-mobile-subnav" aria-label="报告页面导航">
          <button type="button" aria-current={view === "overview" ? "page" : undefined} onClick={() => onScrollToSection("report-overview")}>报告</button>
          <button type="button" aria-current={view === "evidence" ? "page" : undefined} disabled={!reportComplete} onClick={() => onScrollToSection("evidence-section")}>依据</button>
          <button type="button" aria-current={view === "diagnosis" ? "page" : undefined} disabled={!reportComplete} onClick={() => onScrollToSection("diagnostic-section")}>诊断</button>
          <button type="button" aria-current={view === "patch" ? "page" : undefined} disabled={!flowComplete} onClick={() => onScrollToSection("patch-workshop")}>修改</button>
          <button
            type="button"
            aria-current={view === "recheck" ? "page" : undefined}
            disabled={!recheckAvailable}
            onClick={() => {
              if (recheckBaseline) onScrollToSection("recheck-comparison");
              else onBackToEditor();
            }}
          >复检</button>
        </nav>

        {view === "overview" && !reportComplete ? (
          <AnalysisProgressWorkspace
            sessionStatus={session.status}
            scoring={scoring}
            questions={questions}
            diagnostics={diagnostics}
            diagnosticsSettled={diagnosticsSettled}
            diagnosticsPending={diagnosticsStillPending}
            restoredFromCache={restoredFromCache}
            activeStep={analysisProgressStep}
            animationKey={analysisProgressAnimationKey}
            progressComplete={analysisProgressComplete}
            onReturnToEditor={onReturnToEditor}
            onRestartAnalysis={onRestartAnalysis}
          />
        ) : null}

        <div className={`report-main-column min-w-0 report-view-${view}`}>
          {session.status === "error" ? (
            <div role="alert" className="report-error-state surface-flat border-l-[3px] p-5 sm:p-6">
              <h2 className="text-base font-semibold text-[var(--geo-status-danger)]">分析会话未能建立</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--geo-text-body)]">{session.error}</p>
              <p className="mt-2 text-xs leading-5 text-[var(--geo-text-muted)]">文章内容仍保留在本地。重新开始会运行完整分析，返回编辑不会丢失草稿。</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button type="button" onClick={onRestartAnalysis} className="dark-button h-10 px-5 text-sm font-semibold">重新运行分析</button>
                <button type="button" onClick={onReturnToEditor} className="secondary-button h-10 px-5 text-sm font-semibold text-[var(--geo-status-danger)]">返回编辑</button>
              </div>
            </div>
          ) : (
            <div className="report-main-stack">
              <div hidden={view !== "overview" || !reportComplete}>
                {recheckBaseline && currentComparison && recheckStatus === "complete" && scoring.status === "success" ? (
                  <ReportCompletionSummary
                    title={title}
                    scoring={scoring.data}
                    diagnostics={diagnostics}
                    questionOrder={questionOrder}
                    baseline={recheckBaseline}
                    current={currentComparison}
                    onNavigate={(nextView) => {
                      if (nextView === "overview") onScrollToSection("report-overview");
                      if (nextView === "evidence") onScrollToSection("evidence-section");
                      if (nextView === "diagnosis") onScrollToSection("diagnostic-section");
                      if (nextView === "patch") onScrollToSection("patch-workshop");
                      if (nextView === "recheck") onScrollToSection("recheck-comparison");
                    }}
                  />
                ) : (
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
                    analysisSettled={diagnosticsSettled}
                    analysisSucceeded={diagnosticsSucceeded}
                    hasRecheckBaseline={Boolean(recheckBaseline)}
                    onBackToEditor={onBackToEditor}
                  />
                )}
              </div>

              <div hidden={view !== "evidence"}>
                <ReportEvidencePanel
                  title={title}
                  paragraphs={paragraphs}
                  diagnostics={diagnostics}
                  questionOrder={questionOrder}
                  restoredFromCache={restoredFromCache}
                  onOpenOverview={() => onScrollToSection("report-overview")}
                  onOpenDiagnosis={() => onScrollToSection("diagnostic-section")}
                  onOpenPatch={() => onScrollToSection("patch-workshop")}
                />
              </div>

              <div hidden={view !== "diagnosis"}>
                <DiagnosisSection
                  questions={questions}
                  sessionLoading={session.status === "loading"}
                  questionOrder={questionOrder}
                  diagnostics={diagnostics}
                  completedCount={completedCount}
                  totalCount={questionOrder.length}
                  diagnosticsSettled={diagnosticsSettled}
                  diagnosticsSucceeded={diagnosticsSucceeded}
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
                  onOpenOverview={() => onScrollToSection("report-overview")}
                  onRetryQuestions={onRetryQuestions}
                  onRetryDiagnostic={onRetryDiagnostic}
                  onToggleQuestion={onToggleQuestion}
                  onFollowUpQuestionChange={onFollowUpQuestionChange}
                  onSubmitFollowUp={onSubmitFollowUp}
                  onDiagnosisFeedback={onDiagnosisFeedback}
                  onOpenEvidence={() => onScrollToSection("evidence-section")}
                  onOpenPatch={() => onScrollToSection("patch-workshop")}
                />
              </div>

              <div hidden={view !== "patch"}>
                <PatchWorkshop
                  title={title}
                  paragraphs={paragraphs}
                  diagnostics={diagnostics}
                  runId={runId}
                  analysisSignal={analysisSignal}
                  checklistItems={patchChecklist}
                  onAddChecklistItem={onAddPatchChecklistItem}
                  onBackToEditor={onBackToEditor}
                  onOpenOverview={() => onScrollToSection("report-overview")}
                  onOpenRecheck={onBackToEditor}
                />
              </div>

              <div hidden={view !== "recheck"}>
                {recheckBaseline ? (
                  <RecheckComparison
                    baseline={recheckBaseline}
                    current={currentComparison}
                    status={recheckStatus}
                    onOpenOverview={() => onScrollToSection("report-overview")}
                  />
                ) : null}
              </div>
            </div>
          )}
        </div>

      </div>
    </section>
  );
}
