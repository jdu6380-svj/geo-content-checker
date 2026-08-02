"use client";

import type { FormEvent, RefObject } from "react";
import { FileText, ListChecks, Sparkles } from "lucide-react";

import { AnalysisFlowStatus, type AnalysisFlowStep } from "@/components/analysis-flow-status";
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
  runId: string | null;
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
  publishedAt,
  runId,
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
  const flowSteps: AnalysisFlowStep[] = [
    {
      id: "session",
      label: "准备分析",
      description: "建立安全会话并整理文章结构。",
      status: session.status === "error"
        ? "error"
        : sessionComplete
          ? "complete"
          : session.status === "loading"
            ? "active"
            : "waiting",
    },
    {
      id: "scoring",
      label: "生成评分",
      description: "检查内容准备度与四项评分维度。",
      status: scoring.status === "error"
        ? "error"
        : scoring.status === "success"
          ? "complete"
          : sessionComplete && scoring.status === "loading"
            ? "active"
            : "waiting",
    },
    {
      id: "questions",
      label: "识别问题",
      description: "推演读者和 AI 搜索可能提出的问题。",
      status: questions.status === "error"
        ? "error"
        : questions.status === "success"
          ? "complete"
          : sessionComplete && questions.status === "loading"
            ? "active"
            : "waiting",
      meta: questions.status === "success" ? `${questionOrder.length} 个问题` : undefined,
    },
    {
      id: "diagnostics",
      label: "验证诊断",
      description: "逐项核对原文证据并形成诊断。",
      status: diagnosticsFailed
        ? "error"
        : diagnosticsComplete
          ? "complete"
          : questions.status === "success" && diagnosticsPending
            ? "active"
            : "waiting",
      meta: questionOrder.length ? `${completedCount} / ${questionOrder.length} 已完成` : undefined,
    },
  ];
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
          title: "报告已就绪",
          description: "评分、问题识别和逐项诊断已完成。下一步查看关键诊断，再决定是否生成修改建议。",
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
      className="report-workspace section-anchor surface-enter mx-auto max-w-[1480px] px-4 py-4 sm:px-6 sm:py-5 lg:px-8"
      aria-busy={Boolean(loadingMessage)}
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
            onClick={() => onScrollToSection("evidence-section")}
            className="inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-3 text-xs font-semibold text-[#69717d] hover:bg-[#f6f8f9] hover:text-[#14161b]"
          >
            <FileText aria-hidden="true" className="size-3.5" />
            证据验证
          </button>
          <button
            type="button"
            onClick={() => onScrollToSection("patch-workshop")}
            className="inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-3 text-xs font-semibold text-[#69717d] hover:bg-[#f6f8f9] hover:text-[#14161b]"
          >
            <Sparkles aria-hidden="true" className="size-3.5" />
            修改与复核
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

      <AnalysisFlowStatus
        title={flowPresentation.title}
        description={flowPresentation.description}
        tone={flowPresentation.tone}
        steps={flowSteps}
      />

      {session.status === "error" ? (
        <div role="alert" className="surface-flat mt-4 border-l-[3px] border-l-[#c85745] bg-[#fff8f6] p-5 sm:p-6">
          <h2 className="text-base font-semibold text-[#963d2e]">分析会话未能建立</h2>
          <p className="mt-2 text-sm leading-6 text-[#765047]">{session.error}</p>
          <p className="mt-2 text-xs leading-5 text-[#8b655d]">文章内容仍保留在本地。重新开始会运行完整分析，返回编辑不会丢失草稿。</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={onRestartAnalysis} className="dark-button h-10 px-5 text-sm font-semibold">
              重新运行分析
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
        <div className="report-cockpit mt-4 min-w-0">
          <ReportContextRail
            title={title}
            publishedAt={publishedAt}
            reportStatus={reportStatus}
            scoring={scoring}
            scoreBand={scoreBand}
            diagnostics={diagnostics}
            questionOrder={questionOrder}
            contentAvailable={contentAvailable}
            restoredFromCache={restoredFromCache}
            announceLoading={session.status !== "loading"}
            canRetry={!restoredFromCache && contentAvailable}
            onRetryScoring={onRetryScoring}
            onFocusQuestion={(question) => {
              if (expandedQuestion !== question) onToggleQuestion(question);
              onScrollToSection("diagnostic-section");
            }}
            onScrollToSection={onScrollToSection}
            onBackToEditor={onBackToEditor}
          />

          <div className="mt-6 min-w-0 space-y-6">
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
                feedbackByQuestion={feedbackByQuestion}
                feedbackEnabled={feedbackEnabled}
                onRetryQuestions={onRetryQuestions}
                onRetryDiagnostic={onRetryDiagnostic}
                onToggleQuestion={onToggleQuestion}
                onFollowUpQuestionChange={onFollowUpQuestionChange}
                onSubmitFollowUp={onSubmitFollowUp}
                onDiagnosisFeedback={onDiagnosisFeedback}
              />

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

            <ReportEvidencePanel diagnostics={diagnostics} restoredFromCache={restoredFromCache} />

            <PatchWorkshop
              title={title}
              paragraphs={paragraphs}
              diagnostics={diagnostics}
              runId={runId}
              onBackToEditor={onBackToEditor}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
