"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { AppHeader } from "@/components/app-header";
import { EditorWorkspace } from "@/components/editor-workspace";
import type { PatchState } from "@/components/patch-workshop";
import { ReportWorkspace, type ReportWorkspaceView } from "@/components/report-workspace";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import type { WorkspaceStage } from "@/components/workspace-command-bar";
import {
  clearDraftAnalysis,
  createAnalysisHash,
  markDraftAnalysis,
  readDraftSessionResult,
  saveDraftSession,
} from "@/lib/client/analysis-persistence";
import { resolveWorkflowRecovery } from "@/lib/client/workflow-recovery";
import {
  createGeoAbortError,
  isGeoAbortError,
  isGeoRequestDeadlineError,
  postGeoBetaEvent,
  postGeoJson,
  scheduleGeoDiagnostic,
  setGeoAnalysisToken,
  withGeoRequestDeadline,
  type AnalysisSessionClientData,
} from "@/lib/client/geo-api";
import {
  readCachedReport,
  saveCachedReport,
  deriveDiagnosticCompletion,
  type CacheEnvelope,
  type DiagnosticItem,
  type DiagnosticsState,
  type LoadState,
} from "@/lib/client/report-state";
import {
  createReportComparisonSnapshot,
  isReportIssue,
  type ReportComparisonSnapshot,
} from "@/lib/client/report-comparison";
import type { PatchChecklistItem } from "@/lib/client/patch-checklist";
import {
  WORKFLOW_STATE_VERSION,
  clearWorkflowState,
  canPersistWorkflow,
  paragraphsForWorkflow,
  patchStatesForWorkflow,
  readWorkflowState,
  saveWorkflowState,
  type WorkflowState,
} from "@/lib/client/workflow-state";
import {
  MAX_ARTICLE_CHARACTERS,
  MIN_ARTICLE_CHARACTERS,
} from "@/lib/constants/input-limits";
import { createNumberedParagraphs } from "@/lib/geo/paragraphs";
import {
  ANALYSIS_CONTRACT_VERSION,
  ANALYSIS_VERSION,
  REPORT_SCHEMA_VERSION,
} from "@/lib/constants/analysis-contract";
import type {
  DiagnosticResult,
  EvaluateScoringResponse,
  Paragraph,
  PredictQuestionsResponse,
} from "@/lib/schemas/geo";

type ArticleDraft = {
  title: string;
  content: string;
  publishedAt: string;
};

type FieldErrors = Partial<Record<"title" | "content", string>>;
type SamplePresentationMeta = {
  status: string;
  description: string;
  badgeClassName: string;
};
type SessionState =
  | { status: "idle" | "loading" | "success" }
  | { status: "error"; error: string };

const EMPTY_DRAFT: ArticleDraft = { title: "", content: "", publishedAt: "" };
const DAILY_USAGE_KEY = "geo:daily-usage:v2";
const DRAFT_SAVE_DEBOUNCE_MS = 500;
const ANALYSIS_PROGRESS_TRANSITIONS = [
  { delay: 1_100, step: 1 },
  { delay: 2_200, step: 2 },
  { delay: 3_400, step: 3 },
] as const;
const ANALYSIS_PROGRESS_COMPLETE_DELAY_MS = 5_000;
const ANALYSIS_SESSION_DEADLINE_MS = 15_000;
const SCORING_DEADLINE_MS = 45_000;
const QUESTIONS_DEADLINE_MS = 45_000;
const DIAGNOSTIC_DEADLINE_MS = 60_000;

const SAMPLES: Array<ArticleDraft & { label: string; note: string }> = [
  {
    label: "结构完整",
    note: "问题、事实、边界清晰",
    title: "远程团队如何建立每周复盘机制",
    publishedAt: "2026-07-13",
    content:
      "远程团队可以通过每周复盘发现协作中的重复问题。建议每周固定安排一次复盘会议，记录已完成事项、未完成事项及其原因，并将问题整理为后续行动。\n\n一个可执行的复盘流程包括：\n1. 汇总本周任务完成情况。\n2. 区分客观事实与主观判断。\n3. 为每个关键问题指定负责人和下一步行动。\n\n复盘效果应通过任务按时完成率、问题重复发生率等指标持续观察。但在没有实际统计数据的情况下，不应声称该机制已经将效率提高了某个具体百分比。",
  },
  {
    label: "信息缺失",
    note: "观点明确，证据不足",
    title: "社区活动如何制定报名与通知流程",
    publishedAt: "",
    content:
      "社区准备举办一次周末公开活动，计划通过线上表单收集报名信息，再按照报名顺序发送确认通知。活动当天由志愿者负责签到，并在活动结束后整理参与者反馈。\n\n目前还需要补充活动人数上限、报名截止时间、取消报名方式和个人信息保存期限。若报名人数超过场地容量，应提前说明候补规则，避免参与者对是否成功报名产生误解。",
  },
  {
    label: "营销过强",
    note: "承诺很多，事实很少",
    title: "小型电商如何记录售后问题",
    publishedAt: "2026-07-13",
    content:
      "小型电商可以为每一笔售后申请记录订单编号、商品名称、问题类型、处理时间和最终结果。每周汇总一次，可以帮助团队发现重复出现的质量或配送问题。\n\n建议由专人维护售后表格，并为退款、换货和补发分别设置处理状态。统计改善效果时，应注明统计周期、样本数量和计算方式，不能只用个别案例代表整体结果。",
  },
];

const DIMENSION_META = [
  { key: "questionCoverage", label: "问题覆盖度", bar: "score-bar-question" },
  { key: "factCompleteness", label: "事实完整度", bar: "score-bar-fact" },
  { key: "structureClarity", label: "结构清晰度", bar: "score-bar-structure" },
  { key: "freshness", label: "时效性", bar: "score-bar-freshness" },
] as const;

const SAMPLE_META: Record<number, SamplePresentationMeta> = {
  0: {
    status: "完整示例",
    description: "信息边界清楚，适合了解完整输入",
    badgeClassName: "status-success",
  },
  1: {
    status: "证据缺口",
    description: "关键判断缺少可核对依据",
    badgeClassName: "status-warning",
  },
  2: {
    status: "表达风险",
    description: "强承诺、时效与结构均需复核",
    badgeClassName: "status-danger",
  },
};

const EDITOR_SAMPLES = SAMPLES.map((sample, index) => ({
  id: sample.label,
  title: sample.title,
  status: (SAMPLE_META[index] ?? SAMPLE_META[0]).status,
  description: (SAMPLE_META[index] ?? SAMPLE_META[0]).description,
  badgeClassName: (SAMPLE_META[index] ?? SAMPLE_META[0]).badgeClassName,
}));

const EDITOR_DIMENSIONS = DIMENSION_META.map(({ label }, index) => ({
  label,
  indicatorClassName:
    index === 0
      ? "score-bar-question"
      : index === 1
        ? "score-bar-fact"
        : index === 2
          ? "score-bar-structure"
          : "score-bar-freshness",
}));

function scoreBand(score: number): { label: string; note: string } {
  if (score >= 85) return { label: "准备充分", note: "核心问题、证据和结构较完整" };
  if (score >= 70) return { label: "基础良好", note: "已经可读，仍有局部信息缺口" };
  if (score >= 50) return { label: "需要补强", note: "关键事实与回答边界仍不完整" };
  return { label: "风险较高", note: "建议先补足证据再发布" };
}

function getDailyUsage(): number {
  if (typeof window === "undefined") return 0;

  try {
    const today = new Date().toISOString().slice(0, 10);
    const saved = window.localStorage.getItem(DAILY_USAGE_KEY);
    if (!saved) return 0;
    const value = JSON.parse(saved) as { date?: string; count?: number };
    return value.date === today && typeof value.count === "number" ? value.count : 0;
  } catch {
    return 0;
  }
}

function recordUsage(): void {
  try {
    const today = new Date().toISOString().slice(0, 10);
    window.localStorage.setItem(
      DAILY_USAGE_KEY,
      JSON.stringify({ date: today, count: getDailyUsage() + 1 }),
    );
  } catch {
    // A blocked localStorage should not make the analysis workflow unusable.
  }
}

function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(createGeoAbortError());

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, milliseconds);
    const handleAbort = () => {
      window.clearTimeout(timeoutId);
      signal?.removeEventListener("abort", handleAbort);
      reject(createGeoAbortError());
    };

    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

function retryDelay(response: Response): number {
  const retryAfter = response.headers.get("retry-after");
  if (!retryAfter) return 1_000;

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) return Math.min(Math.max(seconds * 1_000, 500), 5_000);

  const retryDate = Date.parse(retryAfter);
  if (Number.isFinite(retryDate)) return Math.min(Math.max(retryDate - Date.now(), 500), 5_000);
  return 1_000;
}

async function responseError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { message?: unknown };
    return typeof payload.message === "string" ? payload.message : fallback;
  } catch {
    return fallback;
  }
}

function requestErrorMessage(error: unknown, fallback: string, deadlineMessage: string): string {
  if (isGeoRequestDeadlineError(error)) return deadlineMessage;
  return error instanceof Error ? error.message : fallback;
}

async function requestDiagnostic(
  title: string,
  paragraphs: Paragraph[],
  question: string,
  signal: AbortSignal,
): Promise<DiagnosticResult> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await withGeoRequestDeadline(async (requestSignal) => {
      const response = await postGeoJson("/api/qa-diagnostic", {
        title,
        numbered_paragraphs: paragraphs,
        question,
      }, { signal: requestSignal });

      if (response.status === 429 && attempt === 0) {
        const delayMs = retryDelay(response);
        await responseError(response, "");
        return { kind: "retry" as const, delayMs };
      }
      if (!response.ok) {
        throw new Error(await responseError(response, "该问题分析失败。"));
      }
      return {
        kind: "success" as const,
        data: (await response.json()) as DiagnosticResult,
      };
    }, { signal, deadlineMs: DIAGNOSTIC_DEADLINE_MS });

    if (result.kind === "retry") {
      await wait(result.delayMs + Math.round(Math.random() * 250), signal);
      continue;
    }
    return result.data;
  }

  throw new Error("模型服务繁忙，请稍后重试。");
}

function initialDiagnostics(questions: string[]): DiagnosticsState {
  return Object.fromEntries(
    questions.map((question) => [
      question,
      { question, status: "queued", errorCount: 0 } satisfies DiagnosticItem,
    ]),
  );
}

export default function Home() {
  const [draft, setDraft] = useState<ArticleDraft>(EMPTY_DRAFT);
  const [analysisStarted, setAnalysisStarted] = useState(false);
  const [session, setSession] = useState<SessionState>({ status: "idle" });
  const [scoring, setScoring] = useState<LoadState<EvaluateScoringResponse>>({ status: "idle" });
  const [questions, setQuestions] = useState<LoadState<PredictQuestionsResponse>>({ status: "idle" });
  const [questionOrder, setQuestionOrder] = useState<string[]>([]);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsState>({});
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([]);
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);
  const [followUpQuestion, setFollowUpQuestion] = useState("");
  const [followUpError, setFollowUpError] = useState("");
  const [latestQuestion, setLatestQuestion] = useState<string | null>(null);
  const [restoredFromCache, setRestoredFromCache] = useState(false);
  const [completeWorkflowRestored, setCompleteWorkflowRestored] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [isRestoringWorkflow, setIsRestoringWorkflow] = useState(true);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [feedbackByQuestion, setFeedbackByQuestion] = useState<Record<string, boolean | undefined>>({});
  const titleRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const latestQuestionRef = useRef<HTMLDivElement>(null);
  const activeRunRef = useRef(0);
  const analysisControllerRef = useRef<AbortController | null>(null);
  const activeAnalysisHashRef = useRef<string | null>(null);
  const draftRef = useRef<ArticleDraft>(draft);
  const analyzedDraftRef = useRef<ArticleDraft | null>(null);
  const draftSaveTimerRef = useRef<number | null>(null);
  const analysisProgressTimersRef = useRef<number[]>([]);
  const analysisCompletionHandledRef = useRef(false);
  const storageReadyRef = useRef(false);
  const workflowPersistenceBlockedRef = useRef(false);
  const workflowSaveVersionRef = useRef(0);
  const recheckBaselinePersistenceRef = useRef<Promise<void> | null>(null);
  const reportedRunIdsRef = useRef(new Set<string>());
  const editorStartedReportedRef = useRef(false);
  const reportViewedRunIdsRef = useRef(new Set<string>());
  const reportViewDwellRef = useRef(new Map<string, number>());
  const [activeSessionRunId, setActiveSessionRunId] = useState<string | null>(null);
  const [recheckBaseline, setRecheckBaseline] = useState<ReportComparisonSnapshot | null>(null);
  const [patchChecklist, setPatchChecklist] = useState<PatchChecklistItem[]>([]);
  const [patchStates, setPatchStates] = useState<Record<"advice" | "content_draft", PatchState | null>>({ advice: null, content_draft: null });
  const [workspaceStage, setWorkspaceStage] = useState<WorkspaceStage>("review");
  const [reportView, setReportView] = useState<ReportWorkspaceView>("overview");
  const [analysisProgressStep, setAnalysisProgressStep] = useState(0);
  const [analysisProgressComplete, setAnalysisProgressComplete] = useState(false);
  const [persistenceError, setPersistenceError] = useState("");
  const [draftPersistenceError, setDraftPersistenceError] = useState("");
  const [draftSaveState, setDraftSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");

  const contentText = draft?.content ?? "";
  const contentLength = contentText.length;
  const remaining = MAX_ARTICLE_CHARACTERS - contentLength;
  const completedCount = questionOrder.filter((question) => diagnostics[question]?.status === "success").length;
  const customQuestions = questionOrder.slice(5);
  const answeredCustomQuestions = customQuestions.filter(
    (question) => diagnostics[question]?.data?.answerability === "可以完全回答",
  ).length;
  const currentScoreBand = scoring.status === "success" ? scoreBand(scoring.data.totalScore) : null;
  const canAskFollowUp = paragraphs.length > 0 && questionOrder.length < 10;
  const canSubmitFollowUp = canAskFollowUp && Boolean(followUpQuestion.trim());
  const analysisPresentationComplete = restoredFromCache || analysisProgressComplete;
  const { diagnosticsSettled, diagnosticsSucceeded } = deriveDiagnosticCompletion(
    questionOrder,
    diagnostics,
  );
  const reportAvailable = restoredFromCache || (
    analysisStarted &&
    analysisPresentationComplete &&
    session.status === "success" &&
    scoring.status === "success" &&
    questions.status === "success" &&
    diagnosticsSettled
  );
  const reportReady = !restoredFromCache && reportAvailable;
  // A cached report is still a complete, reusable analysis.  It must retain
  // the numbered paragraphs so the user can reopen diagnosis/patch advice
  // after a refresh instead of seeing those actions disabled.
  const workflowSucceeded = reportAvailable && diagnosticsSucceeded && paragraphs.length > 0;
  const canOpenAdvice = analysisStarted && workflowSucceeded;
  const canOpenRecheck = canOpenAdvice && Boolean(contentText.trim());

  const persistWorkflow = useCallback(async (options: {
    recheckBaselineOverride?: ReportComparisonSnapshot | null;
    allowWhileEditing?: boolean;
  } = {}) => {
    const reportHash = activeAnalysisHashRef.current;
    const effectiveRecheckBaseline = options.recheckBaselineOverride ?? recheckBaseline;
    if (!canPersistWorkflow({
      storageReady: storageReadyRef.current,
      analysisStarted,
      reportHash,
      scoringSucceeded: scoring.status === "success",
      questionsSucceeded: questions.status === "success",
      diagnosticsSucceeded,
      paragraphsCount: paragraphs.length,
      restoredFromCache,
      completeWorkflowRestored,
      persistenceBlocked: options.allowWhileEditing ? false : workflowPersistenceBlockedRef.current,
    }) || !reportHash || scoring.status !== "success" || questions.status !== "success") return;
    const saveVersion = ++workflowSaveVersionRef.current;
    const state: WorkflowState = {
      workflowVersion: WORKFLOW_STATE_VERSION,
      analysisVersion: ANALYSIS_VERSION,
      analysisContractVersion: ANALYSIS_CONTRACT_VERSION,
      reportSchemaVersion: REPORT_SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      reportId: `report:${reportHash}`,
      reportHash,
      draftHash: await createAnalysisHash(draft),
      patchSourceHash: reportHash,
      analyzedDraft: analyzedDraftRef.current ?? draft,
      draft,
      report: {
        title: draft.title,
        publishedAt: draft.publishedAt,
        scoring: scoring.data,
        questionSource: questions.data.source,
        questionOrder,
        diagnostics,
      },
      paragraphs,
      patchStates: patchStatesForWorkflow({
        advice: patchStates.advice?.status === "success" ? { mode: "advice", data: patchStates.advice.data } : null,
        content_draft: patchStates.content_draft?.status === "success" ? { mode: "content_draft", data: patchStates.content_draft.data } : null,
      }, reportHash),
      patchChecklist: patchChecklist.map((item) => ({ ...item, sourceReportHash: reportHash })),
      recheckBaseline: effectiveRecheckBaseline,
      workspaceStage,
      reportView,
    };
    const result = await saveWorkflowState(state, {
      isCurrent: () => workflowSaveVersionRef.current === saveVersion,
    });
    if (!result.ok && result.reason !== "stale") setPersistenceError("工作流状态未能保存，刷新后可能无法恢复完整报告。");
    else setPersistenceError("");
  }, [analysisStarted, completeWorkflowRestored, diagnostics, diagnosticsSucceeded, draft, paragraphs, patchChecklist, patchStates, questions, questionOrder, recheckBaseline, reportView, restoredFromCache, scoring, workspaceStage]);

  const abortActiveAnalysis = useCallback(() => {
    analysisControllerRef.current?.abort();
    analysisControllerRef.current = null;
  }, []);

  const clearAnalysisProgressTimers = useCallback(() => {
    analysisProgressTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    analysisProgressTimersRef.current = [];
  }, []);

  const beginAnalysisProgress = useCallback(() => {
    clearAnalysisProgressTimers();
    analysisCompletionHandledRef.current = false;
    setAnalysisProgressStep(0);
    setAnalysisProgressComplete(false);

    const transitionTimers = ANALYSIS_PROGRESS_TRANSITIONS.map(({ delay, step }) =>
      window.setTimeout(() => setAnalysisProgressStep(step), delay)
    );
    const completionTimer = window.setTimeout(() => {
      setAnalysisProgressComplete(true);
      analysisProgressTimersRef.current = [];
    }, ANALYSIS_PROGRESS_COMPLETE_DELAY_MS);

    analysisProgressTimersRef.current = [...transitionTimers, completionTimer];
  }, [clearAnalysisProgressTimers]);

  useEffect(() => clearAnalysisProgressTimers, [clearAnalysisProgressTimers]);

  const flushDraftSession = useCallback((nextDraft?: ArticleDraft) => {
    if (nextDraft) draftRef.current = nextDraft;
    if (draftSaveTimerRef.current !== null) {
      window.clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
    if (!storageReadyRef.current) return;
    const saved = saveDraftSession(draftRef.current);
    setDraftSaveState(saved ? "saved" : "failed");
    setDraftPersistenceError(saved ? "" : "正文尚未可靠保存，离开页面后可能无法恢复最新修改。");
  }, []);

  const clearPersistedDraftAnalysis = useCallback((nextDraft?: ArticleDraft) => {
    if (nextDraft) draftRef.current = nextDraft;
    if (draftSaveTimerRef.current !== null) {
      window.clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
    if (!storageReadyRef.current) return;
    const saved = clearDraftAnalysis(draftRef.current);
    setDraftSaveState(saved ? "saved" : "failed");
    setDraftPersistenceError(saved ? "" : "正文尚未可靠保存，离开页面后可能无法恢复最新修改。");
  }, []);

  const restoreCachedAnalysis = useCallback((cached: CacheEnvelope, restoredDraft: ArticleDraft) => {
    workflowSaveVersionRef.current += 1;
    abortActiveAnalysis();
    clearAnalysisProgressTimers();
    analysisCompletionHandledRef.current = true;
    activeAnalysisHashRef.current = cached.analysisHash;
    analyzedDraftRef.current = restoredDraft.content ? restoredDraft : null;
    setActiveSessionRunId(null);
    setGeoAnalysisToken(null);
    setCompleteWorkflowRestored(false);
    if (restoredDraft.content) {
      markDraftAnalysis(restoredDraft, cached.analysisHash, "success");
    }
    draftRef.current = restoredDraft;
    setDraft(restoredDraft);
    // The cached scoring response already contains the exact paragraph
    // segmentation used by the report. Restore it so downstream evidence and
    // patch actions remain available after reopening the app.
    setParagraphs(
      cached.report.scoring.numbered_paragraphs.length > 0
        ? cached.report.scoring.numbered_paragraphs
        : createNumberedParagraphs(restoredDraft.content),
    );
    setScoring({ status: "success", data: cached.report.scoring });
    setQuestions({
      status: "success",
      data: {
        questions: cached.report.questionOrder,
        source: cached.report.questionSource,
      },
    });
    setQuestionOrder(cached.report.questionOrder);
    setDiagnostics(cached.report.diagnostics);
    setFeedbackByQuestion({});
    setPatchChecklist([]);
    setAnalysisStarted(true);
    setRestoredFromCache(true);
    setAnalysisProgressStep(3);
    setAnalysisProgressComplete(true);
    setWorkspaceStage("report");
    setReportView("overview");
  }, [abortActiveAnalysis, clearAnalysisProgressTimers]);

  const restoreWorkflow = useCallback((workflow: WorkflowState, pendingDraft?: ArticleDraft) => {
    workflowSaveVersionRef.current += 1;
    abortActiveAnalysis();
    clearAnalysisProgressTimers();
    analysisCompletionHandledRef.current = true;
    activeAnalysisHashRef.current = workflow.reportHash;
    analyzedDraftRef.current = workflow.analyzedDraft;
    setGeoAnalysisToken(null);
    setCompleteWorkflowRestored(true);
    setActiveSessionRunId(null);
    const restoredDraft = pendingDraft ?? workflow.draft;
    const isEditingPendingDraft = Boolean(pendingDraft);
    draftRef.current = restoredDraft;
    setDraft(restoredDraft);
    setParagraphs(paragraphsForWorkflow(workflow));
    setScoring({ status: "success", data: workflow.report.scoring });
    setQuestions({ status: "success", data: { questions: workflow.report.questionOrder, source: workflow.report.questionSource } });
    setQuestionOrder(workflow.report.questionOrder);
    setDiagnostics(workflow.report.diagnostics);
    setPatchStates({ advice: null, content_draft: null });
    if (!isEditingPendingDraft) {
      for (const patch of workflow.patchStates) {
        if (patch.sourceReportHash !== workflow.reportHash) continue;
        setPatchStates((current) => ({ ...current, [patch.mode]: { status: "success", data: patch.data } }));
      }
    }
    setPatchChecklist(isEditingPendingDraft ? [] : workflow.patchChecklist);
    setRecheckBaseline(workflow.recheckBaseline);
    setAnalysisStarted(!isEditingPendingDraft);
    setRestoredFromCache(!isEditingPendingDraft);
    setAnalysisProgressStep(3);
    setAnalysisProgressComplete(true);
    setWorkspaceStage(isEditingPendingDraft ? (workflow.recheckBaseline ? "recheck" : "review") : workflow.workspaceStage);
    setReportView(isEditingPendingDraft ? "overview" : workflow.reportView);
    if (isEditingPendingDraft) {
      workflowPersistenceBlockedRef.current = true;
      setCompleteWorkflowRestored(false);
      setSession({ status: "idle" });
    }
  }, [abortActiveAnalysis, clearAnalysisProgressTimers]);

  useEffect(() => {
    void postGeoBetaEvent({ event: "visit" });
  }, []);

  useEffect(() => {
    if (restoredFromCache || !workflowSucceeded) return;
    const runId = activeSessionRunId;
    if (!runId || reportedRunIdsRef.current.has(runId)) return;

    reportedRunIdsRef.current.add(runId);
    void postGeoBetaEvent({ event: "analysis_completed", runId });
  }, [activeSessionRunId, restoredFromCache, workflowSucceeded]);

  useEffect(() => {
    if (!reportAvailable || analysisCompletionHandledRef.current) return;
    analysisCompletionHandledRef.current = true;
    setWorkspaceStage(recheckBaseline && workflowSucceeded ? "recheck" : "report");
    setReportView(recheckBaseline && workflowSucceeded ? "recheck" : "overview");

    window.requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    });
  }, [recheckBaseline, reportAvailable, workflowSucceeded]);

  useEffect(() => {
    const runId = activeSessionRunId;
    if (!reportReady || !runId || reportViewedRunIdsRef.current.has(runId)) return;

    const target = document.getElementById("report-core");
    if (!target || typeof IntersectionObserver === "undefined") return;

    let visibleEnough = false;
    let reported = false;
    let lastTick = performance.now();
    let elapsed = reportViewDwellRef.current.get(runId) ?? 0;
    let intervalId: number | null = null;

    const finish = () => {
      if (reported) return;
      reported = true;
      reportViewedRunIdsRef.current.add(runId);
      reportViewDwellRef.current.set(runId, elapsed);
      if (intervalId !== null) window.clearInterval(intervalId);
      observer.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void postGeoBetaEvent({ event: "report_viewed", runId });
    };

    const tick = () => {
      const now = performance.now();
      if (visibleEnough && document.visibilityState === "visible") {
        elapsed += Math.max(0, now - lastTick);
      }
      lastTick = now;
      reportViewDwellRef.current.set(runId, elapsed);
      if (elapsed >= 10_000) finish();
    };

    const handleVisibilityChange = () => {
      tick();
      lastTick = performance.now();
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        tick();
        visibleEnough = Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.5);
        lastTick = performance.now();
      },
      { threshold: [0, 0.5, 1] },
    );

    observer.observe(target);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    intervalId = window.setInterval(tick, 250);

    return () => {
      if (intervalId !== null) window.clearInterval(intervalId);
      observer.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activeSessionRunId, reportReady]);

  useEffect(() => {
    if (!latestQuestion) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    latestQuestionRef.current?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "center",
    });
  }, [latestQuestion]);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      let workflowResult: Awaited<ReturnType<typeof readWorkflowState>> = { state: null, storageAvailable: true, invalid: false };
      let workflowError = false;
      try { workflowResult = await readWorkflowState(); } catch { workflowError = true; }

      let storedResult = readDraftSessionResult();
      let storedHash: string | null = null;
      if (storedResult.envelope) {
        try { storedHash = await createAnalysisHash(storedResult.envelope.draft); }
        catch { storedResult = { ...storedResult, storageAvailable: false, invalid: false }; }
      }
      if (cancelled) return;

      const decision = resolveWorkflowRecovery({
        workflow: workflowResult.state,
        workflowInvalid: workflowResult.invalid,
        workflowError: workflowError || !workflowResult.storageAvailable,
        draft: storedResult.envelope,
        draftInvalid: storedResult.invalid,
        draftError: !storedResult.storageAvailable,
        draftHash: storedHash,
      });
      if (decision.kind === "workflow") restoreWorkflow(decision.workflow);
      else if (decision.kind === "pending-draft") restoreWorkflow(decision.workflow, decision.draft);
      else if (decision.kind === "draft") {
        draftRef.current = decision.draft;
        setDraft(decision.draft);
        setDraftSaveState("saved");
        setError(decision.warning ?? "正文草稿已恢复，请重新分析。");
      }
      if ("warning" in decision && decision.warning) setPersistenceError(decision.warning);
      else if (workflowResult.invalid || workflowError || !workflowResult.storageAvailable || storedResult.invalid || !storedResult.storageAvailable) {
        setPersistenceError("部分缓存无法恢复，已尽可能保留可用内容。");
      }

      storageReadyRef.current = true;
      setStorageReady(true);
      setIsRestoringWorkflow(false);
    }

    void restoreSession();
    return () => {
      cancelled = true;
    };
  }, [restoreCachedAnalysis, restoreWorkflow]);

  useEffect(() => {
    if (!storageReady) return;
    draftRef.current = draft;
    if (draftSaveTimerRef.current !== null) {
      window.clearTimeout(draftSaveTimerRef.current);
    }

    const timerId = window.setTimeout(() => {
      if (draftSaveTimerRef.current !== timerId) return;
      draftSaveTimerRef.current = null;
      setDraftSaveState("saving");
      const saved = saveDraftSession(draftRef.current);
      setDraftSaveState(saved ? "saved" : "failed");
      setDraftPersistenceError(saved ? "" : "正文尚未可靠保存，离开页面后可能无法恢复最新修改。");
    }, DRAFT_SAVE_DEBOUNCE_MS);
    draftSaveTimerRef.current = timerId;

    return () => {
      if (draftSaveTimerRef.current !== timerId) return;
      window.clearTimeout(timerId);
      draftSaveTimerRef.current = null;
    };
  }, [draft, storageReady]);

  useEffect(() => {
    if (!storageReady || !diagnosticsSucceeded) return;
    void persistWorkflow();
  }, [diagnosticsSucceeded, persistWorkflow, storageReady]);

  useEffect(() => {
    const handlePageHide = (event: PageTransitionEvent) => {
      if (event.persisted) {
        flushDraftSession();
        return;
      }
      flushDraftSession();
      abortActiveAnalysis();
      setGeoAnalysisToken(null);
    };

    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      flushDraftSession();
      abortActiveAnalysis();
      setGeoAnalysisToken(null);
    };
  }, [abortActiveAnalysis, flushDraftSession]);

  useEffect(() => {
    if (restoredFromCache || !analysisStarted || scoring.status !== "success" || questions.status !== "success") return;
    if (!diagnosticsSettled) return;

    const analysisHash = activeAnalysisHashRef.current;
    if (!analysisHash) return;

    if (!diagnosticsSucceeded) {
      markDraftAnalysis(draft, analysisHash, "failed");
      return;
    }

    markDraftAnalysis(draft, analysisHash, "success");
    saveCachedReport({
      title: draft.title,
      publishedAt: draft.publishedAt,
      scoring: scoring.data,
      questionSource: questions.data.source,
      questionOrder,
      diagnostics,
    }, analysisHash);
  }, [analysisStarted, diagnostics, diagnosticsSettled, diagnosticsSucceeded, draft, questionOrder, questions, restoredFromCache, scoring]);

  function updateDraft(field: keyof ArticleDraft, value: string) {
    if (!editorStartedReportedRef.current) {
      editorStartedReportedRef.current = true;
      void postGeoBetaEvent({ event: "editor_started" });
    }
    setDraft((current) => {
      const nextDraft = { ...current, [field]: value };
      draftRef.current = nextDraft;
      return nextDraft;
    });
    setDraftSaveState("saving");
    if (field === "title" || field === "content") {
      setFieldErrors((current) => ({ ...current, [field]: undefined }));
    }
  }

  function loadSample(sample: (typeof SAMPLES)[number]) {
    if (!editorStartedReportedRef.current) {
      editorStartedReportedRef.current = true;
      void postGeoBetaEvent({ event: "editor_started" });
    }
    activeRunRef.current += 1;
    workflowPersistenceBlockedRef.current = true;
    workflowSaveVersionRef.current += 1;
    abortActiveAnalysis();
    setGeoAnalysisToken(null);
    const nextDraft = {
      title: sample.title,
      content: sample.content,
      publishedAt: sample.publishedAt,
    };
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    clearPersistedDraftAnalysis(nextDraft);
    setAnalysisStarted(false);
    setWorkspaceStage("review");
    setReportView("overview");
    setSession({ status: "idle" });
    setScoring({ status: "idle" });
    setQuestions({ status: "idle" });
    setQuestionOrder([]);
    setDiagnostics({});
    setFeedbackByQuestion({});
    setParagraphs([]);
    setFollowUpQuestion("");
    setFollowUpError("");
    setLatestQuestion(null);
    setError("");
    setFieldErrors({});
    setRestoredFromCache(false);
    setCompleteWorkflowRestored(false);
    setRecheckBaseline(null);
    setPatchChecklist([]);
    setPatchStates({ advice: null, content_draft: null });
    clearWorkflowState();
  }

  function handleLoadSample(sample: (typeof SAMPLES)[number]) {
    const isDirty = (draft?.title?.trim() ?? "") !== "" || contentText.trim() !== "";
    if (!isDirty || window.confirm("加载样本将覆盖当前已输入内容，确认继续吗？")) {
      loadSample(sample);
    }
  }

  async function loadScoring(
    runId: number,
    article: ArticleDraft,
    signal: AbortSignal,
  ) {
    try {
      const data = await withGeoRequestDeadline(async (requestSignal) => {
        const response = await postGeoJson("/api/evaluate-scoring", article, { signal: requestSignal });
        if (!response.ok) throw new Error(await responseError(response, "评分暂时失败。"));
        return (await response.json()) as EvaluateScoringResponse;
      }, { signal, deadlineMs: SCORING_DEADLINE_MS });
      if (activeRunRef.current === runId) setScoring({ status: "success", data });
    } catch (requestError) {
      if (isGeoAbortError(requestError)) return;
      if (activeRunRef.current !== runId) return;
      const analysisHash = activeAnalysisHashRef.current;
      if (analysisHash) markDraftAnalysis(article, analysisHash, "failed");
      setScoring({
        status: "error",
        error: requestErrorMessage(requestError, "评分暂时失败。", "评分分析超时，请稍后重试。"),
      });
    }
  }

  async function diagnoseQuestion(
    runId: number,
    title: string,
    articleParagraphs: Paragraph[],
    question: string,
    signal: AbortSignal,
  ) {
    if (activeRunRef.current !== runId || signal.aborted) return;
    setDiagnostics((current) => ({
      ...current,
      [question]: { ...current[question], question, status: "loading" },
    }));

    try {
      const data = await requestDiagnostic(title, articleParagraphs, question, signal);
      if (activeRunRef.current !== runId) return;
      setDiagnostics((current) => ({
        ...current,
        [question]: { ...current[question], question, status: "success", data, error: undefined },
      }));
    } catch (requestError) {
      if (isGeoAbortError(requestError)) return;
      if (activeRunRef.current !== runId) return;
      setDiagnostics((current) => ({
        ...current,
        [question]: {
          ...current[question],
          question,
          status: "error",
          error: requestErrorMessage(requestError, "该问题分析失败。", "该问题分析超时，请稍后重试。"),
        },
      }));
    }
  }

  async function loadQuestionsAndDiagnostics(
    runId: number,
    articleParagraphs: Paragraph[],
    article: ArticleDraft,
    signal: AbortSignal,
  ) {
    try {
      const data = await withGeoRequestDeadline(async (requestSignal) => {
        const response = await postGeoJson("/api/predict-questions", {
          title: article.title,
          numbered_paragraphs: articleParagraphs,
        }, { signal: requestSignal });
        if (!response.ok) throw new Error(await responseError(response, "问题预测暂时失败。"));
        return (await response.json()) as PredictQuestionsResponse;
      }, { signal, deadlineMs: QUESTIONS_DEADLINE_MS });
      if (activeRunRef.current !== runId) return;

      setQuestions({ status: "success", data });
      setQuestionOrder(data.questions);
      setDiagnostics(initialDiagnostics(data.questions));
      await Promise.all(
        data.questions.map((question) =>
          scheduleGeoDiagnostic(
            () => diagnoseQuestion(runId, article.title, articleParagraphs, question, signal),
            signal,
          ),
        ),
      );
    } catch (requestError) {
      if (isGeoAbortError(requestError)) return;
      if (activeRunRef.current !== runId) return;
      const analysisHash = activeAnalysisHashRef.current;
      if (analysisHash) markDraftAnalysis(article, analysisHash, "failed");
      setQuestions({
        status: "error",
        error: requestErrorMessage(requestError, "问题预测暂时失败。", "问题预测超时，请稍后重试。"),
      });
    }
  }

  async function openAnalysisSession(
    runId: number,
    article: ArticleDraft,
    articleParagraphs: Paragraph[],
    signal: AbortSignal,
  ) {
    try {
      const session = await withGeoRequestDeadline(async (requestSignal) => {
        const response = await postGeoJson(
          "/api/analysis-session",
          {},
          { includeAnalysisToken: false, signal: requestSignal },
        );
        if (!response.ok) {
          throw new Error(await responseError(response, "暂时无法开始体检。"));
        }
        return (await response.json()) as AnalysisSessionClientData;
      }, { signal, deadlineMs: ANALYSIS_SESSION_DEADLINE_MS });
      if (!session.token || typeof session.token !== "string") {
        throw new Error("分析会话无效，请重新提交。");
      }
      if (activeRunRef.current !== runId) return;

      setGeoAnalysisToken(session.token);
      setActiveSessionRunId(session.runId);
      setSession({ status: "success" });
      recordUsage();
      void postGeoBetaEvent({ event: "analysis_started", runId: session.runId });
      void loadScoring(runId, article, signal);
      void loadQuestionsAndDiagnostics(runId, articleParagraphs, article, signal);
    } catch (requestError) {
      if (isGeoAbortError(requestError)) return;
      if (activeRunRef.current !== runId) return;
      const analysisHash = activeAnalysisHashRef.current;
      if (analysisHash) markDraftAnalysis(article, analysisHash, "failed");
      const message = requestErrorMessage(requestError, "暂时无法开始体检。", "建立分析会话超时，请稍后重试。");
      setSession({ status: "error", error: message });
      setScoring({ status: "idle" });
      setQuestions({ status: "idle" });
    }
  }

  async function startAnalysis(article: ArticleDraft, force = false) {
    const pendingBaselinePersistence = recheckBaselinePersistenceRef.current;
    if (pendingBaselinePersistence) {
      await pendingBaselinePersistence;
      if (recheckBaselinePersistenceRef.current === pendingBaselinePersistence) {
        recheckBaselinePersistenceRef.current = null;
      }
    }
    workflowPersistenceBlockedRef.current = true;
    workflowSaveVersionRef.current += 1;
    flushDraftSession(article);
    const runId = activeRunRef.current + 1;
    activeRunRef.current = runId;
    abortActiveAnalysis();
    const controller = new AbortController();
    analysisControllerRef.current = controller;
    const { signal } = controller;
    const analysisHash = await createAnalysisHash(article);
    if (activeRunRef.current !== runId || signal.aborted) return;

    const cached = readCachedReport();
    if (!force && cached?.analysisHash === analysisHash) {
      markDraftAnalysis(article, analysisHash, "success");
      restoreCachedAnalysis(cached, article);
      return;
    }

    const articleParagraphs = createNumberedParagraphs(article.content);

    const previousAnalysisHash = activeAnalysisHashRef.current;
    if (previousAnalysisHash && previousAnalysisHash !== analysisHash) {
      setPatchStates({ advice: null, content_draft: null });
      setPatchChecklist([]);
    }

    if (!recheckBaseline) setPatchChecklist([]);
    activeAnalysisHashRef.current = analysisHash;
    analyzedDraftRef.current = article;
    markDraftAnalysis(article, analysisHash, "running");
    setParagraphs(articleParagraphs);
    setAnalysisStarted(true);
    beginAnalysisProgress();
    setWorkspaceStage("report");
    setReportView("overview");
    setSession({ status: "loading" });
    setRestoredFromCache(false);
    setCompleteWorkflowRestored(false);
    setExpandedQuestion(null);
    setScoring({ status: "loading" });
    setQuestions({ status: "loading" });
    setQuestionOrder([]);
    setDiagnostics({});
    setFeedbackByQuestion({});
    setFollowUpQuestion("");
    setFollowUpError("");
    setLatestQuestion(null);
    setGeoAnalysisToken(null);
    setActiveSessionRunId(null);
    workflowPersistenceBlockedRef.current = false;

    window.requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    });

    void openAnalysisSession(runId, article, articleParagraphs, signal);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const nextFieldErrors: FieldErrors = {};
    if (!(draft.title ?? "").trim()) nextFieldErrors.title = "请输入文章标题。";
    if (!contentText.trim()) {
      nextFieldErrors.content = "请粘贴文章正文。";
    } else if (contentText.trim().length < MIN_ARTICLE_CHARACTERS) {
      nextFieldErrors.content = `正文至少需要 ${MIN_ARTICLE_CHARACTERS} 字，才能进行可信度审查。`;
    }

    if (Object.keys(nextFieldErrors).length) {
      setFieldErrors(nextFieldErrors);
      window.requestAnimationFrame(() => {
        if (nextFieldErrors.title) titleRef.current?.focus();
        else contentRef.current?.focus();
      });
      return;
    }
    if (contentLength > MAX_ARTICLE_CHARACTERS) {
      setError("正文超过 12,000 字，请删减后重试。");
      return;
    }
    if (getDailyUsage() >= 10) {
      setError("今天的 10 次体验额度已用完，请明天再试。");
      return;
    }

    void startAnalysis({ ...draft, content: contentText });
  }

  function backToEditor() {
    workflowPersistenceBlockedRef.current = true;
    workflowSaveVersionRef.current += 1;
    activeRunRef.current += 1;
    abortActiveAnalysis();
    clearAnalysisProgressTimers();
    analysisCompletionHandledRef.current = false;
    setAnalysisProgressStep(0);
    setAnalysisProgressComplete(false);
    clearPersistedDraftAnalysis();
    setActiveSessionRunId(null);
    setGeoAnalysisToken(null);
    setAnalysisStarted(false);
    setRestoredFromCache(false);
    setCompleteWorkflowRestored(false);
    setSession({ status: "idle" });
    setExpandedQuestion(null);
    setError("");
  }

  function openEditorForRecheck() {
    const baseline = scoring.status === "success" && diagnosticsSucceeded
      ? createReportComparisonSnapshot(scoring.data, questionOrder, diagnostics)
      : null;
    if (baseline) setRecheckBaseline((current) => current ?? baseline);
    setWorkspaceStage("recheck");
    backToEditor();
    if (baseline) {
      // Persist the completed report and immutable baseline after the editor
      // transition blocks ordinary workflow writes.
      recheckBaselinePersistenceRef.current = persistWorkflow({
        recheckBaselineOverride: baseline,
        allowWhileEditing: true,
      });
    }
    focusEditor();
  }

  function returnToEditorAfterError() {
    setWorkspaceStage(recheckBaseline ? "recheck" : "review");
    if (!recheckBaseline) setReportView("overview");
    backToEditor();
    focusEditor();
  }

  function startNewAnalysis() {
    workflowPersistenceBlockedRef.current = true;
    setRecheckBaseline(null);
    setPatchChecklist([]);
    setPatchStates({ advice: null, content_draft: null });
    clearWorkflowState();
    setWorkspaceStage("review");
    setReportView("overview");
    backToEditor();
    focusEditor();
  }

  function scrollToSection(sectionId: string) {
    const settledOnlySection = sectionId === "diagnostic-section" || sectionId === "evidence-section";
    const succeededOnlySection = sectionId === "patch-workshop" || sectionId === "recheck-comparison";
    if (settledOnlySection && !reportAvailable) return;
    if (succeededOnlySection && !workflowSucceeded) return;

    if (sectionId === "patch-workshop") {
      setWorkspaceStage("advice");
      setReportView("patch");
    } else if (sectionId === "diagnostic-section") {
      setWorkspaceStage("report");
      setReportView("diagnosis");
    } else if (sectionId === "evidence-section") {
      setWorkspaceStage("report");
      setReportView("evidence");
    } else if (sectionId === "recheck-comparison") {
      if (!recheckBaseline) return;
      setWorkspaceStage("recheck");
      setReportView("recheck");
    } else if (sectionId === "report-overview" || sectionId === "report-core") {
      setWorkspaceStage("report");
      setReportView("overview");
    }
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
      });
    });
  }

  function retryScoring() {
    void startAnalysis(draft, true);
  }

  function retryQuestions() {
    void startAnalysis(draft, true);
  }

  function reportStatus() {
    if (restoredFromCache) {
      return { label: "本地缓存报告", className: "status-neutral" };
    }
    if (session.status === "loading") {
      return { label: "正在建立会话", className: "status-warning" };
    }
    if (session.status === "error" || scoring.status === "error" || questions.status === "error") {
      return { label: "需要重新审查", className: "status-danger" };
    }
    if (scoring.status === "loading" || questions.status === "loading") {
      return { label: "正在分析", className: "status-info" };
    }
    if (scoring.status === "success" && scoring.data.source === "model") {
      return { label: "模型分析", className: "status-success" };
    }
    return { label: "安全降级结果", className: "status-neutral" };
  }

  function retryDiagnostic(question: string) {
    const current = diagnostics[question];
    if (!current || current.errorCount >= 2 || !paragraphs.length) return;

    const runId = activeRunRef.current;
    const signal = analysisControllerRef.current?.signal;
    if (!signal || signal.aborted) return;
    setDiagnostics((state) => ({
      ...state,
      [question]: { ...state[question], status: "queued", errorCount: state[question].errorCount + 1 },
    }));
    void scheduleGeoDiagnostic(
      () => diagnoseQuestion(runId, draft.title, paragraphs, question, signal),
      signal,
    ).catch((scheduleError: unknown) => {
      if (isGeoAbortError(scheduleError) || activeRunRef.current !== runId) return;
      setDiagnostics((state) => ({
        ...state,
        [question]: {
          ...state[question],
          question,
          status: "error",
          error: requestErrorMessage(scheduleError, "该问题分析失败。", "该问题分析超时，请稍后重试。"),
        },
      }));
    });
  }

  function focusEditor() {
    window.requestAnimationFrame(() => titleRef.current?.focus());
  }

  function openReviewStage() {
    if (analysisStarted) {
      startNewAnalysis();
      return;
    }
    setRecheckBaseline(null);
    setReportView("overview");
    setWorkspaceStage("review");
    focusEditor();
  }

  function openReportStage() {
    if (!analysisStarted) return;
    scrollToSection("report-overview");
  }

  function openAdviceStage() {
    if (!canOpenAdvice) return;
    scrollToSection("patch-workshop");
  }

  function openRecheckStage() {
    if (!canOpenRecheck) return;
    if (recheckBaseline && workflowSucceeded) {
      scrollToSection("recheck-comparison");
      return;
    }
    openEditorForRecheck();
  }

  function submitFollowUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = followUpQuestion.trim();

    if (!paragraphs.length) {
      setFollowUpError("缓存报告不含正文，请重新运行体检后再追问。");
      return;
    }
    if (question.length < 6) {
      setFollowUpError("问题至少需要 6 个字。");
      return;
    }
    if (questionOrder.includes(question)) {
      setFollowUpError("这个问题已经分析过了。");
      return;
    }
    if (questionOrder.length >= 10) {
      setFollowUpError("每份报告最多分析 10 个问题。");
      return;
    }

    const runId = activeRunRef.current;
    const signal = analysisControllerRef.current?.signal;
    if (!signal || signal.aborted) {
      setFollowUpError("当前分析会话已结束，请重新运行体检后再追问。");
      return;
    }
    setFollowUpQuestion("");
    setFollowUpError("");
    setLatestQuestion(question);
    setExpandedQuestion(question);
    setQuestionOrder((current) => [...current, question]);
    setDiagnostics((current) => ({
      ...current,
      [question]: { question, status: "queued", errorCount: 0 },
    }));
    void scheduleGeoDiagnostic(
      () => diagnoseQuestion(runId, draft.title, paragraphs, question, signal),
      signal,
    ).catch((scheduleError: unknown) => {
      if (isGeoAbortError(scheduleError) || activeRunRef.current !== runId) return;
      setDiagnostics((state) => ({
        ...state,
        [question]: {
          ...state[question],
          question,
          status: "error",
          error: requestErrorMessage(scheduleError, "该问题分析失败。", "该问题分析超时，请稍后重试。"),
        },
      }));
    });
  }

  function submitDiagnosisFeedback(question: string, helpful: boolean) {
    if (restoredFromCache || !activeSessionRunId) return;
    if (feedbackByQuestion[question] !== undefined) return;
    const diagnosticIndex = questionOrder.indexOf(question);
    if (diagnosticIndex < 0) return;

    setFeedbackByQuestion((current) => ({ ...current, [question]: helpful }));
    void postGeoBetaEvent({
      event: "diagnosis_feedback",
      runId: activeSessionRunId,
      diagnosticIndex,
      helpful,
    });
  }

  function addPatchChecklistItem(item: PatchChecklistItem) {
    setPatchChecklist((current) => (
      current.some((existing) => existing.id === item.id) ? current : [...current, { ...item, sourceReportHash: activeAnalysisHashRef.current ?? undefined }]
    ));
  }

  return (
    <main className="app-shell">
      <AppHeader
        analysisStarted={analysisStarted}
        onShowEditor={() => (
          analysisStarted
            ? workflowSucceeded
              ? openEditorForRecheck()
              : returnToEditorAfterError()
            : focusEditor()
        )}
        onNewAnalysis={startNewAnalysis}
      />

      <div className="workspace-shell-layout">
        <WorkspaceSidebar
          stage={workspaceStage}
          canOpenReport={analysisStarted}
          canOpenAdvice={canOpenAdvice}
          canOpenRecheck={canOpenRecheck}
          onOpenReview={openReviewStage}
          onOpenReport={openReportStage}
          onOpenEvidence={() => scrollToSection("evidence-section")}
          onOpenDiagnosis={() => scrollToSection("diagnostic-section")}
          onOpenAdvice={openAdviceStage}
          onOpenRecheck={openRecheckStage}
          onFeedbackClick={() => void postGeoBetaEvent({ event: "feedback_clicked" })}
        />

        <div className="workspace-shell-content">
          {persistenceError || draftPersistenceError ? <p className="workspace-persistence-warning" role="alert">{persistenceError || draftPersistenceError}</p> : null}
          {isRestoringWorkflow ? (
            <section className="surface-flat border border-[var(--geo-border)] p-6 sm:p-8" role="status" aria-live="polite" aria-busy="true">
              <p className="data-label">正在恢复工作区</p>
              <h1 className="mt-2 text-xl font-semibold text-[var(--geo-text-strong)]">正在检查上次审查状态</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--geo-text-muted)]">正在读取本地工作流状态。恢复完成后会保留当前报告、修改建议和工作区位置。</p>
            </section>
          ) : analysisStarted ? (
            <ReportWorkspace
            view={reportView}
            title={draft.title}
            analysisSignal={analysisControllerRef.current?.signal}
            contentAvailable={Boolean(draft.content)}
            reportStatus={reportStatus()}
            session={session}
            scoring={scoring}
            questions={questions}
            scoreBand={currentScoreBand}
            questionOrder={questionOrder}
            diagnostics={diagnostics}
            diagnosticsSettled={diagnosticsSettled}
            diagnosticsSucceeded={diagnosticsSucceeded}
            canOpenPatch={canOpenAdvice}
            patchChecklist={patchChecklist}
            recheckBaseline={recheckBaseline}
            runId={activeSessionRunId}
            sourceHash={activeAnalysisHashRef.current}
            completedCount={completedCount}
            expandedQuestion={expandedQuestion}
            latestQuestion={latestQuestion}
            latestQuestionRef={latestQuestionRef}
            restoredFromCache={restoredFromCache}
            completeWorkflowRestored={completeWorkflowRestored}
            analysisProgressStep={analysisProgressStep}
            analysisProgressAnimationKey={activeRunRef.current}
            analysisProgressComplete={analysisProgressComplete}
            paragraphs={paragraphs}
            followUpQuestion={followUpQuestion}
            followUpError={followUpError}
            canAskFollowUp={canAskFollowUp}
            canSubmitFollowUp={canSubmitFollowUp}
            customQuestionCount={customQuestions.length}
            answeredCustomQuestionCount={answeredCustomQuestions}
            feedbackByQuestion={feedbackByQuestion}
            feedbackEnabled={Boolean(activeSessionRunId) && !restoredFromCache}
            canRetryDiagnostic={(question) => {
              const item = diagnostics[question];
              return Boolean(item && item.errorCount < 2 && paragraphs.length > 0);
            }}
            onBackToEditor={openEditorForRecheck}
            onReturnToEditor={returnToEditorAfterError}
            onRestartAnalysis={() => void startAnalysis(draft, true)}
            onRetryScoring={retryScoring}
            onRetryQuestions={retryQuestions}
            onRetryDiagnostic={retryDiagnostic}
            onToggleQuestion={(question) =>
              setExpandedQuestion((current) => (current === question ? null : question))
            }
            onFollowUpQuestionChange={(value) => {
              setFollowUpQuestion(value);
              setFollowUpError("");
            }}
            onSubmitFollowUp={submitFollowUp}
            onDiagnosisFeedback={submitDiagnosisFeedback}
            onAddPatchChecklistItem={addPatchChecklistItem}
            initialPatchStates={{
              ...(patchStates.advice ? { advice: patchStates.advice } : {}),
              ...(patchStates.content_draft ? { content_draft: patchStates.content_draft } : {}),
            }}
            onPatchStateChange={(mode, state) => {
              setPatchStates((current) => ({ ...current, [mode]: state.status === "success" ? state : current[mode] }));
            }}
            onScrollToSection={scrollToSection}
            />
          ) : (
            <EditorWorkspace
            draft={draft}
            contentLength={contentLength}
            minArticleCharacters={MIN_ARTICLE_CHARACTERS}
            maxArticleCharacters={MAX_ARTICLE_CHARACTERS}
            remaining={remaining}
            fieldErrors={fieldErrors}
            error={error}
            titleRef={titleRef}
            contentRef={contentRef}
            samples={EDITOR_SAMPLES}
            dimensions={EDITOR_DIMENSIONS}
            recheckContext={recheckBaseline ? {
              score: recheckBaseline.totalScore,
              issueCount: recheckBaseline.diagnostics.filter(isReportIssue).length,
              checklistItems: patchChecklist,
            } : null}
            draftSaveState={draftSaveState}
            onSubmit={submit}
            onDraftChange={updateDraft}
            onLoadSample={(index) => handleLoadSample(SAMPLES[index])}
            />
          )}
        </div>
      </div>
    </main>
  );
}
