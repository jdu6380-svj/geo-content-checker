"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { AppHeader } from "@/components/app-header";
import { EditorWorkspace } from "@/components/editor-workspace";
import { ReportWorkspace, type ReportWorkspaceView } from "@/components/report-workspace";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import {
  WorkspaceCommandBar,
  type WorkspaceStage,
  type WorkspaceStatus,
} from "@/components/workspace-command-bar";
import {
  clearDraftAnalysis,
  createAnalysisHash,
  markDraftAnalysis,
  readDraftSession,
  saveDraftSession,
} from "@/lib/client/analysis-persistence";
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
  MAX_ARTICLE_CHARACTERS,
  MIN_ARTICLE_CHARACTERS,
} from "@/lib/constants/input-limits";
import type {
  DiagnosticResult,
  EvaluateScoringResponse,
  Paragraph,
  PredictQuestionsResponse,
} from "@/lib/schemas/geo";
import { createNumberedParagraphs } from "@/lib/geo/paragraphs";

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
    title: "独立创作者如何为 AI 搜索优化长文",
    publishedAt: "2026-07-13",
    content:
      "AI 搜索正在改变用户发现内容的方式。传统搜索通常先展示链接，AI 搜索则会提取多个来源的信息并组织成回答。\n\n一、创作者为什么要关注 GEO\n当文章能够直接回答真实问题，并提供清楚的事实、时间和适用边界时，模型更容易准确理解内容。GEO 不等于保证排名，它关注的是内容被正确理解和引用的准备度。\n\n二、具体怎么做\n第一步，列出读者最可能提出的 5 个问题。第二步，为关键结论补充数据、案例或来源。第三步，增加小标题、列表和 FAQ。第四步，标注发布日期、更新时间和适用版本。\n\n适用范围\n这套方法适合公众号、博客和帮助中心长文，不适合依赖图片或视频才能理解的内容。完成修改后，仍需人工确认事实是否准确。",
  },
  {
    label: "信息缺失",
    note: "观点明确，证据不足",
    title: "B2B SaaS 内容团队如何准备 AI 搜索发布",
    publishedAt: "",
    content:
      "AI 搜索已经非常重要，所有创作者都应该马上开始布局。未来绝大部分用户都会通过 AI 获取信息。\n\n创作者需要把文章写得更好，让 AI 更容易理解。只要内容质量足够高，就有机会得到更多曝光。\n\n具体方法包括优化结构、增加信息和回答用户问题。坚持执行，就能获得明显效果。",
  },
  {
    label: "营销过强",
    note: "承诺很多，事实很少",
    title: "B2B SaaS 多产品线的 AI 搜索增长承诺风险",
    publishedAt: "2026-07-13",
    content:
      "这是目前效果最强、全网领先的内容增长方法。任何人使用后都能快速提升流量，并获得前所未有的曝光。\n\n我们的独家方案可以彻底解决内容不被看见的问题，不需要复杂操作，也不需要长期等待。\n\n现在开始使用，你的文章就会更容易被所有 AI 平台推荐。这是创作者不可错过的增长机会。",
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
    status: "完整模板",
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
    const saved = window.localStorage.getItem(DAILY_USAGE_KEY);
    if (!saved) return 0;
    const value = JSON.parse(saved) as { date?: string; count?: number };
    return value.date === new Date().toISOString().slice(0, 10) && typeof value.count === "number" ? value.count : 0;
  } catch {
    return 0;
  }
}

function recordUsage(): void {
  try {
    const date = new Date().toISOString().slice(0, 10);
    window.localStorage.setItem(DAILY_USAGE_KEY, JSON.stringify({ date, count: getDailyUsage() + 1 }));
  } catch {
    // Local usage is legacy-only telemetry and must not block drafting.
  }
}

function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(createGeoAbortError());
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => { signal?.removeEventListener("abort", handleAbort); resolve(); }, milliseconds);
    const handleAbort = () => { window.clearTimeout(timeoutId); signal?.removeEventListener("abort", handleAbort); reject(createGeoAbortError()); };
    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

function retryDelay(response: Response): number {
  const retryAfter = response.headers.get("retry-after");
  if (!retryAfter) return 1_000;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) return Math.min(Math.max(seconds * 1_000, 500), 5_000);
  const date = Date.parse(retryAfter);
  return Number.isFinite(date) ? Math.min(Math.max(date - Date.now(), 500), 5_000) : 1_000;
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
  return isGeoRequestDeadlineError(error) ? deadlineMessage : error instanceof Error ? error.message : fallback;
}

async function requestDiagnostic(title: string, paragraphs: Paragraph[], question: string, signal: AbortSignal): Promise<DiagnosticResult> {
  void title;
  void paragraphs;
  void question;
  void signal;
  throw new Error("真实分析需在认证商业工作台中执行。");
}

function initialDiagnostics(questions: string[]): DiagnosticsState {
  return Object.fromEntries(questions.map((question) => [question, { question, status: "queued", errorCount: 0 } satisfies DiagnosticItem]));
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
  const [storageReady, setStorageReady] = useState(false);
  const [error, setError] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [feedbackByQuestion, setFeedbackByQuestion] = useState<Record<string, boolean | undefined>>({});
  const titleRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const latestQuestionRef = useRef<HTMLDivElement>(null);
  const activeRunRef = useRef(0);
  const analysisControllerRef = useRef<AbortController | null>(null);
  const activeAnalysisHashRef = useRef<string | null>(null);
  const draftRef = useRef<ArticleDraft>(draft);
  const draftSaveTimerRef = useRef<number | null>(null);
  const analysisProgressTimersRef = useRef<number[]>([]);
  const analysisCompletionHandledRef = useRef(false);
  const storageReadyRef = useRef(false);
  const reportedRunIdsRef = useRef(new Set<string>());
  const editorStartedReportedRef = useRef(false);
  const reportViewedRunIdsRef = useRef(new Set<string>());
  const reportViewDwellRef = useRef(new Map<string, number>());
  const [activeSessionRunId, setActiveSessionRunId] = useState<string | null>(null);
  const [recheckBaseline, setRecheckBaseline] = useState<ReportComparisonSnapshot | null>(null);
  const [patchChecklist, setPatchChecklist] = useState<PatchChecklistItem[]>([]);
  const [workspaceStage, setWorkspaceStage] = useState<WorkspaceStage>("review");
  const [reportView, setReportView] = useState<ReportWorkspaceView>("overview");
  const [analysisProgressStep, setAnalysisProgressStep] = useState(0);
  const [analysisProgressComplete, setAnalysisProgressComplete] = useState(false);

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
  const workflowSucceeded = reportAvailable && diagnosticsSucceeded;
  const workspaceFlowComplete = workflowSucceeded;
  const workspaceHasError = session.status === "error" || scoring.status === "error" ||
    questions.status === "error" || Object.values(diagnostics).some((item) => item.status === "error");
  const workspaceIsAnalyzing = !analysisPresentationComplete || session.status === "loading" || scoring.status === "loading" ||
    questions.status === "loading" || Object.values(diagnostics).some(
      (item) => item.status === "queued" || item.status === "loading",
    );
  const editorReady = Boolean(
    draft.title.trim() &&
    contentText.trim().length >= MIN_ARTICLE_CHARACTERS &&
    remaining >= 0
  );
  const workspaceStatus: WorkspaceStatus = !analysisStarted
    ? error || Object.values(fieldErrors).some(Boolean)
      ? "error"
      : editorReady
        ? "ready"
        : "empty"
    : workspaceHasError
      ? "error"
      : restoredFromCache
        ? "warning"
        : workspaceFlowComplete
          ? "completed"
          : workspaceIsAnalyzing
            ? "analyzing"
            : "warning";
  const canOpenAdvice = analysisStarted && workflowSucceeded;
  const canOpenRecheck = canOpenAdvice && Boolean(contentText.trim());

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
    saveDraftSession(draftRef.current);
  }, []);

  const clearPersistedDraftAnalysis = useCallback((nextDraft?: ArticleDraft) => {
    if (nextDraft) draftRef.current = nextDraft;
    if (draftSaveTimerRef.current !== null) {
      window.clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
    if (!storageReadyRef.current) return;
    clearDraftAnalysis(draftRef.current);
  }, []);

  const restoreCachedAnalysis = useCallback((cached: CacheEnvelope, restoredDraft: ArticleDraft) => {
    abortActiveAnalysis();
    clearAnalysisProgressTimers();
    analysisCompletionHandledRef.current = true;
    activeAnalysisHashRef.current = cached.analysisHash;
    setActiveSessionRunId(null);
    setGeoAnalysisToken(null);
    if (restoredDraft.content) {
      markDraftAnalysis(restoredDraft, cached.analysisHash, "success");
    }
    draftRef.current = restoredDraft;
    setDraft(restoredDraft);
    setParagraphs([]);
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
      const stored = readDraftSession();
      const cached = readCachedReport();

      if (stored) {
        const storedHash = await createAnalysisHash(stored.draft);
        if (cancelled) return;

        draftRef.current = stored.draft;
        setDraft(stored.draft);
        if (stored.analysis?.status === "running") {
          markDraftAnalysis(stored.draft, storedHash, "failed");
          setError("上次分析在完成前中断，草稿已恢复，请重新分析。");
        } else if (
          stored.analysis?.status === "success" &&
          stored.analysis.analysisHash === storedHash &&
          cached?.analysisHash === storedHash
        ) {
          restoreCachedAnalysis(cached, stored.draft);
        }
      } else if (cached) {
        restoreCachedAnalysis(cached, {
          title: cached.report.title,
          content: "",
          publishedAt: cached.report.publishedAt,
        });
      }

      if (!cancelled) {
        storageReadyRef.current = true;
        setStorageReady(true);
      }
    }

    void restoreSession();
    return () => {
      cancelled = true;
    };
  }, [restoreCachedAnalysis]);

  useEffect(() => {
    if (!storageReady) return;
    draftRef.current = draft;
    if (draftSaveTimerRef.current !== null) {
      window.clearTimeout(draftSaveTimerRef.current);
    }

    const timerId = window.setTimeout(() => {
      if (draftSaveTimerRef.current !== timerId) return;
      draftSaveTimerRef.current = null;
      saveDraftSession(draftRef.current);
    }, DRAFT_SAVE_DEBOUNCE_MS);
    draftSaveTimerRef.current = timerId;

    return () => {
      if (draftSaveTimerRef.current !== timerId) return;
      window.clearTimeout(timerId);
      draftSaveTimerRef.current = null;
    };
  }, [draft, storageReady]);

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
    setAuthRequired(false);
    setFieldErrors({});
    setRestoredFromCache(false);
    setRecheckBaseline(null);
    setPatchChecklist([]);
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

  async function legacyStartAnalysis(article: ArticleDraft, force = false) {
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

    if (!recheckBaseline) setPatchChecklist([]);
    activeAnalysisHashRef.current = analysisHash;
    markDraftAnalysis(article, analysisHash, "running");
    setParagraphs(articleParagraphs);
    setAnalysisStarted(true);
    beginAnalysisProgress();
    setWorkspaceStage("report");
    setReportView("overview");
    setSession({ status: "loading" });
    setRestoredFromCache(false);
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

    window.requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    });

    void openAnalysisSession(runId, article, articleParagraphs, signal);
  }

  function startAnalysis(_article: ArticleDraft, _force = false): void {
    // The public editor remains available for drafting, but execution now
    // belongs to the authenticated, workspace-scoped commercial workflow.
    setAuthRequired(true);
    setError("真实分析需在认证商业工作台中执行。");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setAuthRequired(false);

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
    void startAnalysis({ ...draft, content: contentText });
  }

  function backToEditor() {
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
    setSession({ status: "idle" });
    setExpandedQuestion(null);
    setError("");
    setAuthRequired(false);
  }

  function openEditorForRecheck() {
    if (scoring.status === "success" && diagnosticsSucceeded) {
      setRecheckBaseline((current) => current ?? createReportComparisonSnapshot(
        scoring.data,
        questionOrder,
        diagnostics,
      ));
    }
    setWorkspaceStage("recheck");
    backToEditor();
    focusEditor();
  }

  function returnToEditorAfterError() {
    setWorkspaceStage(recheckBaseline ? "recheck" : "review");
    if (!recheckBaseline) setReportView("overview");
    backToEditor();
    focusEditor();
  }

  function startNewAnalysis() {
    setRecheckBaseline(null);
    setPatchChecklist([]);
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
      return { label: "AI 模型分析", className: "status-success" };
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
    setFollowUpError("真实分析需在认证商业工作台中执行，请登录后从项目中重新提交。");
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
      current.some((existing) => existing.id === item.id) ? current : [...current, item]
    ));
  }

  const feedbackUrl = process.env.NEXT_PUBLIC_FEEDBACK_URL;

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
        feedbackUrl={feedbackUrl}
        onFeedbackClick={() => void postGeoBetaEvent({ event: "feedback_clicked" })}
        navigation={(
          <WorkspaceCommandBar
            stage={workspaceStage}
            status={workspaceStatus}
            title={draft.title}
            canOpenReport={analysisStarted}
            canOpenAdvice={canOpenAdvice}
            canOpenRecheck={canOpenRecheck}
            onOpenReview={openReviewStage}
            onOpenReport={openReportStage}
            onOpenAdvice={openAdviceStage}
            onOpenRecheck={openRecheckStage}
          />
        )}
      />

      <div className="workspace-shell-layout">
        <WorkspaceSidebar
          stage={workspaceStage}
          reportView={reportView}
          canOpenReport={analysisStarted}
          canOpenAdvice={canOpenAdvice}
          canOpenRecheck={canOpenRecheck}
          onOpenReview={openReviewStage}
          onOpenReport={openReportStage}
          onOpenEvidence={() => scrollToSection("evidence-section")}
          onOpenDiagnosis={() => scrollToSection("diagnostic-section")}
          onOpenAdvice={openAdviceStage}
          onOpenRecheck={openRecheckStage}
          feedbackUrl={feedbackUrl}
          onFeedbackClick={() => void postGeoBetaEvent({ event: "feedback_clicked" })}
        />

        <div className="workspace-shell-content">
          {analysisStarted ? (
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
            patchChecklist={patchChecklist}
            recheckBaseline={recheckBaseline}
            runId={activeSessionRunId}
            completedCount={completedCount}
            expandedQuestion={expandedQuestion}
            latestQuestion={latestQuestion}
            latestQuestionRef={latestQuestionRef}
            restoredFromCache={restoredFromCache}
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
            authRequired={authRequired}
            titleRef={titleRef}
            contentRef={contentRef}
            samples={EDITOR_SAMPLES}
            dimensions={EDITOR_DIMENSIONS}
            recheckContext={recheckBaseline ? {
              score: recheckBaseline.totalScore,
              issueCount: recheckBaseline.diagnostics.filter(isReportIssue).length,
              checklistItems: patchChecklist,
            } : null}
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
