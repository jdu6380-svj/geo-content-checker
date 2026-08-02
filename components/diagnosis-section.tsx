"use client";

import type { FormEvent, RefObject } from "react";
import { ChevronRight, MessageSquare } from "lucide-react";

import { DiagnosticAccordionItem } from "@/components/diagnostic-accordion-item";
import { DiagnosticDetailPanel } from "@/components/diagnostic-detail-panel";
import type { DiagnosticItem, DiagnosticsState, LoadState } from "@/lib/client/report-state";
import type { PredictQuestionsResponse } from "@/lib/schemas/geo";

type DiagnosisSectionProps = {
  questions: LoadState<PredictQuestionsResponse>;
  sessionLoading: boolean;
  questionOrder: string[];
  diagnostics: DiagnosticsState;
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
};

const STATUS_STYLE = {
  "可以完全回答": "status-success",
  "信息不足": "status-warning",
  "有风险": "status-danger",
} as const;

function createDiagnosticItem(question: string, diagnostics: DiagnosticsState): DiagnosticItem {
  return diagnostics[question] ?? {
    question,
    status: "queued",
    errorCount: 0,
  };
}

function DiagnosisWorkbenchSkeleton({ announce }: { announce: boolean }) {
  return (
    <div
      className="diagnosis-master-detail mt-4 overflow-hidden rounded-lg border border-[#d8e0dd] bg-white"
      role={announce ? "status" : undefined}
      aria-live={announce ? "polite" : undefined}
      aria-label="正在预测读者问题"
    >
      <div className="grid xl:grid-cols-[280px_minmax(0,1fr)]">
        <div className="divide-y divide-[#e5e8eb] border-b border-[#e5e8eb] xl:border-b-0 xl:border-r">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="flex min-h-[74px] items-center gap-3 p-4">
              <span className="size-8 rounded-md bg-[#edf0f2]" />
              <span className="h-4 w-2/3 animate-pulse rounded bg-[#edf0f2] motion-reduce:animate-none" />
            </div>
          ))}
        </div>
        <div className="hidden min-h-[430px] bg-[#fafbfc] p-6 xl:block">
          <div className="h-4 w-2/3 animate-pulse rounded bg-[#e5e8ed] motion-reduce:animate-none" />
          <div className="mt-8 h-28 animate-pulse rounded-md bg-[#eef0f3] motion-reduce:animate-none" />
          <div className="mt-4 h-36 animate-pulse rounded-md bg-[#eef0f3] motion-reduce:animate-none" />
        </div>
      </div>
    </div>
  );
}

export function DiagnosisSection({
  questions,
  sessionLoading,
  questionOrder,
  diagnostics,
  completedCount,
  totalCount,
  expandedQuestion,
  latestQuestion,
  latestQuestionRef,
  restoredFromCache,
  canRetryQuestions,
  canRetryDiagnostic,
  followUpQuestion,
  followUpError,
  canAskFollowUp,
  canSubmitFollowUp,
  customQuestionCount,
  answeredCustomQuestionCount,
  feedbackByQuestion,
  feedbackEnabled,
  onRetryQuestions,
  onRetryDiagnostic,
  onToggleQuestion,
  onFollowUpQuestionChange,
  onSubmitFollowUp,
  onDiagnosisFeedback,
}: DiagnosisSectionProps) {
  const diagnosticItems = questionOrder.map((question) => createDiagnosticItem(question, diagnostics));
  const fallbackQuestion = diagnosticItems.find((item) => item.status === "success")?.question ?? questionOrder[0] ?? null;
  const activeQuestion = expandedQuestion && questionOrder.includes(expandedQuestion) ? expandedQuestion : fallbackQuestion;
  const activeItem = activeQuestion ? createDiagnosticItem(activeQuestion, diagnostics) : null;

  let diagnosisContent;

  if (questions.status === "loading" || questions.status === "idle") {
    diagnosisContent = <DiagnosisWorkbenchSkeleton announce={!sessionLoading} />;
  } else if (questions.status === "error") {
    diagnosisContent = (
      <div className="surface-flat mt-4 p-5">
        <p className="font-semibold text-[#963d2e]">读者问题未生成</p>
        <p role="alert" aria-live="assertive" className="mt-2 text-sm leading-6 text-[#765047]">
          {questions.error}
        </p>
        <p className="mt-2 text-xs leading-5 text-[#858c97]">评分结果可能已经完成。重新运行会从头生成本次报告。</p>
        {canRetryQuestions ? (
          <button type="button" onClick={onRetryQuestions} className="primary-button mt-3 h-9 px-4 text-sm font-semibold">
            重新运行分析
          </button>
        ) : null}
      </div>
    );
  } else {
    diagnosisContent = (
      <div ref={latestQuestion ? latestQuestionRef : undefined} className="mt-4">
        <div className="diagnosis-master-detail hidden overflow-hidden rounded-lg border border-[#d8e0dd] bg-white xl:grid xl:grid-cols-[280px_minmax(0,1fr)]">
          <div className="min-w-0 border-r border-[#e1e6ea] bg-white">
            <div className="border-b border-[#e5e8eb] px-4 py-3">
              <span className="text-[11px] font-semibold text-[#858c97]">诊断索引</span>
            </div>
            <div className="divide-y divide-[#e8ebee]">
              {diagnosticItems.map((item, index) => {
                const selected = item.question === activeQuestion;
                const interactive = item.status === "success" || item.status === "error";
                return (
                  <button
                    key={item.question}
                    type="button"
                    aria-current={selected ? "true" : undefined}
                    aria-controls="diagnosis-detail-panel"
                    disabled={!interactive}
                    onClick={() => {
                      if (!selected || expandedQuestion !== item.question) onToggleQuestion(item.question);
                    }}
                    className={`grid min-h-[78px] w-full grid-cols-[30px_minmax(0,1fr)_18px] items-center gap-3 border-l-[3px] px-4 py-3 text-left disabled:cursor-default ${
                      selected
                        ? "border-l-[#0f766e] bg-[#f1f8f6]"
                        : "border-l-transparent bg-white hover:bg-[#fafbfc]"
                    }`}
                  >
                    <span className={`grid size-[30px] place-items-center rounded-md font-mono text-xs font-bold ${selected ? "bg-[#dff0ed] text-[#08766e]" : "bg-[#eef2f1] text-[#687681]"}`}>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0">
                      <span className="text-clamp-2 block text-sm font-semibold leading-6 text-[#252a31]">{item.question}</span>
                      <span className="mt-1.5 block min-h-5">
                        {item.data ? (
                          <span className={`status-badge px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLE[item.data.answerability]}`}>
                            {item.data.answerability}
                          </span>
                        ) : item.status === "error" ? (
                          <span className="text-xs font-semibold text-[#a43e2b]">分析失败</span>
                        ) : item.status === "loading" ? (
                          <span className="text-xs font-semibold text-[#416b8a]">正在分析</span>
                        ) : (
                          <span className="text-xs text-[#8b939e]">等待分析</span>
                        )}
                      </span>
                    </span>
                    <ChevronRight aria-hidden="true" className={`size-4 ${selected ? "text-[#0f766e]" : "text-[#9ba3ad]"}`} />
                  </button>
                );
              })}
            </div>
          </div>

          <DiagnosticDetailPanel
            item={activeItem}
            fromCachedReport={restoredFromCache}
            canRetry={activeQuestion ? canRetryDiagnostic(activeQuestion) : false}
            feedback={activeQuestion ? feedbackByQuestion[activeQuestion] : undefined}
            feedbackEnabled={feedbackEnabled && Boolean(activeQuestion)}
            onRetry={() => {
              if (activeQuestion) onRetryDiagnostic(activeQuestion);
            }}
            onFeedback={(helpful) => {
              if (activeQuestion) onDiagnosisFeedback(activeQuestion, helpful);
            }}
          />
        </div>

        <div className="diagnostic-stack overflow-hidden rounded-lg border border-[#d8e0dd] bg-white xl:hidden">
          {diagnosticItems.map((item, index) => (
            <div key={item.question} className="border-b border-[#e1e7e4] last:border-b-0">
              <DiagnosticAccordionItem
                id={String(index + 1).padStart(2, "0")}
                item={item}
                expanded={expandedQuestion === item.question}
                onToggle={() => onToggleQuestion(item.question)}
                onRetry={() => onRetryDiagnostic(item.question)}
                canRetry={canRetryDiagnostic(item.question)}
                fromCachedReport={restoredFromCache}
                feedback={feedbackByQuestion[item.question]}
                feedbackEnabled={feedbackEnabled}
                onFeedback={(helpful) => onDiagnosisFeedback(item.question, helpful)}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <section id="diagnostic-section" className="section-anchor min-w-0">
      <div className="diagnosis-stage-header flex flex-wrap items-end justify-between gap-3 border-b border-[#dfe3e7] pb-4">
        <div>
          <p className="section-kicker">KEY DIAGNOSTICS</p>
          <h2 className="mt-1.5 text-xl font-semibold sm:text-2xl">关键诊断</h2>
        </div>
        {totalCount ? (
          <span role="status" aria-live="polite" className="status-badge border border-[#dfe3e7] bg-white px-3 py-1.5 text-xs font-semibold text-[#69717d]">
            已完成 {completedCount} / {totalCount}
          </span>
        ) : null}
      </div>

      {diagnosisContent}

      {questions.status === "success" ? (
        <form onSubmit={onSubmitFollowUp} className="follow-up-panel surface-flat mt-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="follow-up-question" className="flex items-center gap-2 text-sm font-semibold">
              <MessageSquare aria-hidden="true" className="size-4 text-[#5b61d6]" />
              测试读者真实提问
            </label>
            <span className="text-xs tabular-nums text-[#858c97]">{totalCount} / 10</span>
          </div>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              id="follow-up-question"
              value={followUpQuestion}
              onChange={(event) => onFollowUpQuestionChange(event.target.value)}
              maxLength={200}
              disabled={!canAskFollowUp}
              placeholder="例如：文章解释清楚为什么选择 A 而不是 B 吗？"
              className="field-control h-11 min-w-0 flex-1 bg-white px-3 text-sm disabled:cursor-not-allowed disabled:bg-[#f0f2f5]"
            />
            <button
              type="submit"
              disabled={!canSubmitFollowUp}
              className="dark-button h-11 px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45"
            >
              分析问题
            </button>
          </div>
          {followUpError ? <p role="alert" className="mt-2 text-sm text-[#c85745]">{followUpError}</p> : null}
          {customQuestionCount ? (
            <p className="mt-3 text-xs text-[#68707d]">
              追问覆盖率：{answeredCustomQuestionCount} / {customQuestionCount} 可完全回答
            </p>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}
