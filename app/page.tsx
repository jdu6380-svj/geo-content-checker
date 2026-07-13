"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { DatePicker } from "@/components/date-picker";
import { DiagnosticAccordion } from "@/components/diagnostic-accordion";
import { PatchWorkshop } from "@/components/patch-workshop";
import {
  readCachedReport,
  saveCachedReport,
  type DiagnosticItem,
  type DiagnosticsState,
  type LoadState,
} from "@/lib/client/report-state";
import {
  postGeoJson,
  scheduleGeoDiagnostic,
  setGeoAnalysisToken,
  warmGeoApi,
  type AnalysisSessionClientData,
} from "@/lib/client/geo-api";
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
  ["questionCoverage", "问题覆盖度"],
  ["factCompleteness", "事实完整度"],
  ["structureClarity", "结构清晰度"],
  ["freshness", "时效性"],
] as const;

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

function ScoreSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-[260px_1fr]" aria-label="正在生成评分">
      <div className="card min-h-[210px] animate-pulse p-6 motion-reduce:animate-none">
        <div className="h-3 w-24 rounded bg-[#e5e8ed]" />
        <div className="mt-6 h-16 w-32 rounded bg-[#edf0f2]" />
        <div className="mt-5 h-3 w-full rounded bg-[#edf0f2]" />
      </div>
      <div className="card min-h-[210px] animate-pulse p-6 motion-reduce:animate-none">
        <div className="h-3 w-20 rounded bg-[#e5e8ed]" />
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index}>
              <div className="h-3 w-24 rounded bg-[#e5e8ed]" />
              <div className="mt-3 h-2 w-full rounded bg-[#edf0f2]" />
              <div className="mt-3 h-3 w-4/5 rounded bg-[#edf0f2]" />
            </div>
          ))}
        </div>
      </div>
    </div>
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
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const titleRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const latestQuestionRef = useRef<HTMLDivElement>(null);
  const activeRunRef = useRef(0);

  const remaining = useMemo(() => 12_000 - draft.content.length, [draft.content]);
  const completedCount = questionOrder.filter((question) => diagnostics[question]?.status === "success").length;
  const customQuestions = questionOrder.slice(5);
  const answeredCustomQuestions = customQuestions.filter(
    (question) => diagnostics[question]?.data?.answerability === "可以完全回答",
  ).length;

  useEffect(() => {
    void warmGeoApi();
  }, []);

  useEffect(() => {
    if (!latestQuestion) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    latestQuestionRef.current?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "center",
    });
  }, [latestQuestion]);

  useEffect(() => {
    const cached = readCachedReport();
    if (!cached) return;

    setDraft({ title: cached.title, content: "", publishedAt: cached.publishedAt });
    setScoring({ status: "success", data: cached.scoring });
    setQuestions({
      status: "success",
      data: { questions: cached.questionOrder, source: "fallback" },
    });
    setQuestionOrder(cached.questionOrder);
    setDiagnostics(cached.diagnostics);
    setAnalysisStarted(true);
    setRestoredFromCache(true);
  }, []);

  useEffect(() => {
    if (restoredFromCache || !analysisStarted || scoring.status !== "success" || questions.status !== "success") return;
    if (!questionOrder.length) return;
    const allSettled = questionOrder.every((question) => {
      const status = diagnostics[question]?.status;
      return status === "success" || status === "error";
    });
    if (!allSettled) return;

    saveCachedReport({
      title: draft.title,
      publishedAt: draft.publishedAt,
      scoring: scoring.data,
      questionOrder,
      diagnostics,
    });
  }, [analysisStarted, diagnostics, draft.publishedAt, draft.title, questionOrder, questions, restoredFromCache, scoring]);

  function updateDraft(field: keyof ArticleDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    if (field === "title" || field === "content") {
      setFieldErrors((current) => ({ ...current, [field]: undefined }));
    }
  }

  function loadSample(sample: (typeof SAMPLES)[number]) {
    activeRunRef.current += 1;
    setDraft({ title: sample.title, content: sample.content, publishedAt: sample.publishedAt });
    setAnalysisStarted(false);
    setSession({ status: "idle" });
    setScoring({ status: "idle" });
    setQuestions({ status: "idle" });
    setQuestionOrder([]);
    setDiagnostics({});
    setParagraphs([]);
    setFollowUpQuestion("");
    setFollowUpError("");
    setLatestQuestion(null);
    setError("");
    setFieldErrors({});
    setRestoredFromCache(false);
  }

  async function loadScoring(runId: number, article: ArticleDraft) {
    try {
      const response = await postGeoJson("/api/evaluate-scoring", article);
      if (!response.ok) throw new Error(await responseError(response, "评分暂时失败。"));
      const data = (await response.json()) as EvaluateScoringResponse;
      if (activeRunRef.current === runId) setScoring({ status: "success", data });
    } catch (requestError) {
      if (activeRunRef.current !== runId) return;
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

  async function loadQuestionsAndDiagnostics(runId: number, articleParagraphs: Paragraph[], title: string) {
    try {
      const response = await postGeoJson("/api/predict-questions", {
        title,
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
            diagnoseQuestion(runId, title, articleParagraphs, question),
          ),
        ),
      );
    } catch (requestError) {
      if (activeRunRef.current !== runId) return;
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
      setSession({ status: "success" });
      recordUsage();
      void loadScoring(runId, article);
      void loadQuestionsAndDiagnostics(runId, articleParagraphs, article.title);
    } catch (requestError) {
      if (activeRunRef.current !== runId) return;
      const message = requestError instanceof Error ? requestError.message : "暂时无法开始体检。";
      setSession({ status: "error", error: message });
      setScoring({ status: "idle" });
      setQuestions({ status: "idle" });
    }
  }

  function startAnalysis(article: ArticleDraft) {
    const runId = activeRunRef.current + 1;
    activeRunRef.current = runId;
    const articleParagraphs = createNumberedParagraphs(article.content);

    setParagraphs(articleParagraphs);
    setAnalysisStarted(true);
    setSession({ status: "loading" });
    setRestoredFromCache(false);
    setExpandedQuestion(null);
    setScoring({ status: "loading" });
    setQuestions({ status: "loading" });
    setQuestionOrder([]);
    setDiagnostics({});
    setFollowUpQuestion("");
    setFollowUpError("");
    setLatestQuestion(null);
    setGeoAnalysisToken(null);

    void openAnalysisSession(runId, article, articleParagraphs);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const nextFieldErrors: FieldErrors = {};
    if (!draft.title.trim()) nextFieldErrors.title = "请输入文章标题。";
    if (!draft.content.trim()) nextFieldErrors.content = "请粘贴文章正文。";

    if (Object.keys(nextFieldErrors).length) {
      setFieldErrors(nextFieldErrors);
      window.requestAnimationFrame(() => {
        if (nextFieldErrors.title) titleRef.current?.focus();
        else contentRef.current?.focus();
      });
      return;
    }
    if (draft.content.length > 12_000) {
      setError("正文超过 12,000 字，请删减后重试。");
      return;
    }
    if (getDailyUsage() >= 10) {
      setError("今天的 10 次体验额度已用完，请明天再试。");
      return;
    }

    startAnalysis(draft);
  }

  function backToEditor() {
    activeRunRef.current += 1;
    setAnalysisStarted(false);
    setSession({ status: "idle" });
    setExpandedQuestion(null);
    setError("");
  }

  function retryScoring() {
    startAnalysis(draft);
  }

  function retryQuestions() {
    startAnalysis(draft);
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

  function renderScoreDashboard() {
    if (scoring.status === "loading" || scoring.status === "idle") return <ScoreSkeleton />;
    if (scoring.status === "error") {
      return (
        <div className="card flex min-h-[150px] flex-col items-start justify-center p-6">
          <h2 className="font-bold">评分暂时失败</h2>
          <p className="mt-2 text-sm text-[#687386]">{scoring.error}</p>
          {!restoredFromCache && draft.content ? (
            <button type="button" onClick={retryScoring} className="mt-4 h-9 rounded-lg bg-[#0e766e] px-4 text-sm font-semibold text-white">
              重新评分
            </button>
          ) : null}
        </div>
      );
    }

    const report = scoring.data;
    return (
      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        <div className="card p-6">
          <div className="label">综合 GEO 得分</div>
          <div className="mt-5 flex items-end gap-2">
            <strong className="text-6xl text-[#0e766e]">{report.totalScore}</strong>
            <span className="pb-2 text-[#687386]">/ 100</span>
          </div>
          <p className="mt-5 text-sm leading-6 text-[#687386]">
            该分数衡量内容被 AI 理解与引用的准备度，不代表实际收录或排名。
          </p>
        </div>

        <div className="card p-6">
          <div className="label">四维看板</div>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            {DIMENSION_META.map(([key, label]) => {
              const dimension = report.dimensions[key];
              const percentage = Math.round((dimension.score / dimension.max) * 100);
              return (
                <div key={key}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold">{label}</span>
                    <span className="text-[#687386]">{dimension.score} / {dimension.max}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#edf0f2]">
                    <div className="h-full rounded-full bg-[#0e766e]" style={{ width: `${percentage}%` }} />
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#687386]">{dimension.reason}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  function renderDiagnostics() {
    if (questions.status === "loading" || questions.status === "idle") {
      return (
        <div className="mt-3 grid gap-3" aria-label="正在预测读者问题">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="card flex min-h-[76px] items-center gap-3 p-4">
              <span className="h-8 w-8 rounded-lg bg-[#edf0f2]" />
              <span className="h-4 w-2/3 animate-pulse rounded bg-[#edf0f2] motion-reduce:animate-none" />
            </div>
          ))}
        </div>
      );
    }
    if (questions.status === "error") {
      return (
        <div className="card mt-3 p-5">
          <p className="font-semibold">{questions.error}</p>
          {!restoredFromCache && paragraphs.length ? (
            <button type="button" onClick={retryQuestions} className="mt-3 h-9 rounded-lg bg-[#0e766e] px-4 text-sm font-semibold text-white">
              重新生成问题
            </button>
          ) : null}
        </div>
      );
    }

    return (
      <div className="mt-3 grid gap-3">
        {questionOrder.map((question, index) => {
          const item = diagnostics[question] ?? {
            question,
            status: "queued" as const,
            errorCount: 0,
          };
          return (
            <div key={question} ref={latestQuestion === question ? latestQuestionRef : undefined}>
              <DiagnosticAccordion
                id={String(index + 1).padStart(2, "0")}
                item={item}
                expanded={expandedQuestion === question}
                onToggle={() => setExpandedQuestion((current) => (current === question ? null : question))}
                onRetry={() => retryDiagnostic(question)}
                canRetry={item.errorCount < 2 && paragraphs.length > 0}
              />
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#fbfbfa] text-[#17202f]">
      <header className="border-b border-[#e5e8ed] bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#0e766e] text-sm font-bold text-white">见</span>
            <div>
              <div className="text-sm font-bold">见微 GEO</div>
              <div className="text-xs text-[#687386]">内容体检工作台</div>
            </div>
          </div>
          <span className="rounded-full bg-[#e7f4f1] px-3 py-1.5 text-xs font-semibold text-[#0e766e]">正文不保存</span>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
        {analysisStarted ? (
          <section
            aria-live="polite"
            aria-busy={session.status === "loading" || scoring.status === "loading" || questions.status === "loading"}
          >
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <button type="button" onClick={backToEditor} className="mb-3 text-sm font-semibold text-[#0e766e] hover:underline">
                  ← 返回编辑
                </button>
                <p className="text-sm text-[#687386]">{draft.title}</p>
                <h1 className="mt-1 text-3xl font-bold">体检报告</h1>
              </div>
              <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${reportStatus().className}`}>
                {reportStatus().label}
              </span>
            </div>

            {session.status === "error" ? (
              <div role="alert" className="border border-[#f0d6d1] border-l-4 border-l-[#d85f47] bg-[#fff8f6] p-5 sm:p-6">
                <h2 className="text-lg font-bold text-[#8f3524]">无法开始本次体检</h2>
                <p className="mt-2 text-sm leading-6 text-[#6f453d]">{session.error}</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => startAnalysis(draft)}
                    className="h-10 rounded-lg bg-[#17202f] px-5 text-sm font-bold text-white hover:bg-[#2a3444]"
                  >
                    重新开始体检
                  </button>
                  <button
                    type="button"
                    onClick={backToEditor}
                    className="h-10 rounded-lg border border-[#d8a99f] bg-white px-5 text-sm font-semibold text-[#8f3524]"
                  >
                    返回编辑
                  </button>
                </div>
              </div>
            ) : null}

            <div hidden={session.status === "error"}>
              {session.status === "loading" ? (
                <div className="mb-5 flex items-center gap-3 border-l-2 border-[#93c4bd] bg-[#f3f7f6] px-4 py-3 text-sm text-[#465266]">
                  <span aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[#b9d9d4] border-t-[#0e766e] motion-reduce:animate-none" />
                  <span>正在准备文章体检，请稍候。</span>
                </div>
              ) : null}

              {renderScoreDashboard()}

              <section className="mt-7">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="label">Question Diagnostics</p>
                  <h2 className="mt-1 text-xl font-bold">AI 读者问题诊断</h2>
                </div>
                {questionOrder.length ? (
                  <span className="text-sm text-[#687386]">已完成 {completedCount} / {questionOrder.length}</span>
                ) : null}
              </div>
              {renderDiagnostics()}

              {questions.status === "success" ? (
                <form onSubmit={submitFollowUp} className="mt-4 border border-[#dfe4e8] bg-white p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label htmlFor="follow-up-question" className="text-sm font-bold">测试读者真实提问</label>
                    <span className="text-xs text-[#687386]">{questionOrder.length} / 10</span>
                  </div>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                    <input
                      id="follow-up-question"
                      value={followUpQuestion}
                      onChange={(event) => {
                        setFollowUpQuestion(event.target.value);
                        setFollowUpError("");
                      }}
                      maxLength={200}
                      disabled={!paragraphs.length || questionOrder.length >= 10}
                      placeholder="例如：文章解释清楚为什么选择 A 而不是 B 吗？"
                      className="h-11 min-w-0 flex-1 rounded-lg border border-[#d9dee5] bg-white px-3 text-sm disabled:cursor-not-allowed disabled:bg-[#f3f5f7]"
                    />
                    <button
                      type="submit"
                      disabled={!paragraphs.length || questionOrder.length >= 10 || !followUpQuestion.trim()}
                      className="h-11 rounded-lg bg-[#17202f] px-5 text-sm font-bold text-white hover:bg-[#2a3444] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      分析这个问题
                    </button>
                  </div>
                  {followUpError ? <p role="alert" className="mt-2 text-sm text-[#a43e2b]">{followUpError}</p> : null}
                  {customQuestions.length ? (
                    <p className="mt-3 text-xs text-[#687386]">
                      追问覆盖率：{answeredCustomQuestions} / {customQuestions.length} 可完全回答
                    </p>
                  ) : null}
                </form>
              ) : null}
              </section>

              <PatchWorkshop title={draft.title} paragraphs={paragraphs} />

              {scoring.status === "success" && scoring.data.numbered_paragraphs.length ? (
                <section className="mt-7">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-bold">原文证据锚点</h2>
                  <span className="text-xs text-[#687386]">共 {scoring.data.numbered_paragraphs.length} 段</span>
                </div>
                <div className="grid gap-3">
                  {scoring.data.numbered_paragraphs.map((paragraph) => (
                    <article key={paragraph.id} className="card grid gap-3 p-4 sm:grid-cols-[80px_1fr]">
                      <span className="text-xs font-bold text-[#0e766e]">{paragraph.id}</span>
                      <p className="text-sm leading-7 text-[#465266]">{paragraph.text}</p>
                    </article>
                  ))}
                </div>
                </section>
              ) : restoredFromCache ? (
                <p className="mt-7 border-l-2 border-[#d8e4e1] pl-4 text-sm text-[#687386]">缓存报告不保留原文段落。重新运行体检可查看完整证据锚点。</p>
              ) : null}
            </div>
          </section>
        ) : (
          <section>
            <div className="mb-6">
              <p className="label">AI Search Readiness</p>
              <h1 className="mt-2 text-3xl font-bold">新建内容体检</h1>
              <p className="mt-2 text-sm text-[#687386]">公众号 / 博客中文长文</p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(300px,.7fr)]">
              <form onSubmit={submit} className="card p-5 sm:p-6">
                <div className="grid gap-5 sm:grid-cols-[1fr_180px]">
                  <label className="grid gap-2 text-sm font-semibold">
                    <span>文章标题</span>
                    <input
                      ref={titleRef}
                      value={draft.title}
                      onChange={(event) => updateDraft("title", event.target.value)}
                      maxLength={120}
                      aria-invalid={Boolean(fieldErrors.title)}
                      aria-describedby={fieldErrors.title ? "title-error" : undefined}
                      className={`h-11 rounded-lg border bg-white px-3 font-normal ${fieldErrors.title ? "border-[#d85f47]" : "border-[#d9dee5]"}`}
                      placeholder="输入文章标题"
                    />
                    {fieldErrors.title ? <span id="title-error" className="text-xs font-normal text-[#a43e2b]">{fieldErrors.title}</span> : null}
                  </label>
                  <div className="grid content-start gap-2 text-sm font-semibold">
                    <span>发布日期</span>
                    <DatePicker value={draft.publishedAt} onChange={(value) => updateDraft("publishedAt", value)} />
                  </div>
                </div>

                <label className="mt-5 grid gap-2 text-sm font-semibold">
                  <span className="flex items-center justify-between">
                    正文
                    <span className={remaining < 0 ? "text-[#d85f47]" : "font-normal text-[#687386]"}>{draft.content.length.toLocaleString()} / 12,000</span>
                  </span>
                  <textarea
                    ref={contentRef}
                    value={draft.content}
                    onChange={(event) => updateDraft("content", event.target.value)}
                    aria-invalid={Boolean(fieldErrors.content)}
                    aria-describedby={fieldErrors.content ? "content-error" : undefined}
                    className={`min-h-[380px] resize-y rounded-lg border bg-white p-4 font-normal leading-7 ${fieldErrors.content ? "border-[#d85f47]" : "border-[#d9dee5]"}`}
                    placeholder="粘贴文章正文"
                  />
                  {fieldErrors.content ? <span id="content-error" className="text-xs font-normal text-[#a43e2b]">{fieldErrors.content}</span> : null}
                </label>

                {error ? <p role="alert" className="mt-4 rounded-lg bg-[#fff0ed] px-4 py-3 text-sm text-[#a43e2b]">{error}</p> : null}

                <div className="mt-5 flex items-center justify-between gap-4 border-t border-[#e5e8ed] pt-5">
                  <span className="text-xs text-[#687386]">每日最多 10 次</span>
                  <button type="submit" className="h-11 rounded-lg bg-[#0e766e] px-6 text-sm font-bold text-white hover:bg-[#0a625c]">
                    立即体检
                  </button>
                </div>
              </form>

              <aside>
                <h2 className="text-sm font-bold">演示样本</h2>
                <div className="mt-3 grid gap-3">
                  {SAMPLES.map((sample, index) => (
                    <button key={sample.label} type="button" onClick={() => loadSample(sample)} className="card group p-4 text-left hover:border-[#93c4bd]">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#0e766e]">0{index + 1}</span>
                        <span className="text-xs text-[#687386]">使用样本</span>
                      </div>
                      <div className="mt-3 font-bold">{sample.label}</div>
                      <div className="mt-1 text-sm text-[#687386]">{sample.note}</div>
                    </button>
                  ))}
                </div>
                <div className="mt-5 border-l-2 border-[#d8e4e1] pl-4 text-xs leading-6 text-[#687386]">仅评估内容准备度，不保证 AI 搜索收录、排名或实际引用。</div>
              </aside>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
