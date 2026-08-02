"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { AppHeader } from "@/components/app-header";
import { EditorWorkspace } from "@/components/editor-workspace";
import { ReportWorkspace } from "@/components/report-workspace";
import {
  createAnalysisHash,
  markDraftAnalysis,
  readDraftSession,
  saveDraftSession,
} from "@/lib/client/analysis-persistence";
import {
  postGeoBetaEvent,
  postGeoJson,
  scheduleGeoDiagnostic,
  setGeoAnalysisToken,
  type AnalysisSessionClientData,
} from "@/lib/client/geo-api";
import {
  readCachedReport,
  saveCachedReport,
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
import { MAX_ARTICLE_CHARACTERS } from "@/lib/constants/input-limits";
import { createNumberedParagraphs } from "@/lib/geo/paragraphs";
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
    title: "内容创作者必须马上布局 AI 搜索",
    publishedAt: "",
    content:
      "AI 搜索已经非常重要，所有创作者都应该马上开始布局。未来绝大部分用户都会通过 AI 获取信息。\n\n创作者需要把文章写得更好，让 AI 更容易理解。只要内容质量足够高，就有机会得到更多曝光。\n\n具体方法包括优化结构、增加信息和回答用户问题。坚持执行，就能获得明显效果。",
  },
  {
    label: "营销过强",
    note: "承诺很多，事实很少",
    title: "一个方法让你的内容获得爆发式增长",
    publishedAt: "2026-07-13",
    content:
      "这是目前效果最强、全网领先的内容增长方法。任何人使用后都能快速提升流量，并获得前所未有的曝光。\n\n我们的独家方案可以彻底解决内容不被看见的问题，不需要复杂操作，也不需要长期等待。\n\n现在开始使用，你的文章就会更容易被所有 AI 平台推荐。这是创作者不可错过的增长机会。",
  },
];

const DIMENSION_META = [
  { key: "questionCoverage", label: "问题覆盖度", bar: "bg-[#08766e]" },
  { key: "factCompleteness", label: "事实完整度", bar: "bg-[#416b8a]" },
  { key: "structureClarity", label: "结构清晰度", bar: "bg-[#b7791f]" },
  { key: "freshness", label: "时效性", bar: "bg-[#c65d4b]" },
] as const;

const SAMPLE_META: Record<number, SamplePresentationMeta> = {
  0: {
    status: "已通过",
    description: "结构完整且信息源真实",
    badgeClassName: "border-[#b9d9d4] bg-[#ecfdf5] text-[#0f766e]",
  },
  1: {
    status: "风险",
    description: "缺乏必要的事实证据支撑",
    badgeClassName: "border-[#f1d69b] bg-[#fffbeb] text-[#a16207]",
  },
  2: {
    status: "待优化",
    description: "时效性模糊且结构混乱",
    badgeClassName: "border-[#f1c8c0] bg-[#fff1f2] text-[#be123c]",
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
      ? "bg-[#0f766e]"
      : index === 1
        ? "bg-[#5964cf]"
        : index === 2
          ? "bg-[#a86313]"
          : "bg-[#c85745]",
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

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
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

async function requestDiagnostic(
  title: string,
  paragraphs: Paragraph[],
  question: string,
): Promise<DiagnosticResult> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await postGeoJson("/api/qa-diagnostic", {
      title,
      numbered_paragraphs: paragraphs,
      question,
    });

    if (response.status === 429 && attempt === 0) {
      await wait(retryDelay(response) + Math.round(Math.random() * 250));
      continue;
    }
    if (!response.ok) {
      throw new Error(await responseError(response, "该问题分析失败。"));
    }
    return (await response.json()) as DiagnosticResult;
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
  const [storageReady, setStorageReady] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [feedbackByQuestion, setFeedbackByQuestion] = useState<Record<string, boolean | undefined>>({});
  const titleRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const latestQuestionRef = useRef<HTMLDivElement>(null);
  const activeRunRef = useRef(0);
  const activeAnalysisHashRef = useRef<string | null>(null);
  const reportedRunIdsRef = useRef(new Set<string>());
  const editorStartedReportedRef = useRef(false);
  const reportViewedRunIdsRef = useRef(new Set<string>());
  const reportViewDwellRef = useRef(new Map<string, number>());
  const [activeSessionRunId, setActiveSessionRunId] = useState<string | null>(null);
  const [recheckBaseline, setRecheckBaseline] = useState<ReportComparisonSnapshot | null>(null);

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
  const reportReady = !restoredFromCache &&
    analysisStarted &&
    scoring.status === "success" &&
    questions.status === "success" &&
    questionOrder.length > 0 &&
    questionOrder.every((question) => {
      const status = diagnostics[question]?.status;
      return status === "success" || status === "error";
    });

  const restoreCachedAnalysis = useCallback((cached: CacheEnvelope, restoredDraft: ArticleDraft) => {
    activeAnalysisHashRef.current = cached.analysisHash;
    setActiveSessionRunId(null);
    setGeoAnalysisToken(null);
    if (restoredDraft.content) {
      markDraftAnalysis(restoredDraft, cached.analysisHash, "success");
    }
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
    setAnalysisStarted(true);
    setRestoredFromCache(true);
  }, []);

  useEffect(() => {
    void postGeoBetaEvent({ event: "visit" });
  }, []);

  useEffect(() => {
    if (restoredFromCache || !analysisStarted) return;
    if (scoring.status !== "success" || questions.status !== "success") return;
    if (!questionOrder.length) return;
    const allSettled = questionOrder.every((question) => {
      const status = diagnostics[question]?.status;
      return status === "success" || status === "error";
    });
    const runId = activeSessionRunId;
    if (!allSettled || !runId || reportedRunIdsRef.current.has(runId)) return;

    reportedRunIdsRef.current.add(runId);
    void postGeoBetaEvent({ event: "analysis_completed", runId });
  }, [activeSessionRunId, analysisStarted, diagnostics, questionOrder, questions.status, restoredFromCache, scoring.status]);

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

      if (!cancelled) setStorageReady(true);
    }

    void restoreSession();
    return () => {
      cancelled = true;
    };
  }, [restoreCachedAnalysis]);

  useEffect(() => {
    if (!storageReady) return;
    saveDraftSession(draft);
  }, [draft, storageReady]);

  useEffect(() => {
    if (restoredFromCache || !analysisStarted || scoring.status !== "success" || questions.status !== "success") return;
    if (!questionOrder.length) return;
    const allSettled = questionOrder.every((question) => {
      const status = diagnostics[question]?.status;
      return status === "success" || status === "error";
    });
    if (!allSettled) return;

    const analysisHash = activeAnalysisHashRef.current;
    if (!analysisHash) return;

    markDraftAnalysis(draft, analysisHash, "success");
    saveCachedReport({
      title: draft.title,
      publishedAt: draft.publishedAt,
      scoring: scoring.data,
      questionSource: questions.data.source,
      questionOrder,
      diagnostics,
    }, analysisHash);
  }, [analysisStarted, diagnostics, draft, questionOrder, questions, restoredFromCache, scoring]);

  function updateDraft(field: keyof ArticleDraft, value: string) {
    if (!editorStartedReportedRef.current) {
      editorStartedReportedRef.current = true;
      void postGeoBetaEvent({ event: "editor_started" });
    }
    setDraft((current) => ({ ...current, [field]: value }));
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
    setDraft({ title: sample.title, content: sample.content, publishedAt: sample.publishedAt });
    setAnalysisStarted(false);
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
    setRecheckBaseline(null);
  }

  function handleLoadSample(sample: (typeof SAMPLES)[number]) {
    const isDirty = (draft?.title?.trim() ?? "") !== "" || contentText.trim() !== "";
    if (!isDirty || window.confirm("加载样本将覆盖当前已输入内容，确认继续吗？")) {
      loadSample(sample);
    }
  }

  async function loadScoring(runId: number, article: ArticleDraft) {
    try {
      const response = await postGeoJson("/api/evaluate-scoring", article);
      if (!response.ok) throw new Error(await responseError(response, "评分暂时失败。"));
      const data = (await response.json()) as EvaluateScoringResponse;
      if (activeRunRef.current === runId) setScoring({ status: "success", data });
    } catch (requestError) {
      if (activeRunRef.current !== runId) return;
      const analysisHash = activeAnalysisHashRef.current;
      if (analysisHash) markDraftAnalysis(article, analysisHash, "failed");
      setScoring({
        status: "error",
        error: requestError instanceof Error ? requestError.message : "评分暂时失败。",
      });
    }
  }

  async function diagnoseQuestion(
    runId: number,
    title: string,
    articleParagraphs: Paragraph[],
    question: string,
  ) {
    if (activeRunRef.current !== runId) return;
    setDiagnostics((current) => ({
      ...current,
      [question]: { ...current[question], question, status: "loading" },
    }));

    try {
      const data = await requestDiagnostic(title, articleParagraphs, question);
      if (activeRunRef.current !== runId) return;
      setDiagnostics((current) => ({
        ...current,
        [question]: { ...current[question], question, status: "success", data, error: undefined },
      }));
    } catch (requestError) {
      if (activeRunRef.current !== runId) return;
      setDiagnostics((current) => ({
        ...current,
        [question]: {
          ...current[question],
          question,
          status: "error",
          error: requestError instanceof Error ? requestError.message : "该问题分析失败。",
        },
      }));
    }
  }

  async function loadQuestionsAndDiagnostics(
    runId: number,
    articleParagraphs: Paragraph[],
    article: ArticleDraft,
  ) {
    try {
      const response = await postGeoJson("/api/predict-questions", {
        title: article.title,
        numbered_paragraphs: articleParagraphs,
      });
      if (!response.ok) throw new Error(await responseError(response, "问题预测暂时失败。"));
      const data = (await response.json()) as PredictQuestionsResponse;
      if (activeRunRef.current !== runId) return;

      setQuestions({ status: "success", data });
      setQuestionOrder(data.questions);
      setDiagnostics(initialDiagnostics(data.questions));
      await Promise.all(
        data.questions.map((question) =>
          scheduleGeoDiagnostic(() =>
            diagnoseQuestion(runId, article.title, articleParagraphs, question),
          ),
        ),
      );
    } catch (requestError) {
      if (activeRunRef.current !== runId) return;
      const analysisHash = activeAnalysisHashRef.current;
      if (analysisHash) markDraftAnalysis(article, analysisHash, "failed");
      setQuestions({
        status: "error",
        error: requestError instanceof Error ? requestError.message : "问题预测暂时失败。",
      });
    }
  }

  async function openAnalysisSession(
    runId: number,
    article: ArticleDraft,
    articleParagraphs: Paragraph[],
  ) {
    try {
      const response = await postGeoJson(
        "/api/analysis-session",
        {},
        { includeAnalysisToken: false },
      );
      if (!response.ok) {
        throw new Error(await responseError(response, "暂时无法开始体检。"));
      }

      const session = (await response.json()) as AnalysisSessionClientData;
      if (!session.token || typeof session.token !== "string") {
        throw new Error("分析会话无效，请重新提交。");
      }
      if (activeRunRef.current !== runId) return;

      setGeoAnalysisToken(session.token);
      setActiveSessionRunId(session.runId);
      setSession({ status: "success" });
      recordUsage();
      void postGeoBetaEvent({ event: "analysis_started", runId: session.runId });
      void loadScoring(runId, article);
      void loadQuestionsAndDiagnostics(runId, articleParagraphs, article);
    } catch (requestError) {
      if (activeRunRef.current !== runId) return;
      const analysisHash = activeAnalysisHashRef.current;
      if (analysisHash) markDraftAnalysis(article, analysisHash, "failed");
      const message = requestError instanceof Error ? requestError.message : "暂时无法开始体检。";
      setSession({ status: "error", error: message });
      setScoring({ status: "idle" });
      setQuestions({ status: "idle" });
    }
  }

  async function startAnalysis(article: ArticleDraft, force = false) {
    const runId = activeRunRef.current + 1;
    activeRunRef.current = runId;
    const analysisHash = await createAnalysisHash(article);
    if (activeRunRef.current !== runId) return;

    const cached = readCachedReport();
    if (!force && cached?.analysisHash === analysisHash) {
      markDraftAnalysis(article, analysisHash, "success");
      restoreCachedAnalysis(cached, article);
      return;
    }

    const articleParagraphs = createNumberedParagraphs(article.content);

    activeAnalysisHashRef.current = analysisHash;
    markDraftAnalysis(article, analysisHash, "running");
    setParagraphs(articleParagraphs);
    setAnalysisStarted(true);
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

    void openAnalysisSession(runId, article, articleParagraphs);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const nextFieldErrors: FieldErrors = {};
    if (!(draft.title ?? "").trim()) nextFieldErrors.title = "请输入文章标题。";
    if (!contentText.trim()) nextFieldErrors.content = "请粘贴文章正文。";

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
    activeRunRef.current += 1;
    setActiveSessionRunId(null);
    setGeoAnalysisToken(null);
    setAnalysisStarted(false);
    setSession({ status: "idle" });
    setExpandedQuestion(null);
    setError("");
  }

  function openEditorForRecheck() {
    const allDiagnosticsComplete = questionOrder.length > 0 && questionOrder.every(
      (question) => diagnostics[question]?.status === "success",
    );
    if (scoring.status === "success" && allDiagnosticsComplete) {
      setRecheckBaseline((current) => current ?? createReportComparisonSnapshot(
        scoring.data,
        questionOrder,
        diagnostics,
      ));
    }
    backToEditor();
  }

  function startNewAnalysis() {
    setRecheckBaseline(null);
    backToEditor();
  }

  function scrollToSection(sectionId: string) {
    const section = document.getElementById(sectionId);
    if (!section) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    section.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }

  function retryScoring() {
    void startAnalysis(draft, true);
  }

  function retryQuestions() {
    void startAnalysis(draft, true);
  }

  function reportStatus() {
    if (restoredFromCache) {
      return { label: "本地缓存报告", className: "border-[#d8e4e1] text-[#687386]" };
    }
    if (session.status === "loading") {
      return { label: "正在建立会话", className: "border-[#ead8ac] bg-[#fffaf0] text-[#8a5b12]" };
    }
    if (session.status === "error" || scoring.status === "error" || questions.status === "error") {
      return { label: "需要重新体检", className: "border-[#f0d6d1] bg-[#fff8f6] text-[#a43e2b]" };
    }
    if (scoring.status === "loading" || questions.status === "loading") {
      return { label: "正在分析", className: "border-[#d8e4e1] bg-[#f3f7f6] text-[#0e766e]" };
    }
    if (scoring.status === "success" && scoring.data.source === "model") {
      return { label: "AI 模型分析", className: "border-[#b9d9d4] bg-[#e7f4f1] text-[#0e766e]" };
    }
    return { label: "安全降级结果", className: "border-[#d8e4e1] text-[#687386]" };
  }

  function retryDiagnostic(question: string) {
    const current = diagnostics[question];
    if (!current || current.errorCount >= 2 || !paragraphs.length) return;

    setDiagnostics((state) => ({
      ...state,
      [question]: { ...state[question], status: "queued", errorCount: state[question].errorCount + 1 },
    }));
    void scheduleGeoDiagnostic(() =>
      diagnoseQuestion(activeRunRef.current, draft.title, paragraphs, question),
    );
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
    setFollowUpQuestion("");
    setFollowUpError("");
    setLatestQuestion(question);
    setExpandedQuestion(question);
    setQuestionOrder((current) => [...current, question]);
    setDiagnostics((current) => ({
      ...current,
      [question]: { question, status: "queued", errorCount: 0 },
    }));
    void scheduleGeoDiagnostic(() =>
      diagnoseQuestion(runId, draft.title, paragraphs, question),
    );
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

  return (
    <main className="app-shell">
      <AppHeader
        analysisStarted={analysisStarted}
        onShowEditor={() => analysisStarted && openEditorForRecheck()}
        onShowReport={() => scrollToSection("report-overview")}
        onShowPatches={() => scrollToSection("patch-workshop")}
        onNewAnalysis={startNewAnalysis}
        feedbackUrl={process.env.NEXT_PUBLIC_FEEDBACK_URL}
        onFeedbackClick={() => void postGeoBetaEvent({ event: "feedback_clicked" })}
      />

      <div>
        {analysisStarted ? (
          <ReportWorkspace
            title={draft.title}
            publishedAt={draft.publishedAt}
            contentAvailable={Boolean(draft.content)}
            reportStatus={reportStatus()}
            session={session}
            scoring={scoring}
            questions={questions}
            scoreBand={currentScoreBand}
            questionOrder={questionOrder}
            diagnostics={diagnostics}
            recheckBaseline={recheckBaseline}
            runId={activeSessionRunId}
            completedCount={completedCount}
            expandedQuestion={expandedQuestion}
            latestQuestion={latestQuestion}
            latestQuestionRef={latestQuestionRef}
            restoredFromCache={restoredFromCache}
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
            onScrollToSection={scrollToSection}
          />
        ) : (
          <EditorWorkspace
            draft={draft}
            contentLength={contentLength}
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
            } : null}
            onSubmit={submit}
            onDraftChange={updateDraft}
            onLoadSample={(index) => handleLoadSample(SAMPLES[index])}
          />
        )}
      </div>
    </main>
  );
}
