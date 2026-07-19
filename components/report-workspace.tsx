"use client";

import type { FormEvent, RefObject } from "react";
import { FileText, ListChecks, Sparkles } from "lucide-react";

import { DiagnosisSection } from "@/components/diagnosis-section";
import { PatchWorkshop } from "@/components/patch-workshop";
import { ReportActionRail } from "@/components/report-action-rail";
import { ReportContextRail } from "@/components/report-context-rail";
import { ReportEvidencePanel } from "@/components/report-evidence-panel";
import type { ReportScoreBand } from "@/components/report-score-rail";
import { Button } from "@/components/ui/button";
import type { DiagnosticsState, LoadState } from "@/lib/client/report-state";
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
  publishedAt: string;
  contentAvailable: boolean;
  reportStatus: ReportStatusPresentation;
  session: ReportSessionState;
  scoring: LoadState<EvaluateScoringResponse>;
  questions: LoadState<PredictQuestionsResponse>;
  scoreBand: ReportScoreBand | null;
  questionOrder: string[];
  diagnostics: DiagnosticsState;
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
  canRetryDiagnostic: (question: string) => boolean;
  onBackToEditor: () => void;
  onRestartAnalysis: () => void;
  onRetryScoring: () => void;
  onRetryQuestions: () => void;
  onRetryDiagnostic: (question: string) => void;
  onToggleQuestion: (question: string) => void;
  onFollowUpQuestionChange: (value: string) => void;
  onSubmitFollowUp: (event: FormEvent<HTMLFormElement>) => void;
  onScrollToSection: (sectionId: string) => void;
};

export function ReportWorkspace({
  title,
  publishedAt,
  contentAvailable,
  reportStatus,
  session,
  scoring,
  questions,
  scoreBand,
  questionOrder,
  diagnostics,
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
  canRetryDiagnostic,
  onBackToEditor,
  onRestartAnalysis,
  onRetryScoring,
  onRetryQuestions,
  onRetryDiagnostic,
  onToggleQuestion,
  onFollowUpQuestionChange,
  onSubmitFollowUp,
  onScrollToSection,
}: ReportWorkspaceProps) {
  const evidenceCount = scoring.status === "success" ? scoring.data.numbered_paragraphs.length : 0;

  return (
    <section
      id="report-overview"
      className="report-workspace section-anchor surface-enter mx-auto max-w-[1480px] px-4 py-4 sm:px-6 sm:py-5 lg:px-8"
      aria-busy={session.status === "loading" || scoring.status === "loading" || questions.status === "loading"}
    >
      <div className="report-command-bar surface-flat flex flex-wrap items-center gap-2 px-3 py-2">
        <div className="inline-flex h-9 shrink-0 items-center gap-2 px-2 text-sm font-semibold text-[#252a31]">
          <span className="grid size-7 place-items-center rounded-md border border-[#d7e5e2] bg-[#eef8f6] text-[#0f766e]">
            <FileText aria-hidden="true" className="size-3.5" />
          </span>
          报告工作台
        </div>

        <nav className="order-3 flex w-full min-w-0 items-center gap-1 overflow-x-auto border-t border-[#e9ecef] pt-2 sm:order-none sm:w-auto sm:flex-1 sm:justify-center sm:border-t-0 sm:pt-0" aria-label="报告章节导航">
          <button
            type="button"
            onClick={() => onScrollToSection("diagnostic-section")}
            className="inline-flex h-8 shrink-0 items-center gap-2 rounded-md bg-[#eef8f6] px-3 text-xs font-semibold text-[#0f766e]"
          >
            <ListChecks aria-hidden="true" className="size-3.5" />
            关键诊断
          </button>
          <button
            type="button"
            onClick={() => onScrollToSection("patch-workshop")}
            className="inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-3 text-xs font-semibold text-[#69717d] hover:bg-[#f6f8f9] hover:text-[#14161b]"
          >
            <Sparkles aria-hidden="true" className="size-3.5" />
            改写建议
          </button>
          <button
            type="button"
            onClick={() => onScrollToSection("evidence-section")}
            className="inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-3 text-xs font-semibold text-[#69717d] hover:bg-[#f6f8f9] hover:text-[#14161b]"
          >
            <FileText aria-hidden="true" className="size-3.5" />
            证据锚点
          </button>
        </nav>

        <Button
          type="button"
          variant="outline"
          onClick={onBackToEditor}
          className="ml-auto h-9 shrink-0 rounded-md border-[#dfe3e7] bg-white px-3.5 text-xs font-semibold shadow-none hover:bg-[#f8fafc]"
        >
          编辑原文
        </Button>
      </div>

      {session.status === "error" ? (
        <div role="alert" className="surface-flat mt-4 border-l-[3px] border-l-[#c85745] bg-[#fff8f6] p-5 sm:p-6">
          <h2 className="text-base font-semibold text-[#963d2e]">无法开始本次体检</h2>
          <p className="mt-2 text-sm leading-6 text-[#765047]">{session.error}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={onRestartAnalysis} className="dark-button h-10 px-5 text-sm font-semibold">
              重新开始体检
            </button>
            <button
              type="button"
              onClick={onBackToEditor}
              className="secondary-button h-10 px-5 text-sm font-semibold text-[#963d2e]"
            >
              返回编辑
            </button>
          </div>
        </div>
      ) : null}

      <div hidden={session.status === "error"}>
        {session.status === "loading" ? (
          <div role="status" aria-live="polite" className="mt-4 flex items-center gap-3 rounded-lg border border-[#d7e8e5] bg-[#eef8f6] px-4 py-3 text-sm text-[#4e615e]">
            <span
              aria-hidden="true"
              className="size-4 shrink-0 animate-spin rounded-full border-2 border-[#b9d9d4] border-t-[#0f766e] motion-reduce:animate-none"
            />
            <span>正在建立分析会话并整理文章结构。</span>
          </div>
        ) : null}

        <div className="report-cockpit mt-4 grid items-start gap-4 lg:grid-cols-[232px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)]">
          <ReportContextRail
            title={title}
            publishedAt={publishedAt}
            reportStatus={reportStatus}
            scoring={scoring}
            scoreBand={scoreBand}
            announceLoading={session.status !== "loading"}
            canRetry={!restoredFromCache && contentAvailable}
            onBackToEditor={onBackToEditor}
            onRetryScoring={onRetryScoring}
          />

          <div className="min-w-0 space-y-5">
            <div className="report-diagnosis-stage grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_240px]">
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
                onRetryQuestions={onRetryQuestions}
                onRetryDiagnostic={onRetryDiagnostic}
                onToggleQuestion={onToggleQuestion}
                onFollowUpQuestionChange={onFollowUpQuestionChange}
                onSubmitFollowUp={onSubmitFollowUp}
              />

              <ReportActionRail
                completedCount={completedCount}
                totalCount={questionOrder.length}
                evidenceCount={evidenceCount}
                contentAvailable={contentAvailable}
                restoredFromCache={restoredFromCache}
                onScrollToSection={onScrollToSection}
              />
            </div>

            <div className="report-action-stage grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
              <PatchWorkshop title={title} paragraphs={paragraphs} diagnostics={diagnostics} />
              <ReportEvidencePanel scoring={scoring} restoredFromCache={restoredFromCache} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
