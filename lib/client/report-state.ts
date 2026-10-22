import type { DiagnosticResult, EvaluateScoringResponse } from "../schemas/geo.ts";
import type { PredictQuestionsResponse } from "../schemas/geo.ts";
import {
  ANALYSIS_CONTRACT_VERSION,
  ANALYSIS_VERSION,
  REPORT_SCHEMA_VERSION,
} from "../constants/analysis-contract.ts";

export type DiagnosticStatus = "queued" | "loading" | "success" | "error";

export interface DiagnosticItem {
  question: string;
  status: DiagnosticStatus;
  errorCount: number;
  data?: DiagnosticResult;
  error?: string;
}

export type DiagnosticsState = Record<string, DiagnosticItem>;

export type DiagnosticCompletion = {
  diagnosticsSettled: boolean;
  diagnosticsSucceeded: boolean;
};

export function deriveDiagnosticCompletion(
  questionOrder: readonly string[],
  diagnostics: DiagnosticsState,
): DiagnosticCompletion {
  const hasQuestions = questionOrder.length > 0;
  const diagnosticsSettled = hasQuestions && questionOrder.every((question) => {
    const status = diagnostics[question]?.status;
    return status === "success" || status === "error";
  });
  const diagnosticsSucceeded = diagnosticsSettled && questionOrder.every(
    (question) => diagnostics[question]?.status === "success",
  );

  return { diagnosticsSettled, diagnosticsSucceeded };
}

export type LoadState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: string };

export type CachedReport = {
  title: string;
  content?: string;
  publishedAt: string;
  scoring: EvaluateScoringResponse;
  questionSource: PredictQuestionsResponse["source"];
  questionOrder: string[];
  diagnostics: DiagnosticsState;
};

const CACHE_KEY = "geo:last-report";
const HISTORY_KEY = "geo:report-history:v1";
const MAX_HISTORY_ITEMS = 10;
const MAX_CACHE_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_CACHE_BYTES = 500 * 1024;

export type CacheEnvelope = {
  analysisVersion: typeof ANALYSIS_VERSION;
  analysisContractVersion: typeof ANALYSIS_CONTRACT_VERSION;
  reportSchemaVersion: typeof REPORT_SCHEMA_VERSION;
  analysisHash: string;
  status: "success";
  savedAt: string;
  report: CachedReport;
};

function isCacheEnvelope(value: unknown): value is CacheEnvelope {
  if (!value || typeof value !== "object") return false;
  const envelope = value as Partial<CacheEnvelope>;
  return (
    envelope.analysisVersion === ANALYSIS_VERSION &&
    envelope.analysisContractVersion === ANALYSIS_CONTRACT_VERSION &&
    envelope.reportSchemaVersion === REPORT_SCHEMA_VERSION &&
    envelope.status === "success" &&
    typeof envelope.analysisHash === "string" &&
    /^[0-9a-f]{64}$/.test(envelope.analysisHash) &&
    typeof envelope.savedAt === "string" &&
    Boolean(envelope.report) &&
    typeof envelope.report?.title === "string" &&
    (envelope.report.content === undefined || (typeof envelope.report.content === "string" && envelope.report.content.length <= 12_000)) &&
    (envelope.report?.questionSource === "model" || envelope.report?.questionSource === "fallback") &&
    Array.isArray(envelope.report?.questionOrder) &&
    hasCompatibleScoring(envelope.report?.scoring) &&
    hasCompatibleDiagnostics(envelope.report?.diagnostics) &&
    hasCacheableDiagnostics(envelope.report.questionOrder, envelope.report.diagnostics)
  );
}

function hasCompatibleScoring(value: unknown): value is EvaluateScoringResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const scoring = value as Partial<EvaluateScoringResponse>;
  return Array.isArray(scoring.numbered_paragraphs) &&
    scoring.numbered_paragraphs.every((paragraph) =>
      Boolean(paragraph) &&
      typeof paragraph === "object" &&
      typeof paragraph.id === "string" &&
      /^Para-\d+$/.test(paragraph.id) &&
      typeof paragraph.text === "string" &&
      paragraph.text.length > 0,
    );
}

function hasCompatibleDiagnostics(value: unknown): value is DiagnosticsState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  return Object.values(value).every((item) => {
    if (!item || typeof item !== "object") return false;
    const diagnostic = item as Partial<DiagnosticItem>;
    if (typeof diagnostic.question !== "string" ||
      !["queued", "loading", "success", "error"].includes(diagnostic.status ?? "") ||
      typeof diagnostic.errorCount !== "number" ||
      !Number.isInteger(diagnostic.errorCount) ||
      diagnostic.errorCount < 0) return false;
    if (diagnostic.data === undefined) return true;

    const data = diagnostic.data as Partial<DiagnosticResult>;
    return typeof data.question === "string" &&
      ["可以完全回答", "信息不足", "有风险"].includes(data.answerability ?? "") &&
      ["low", "medium", "high"].includes(data.riskLevel ?? "") &&
      ["model", "fallback"].includes(data.source ?? "") &&
      ["valid", "missing", "invalid"].includes(data.evidenceStatus ?? "") &&
      Array.isArray(data.evidence) &&
      data.evidence.every((entry) =>
        Boolean(entry) &&
        typeof entry === "object" &&
        typeof entry.paragraphId === "string" &&
        /^Para-\d+$/.test(entry.paragraphId) &&
        typeof entry.quote === "string" &&
        entry.quote.trim().length > 0,
      ) &&
      Array.isArray(data.missingInfo) &&
      data.missingInfo.every((info) => typeof info === "string") &&
      typeof data.recommendation === "string";
  });
}

function hasCacheableDiagnostics(
  questionOrder: readonly string[],
  diagnostics: DiagnosticsState,
): boolean {
  const { diagnosticsSucceeded } = deriveDiagnosticCompletion(questionOrder, diagnostics);
  return diagnosticsSucceeded &&
    Object.values(diagnostics).every((item) => item.status === "success" && Boolean(item.data)) &&
    questionOrder.every((question) => Boolean(diagnostics[question]?.data));
}

function clearCache(): void {
  try {
    window.localStorage.removeItem(CACHE_KEY);
  } catch {
    // Storage may be unavailable in privacy-restricted browser contexts.
  }
}

export function readCachedReport(): CacheEnvelope | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!isCacheEnvelope(parsed)) {
      clearCache();
      return null;
    }

    const savedAt = Date.parse(parsed.savedAt);
    if (!Number.isFinite(savedAt) || Date.now() - savedAt > MAX_CACHE_AGE_MS) {
      clearCache();
      return null;
    }

    return parsed;
  } catch {
    clearCache();
    return null;
  }
}

export function readReportHistory(): CacheEnvelope[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) {
      const latest = readCachedReport();
      return latest ? [latest] : [];
    }

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const history = parsed
      .filter(isCacheEnvelope)
      .filter((item) => {
        const savedAt = Date.parse(item.savedAt);
        return Number.isFinite(savedAt) && Date.now() - savedAt <= MAX_CACHE_AGE_MS;
      })
      .sort((left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt))
      .slice(0, MAX_HISTORY_ITEMS);

    if (history.length !== parsed.length) {
      try {
        window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      } catch {
        // Expiration cleanup must not make readable history unavailable.
      }
    }
    return history;
  } catch {
    return [];
  }
}

function stripCachedEvidence(diagnostics: DiagnosticsState): DiagnosticsState {
  return Object.fromEntries(
    Object.entries(diagnostics).map(([question, item]) => [
      question,
      item.data
        ? {
            ...item,
            data: {
              ...item.data,
              evidence: [],
            },
          }
        : item,
    ]),
  );
}

function summarizeDiagnostics(diagnostics: DiagnosticsState): DiagnosticsState {
  return Object.fromEntries(
    Object.entries(diagnostics).map(([question, item]) => [
      question,
      item.data
        ? {
            ...item,
            data: {
              ...item.data,
              evidence: [],
              missingInfo: [],
              recommendation: "详细证据未缓存，请重新运行体检。",
            },
          }
        : item,
    ]),
  );
}

export function saveCachedReport(report: CachedReport, analysisHash: string): void {
  if (!hasCacheableDiagnostics(report.questionOrder, report.diagnostics)) return;

  const cacheSafeReport: CachedReport = {
    ...report,
    scoring: { ...report.scoring, numbered_paragraphs: [] },
    diagnostics: stripCachedEvidence(report.diagnostics),
  };
  let envelope: CacheEnvelope = {
    analysisVersion: ANALYSIS_VERSION,
    analysisContractVersion: ANALYSIS_CONTRACT_VERSION,
    reportSchemaVersion: REPORT_SCHEMA_VERSION,
    analysisHash,
    status: "success",
    savedAt: new Date().toISOString(),
    report: cacheSafeReport,
  };
  let serialized = JSON.stringify(envelope);

  if (new Blob([serialized]).size > MAX_CACHE_BYTES) {
    envelope = {
      ...envelope,
      report: {
        ...cacheSafeReport,
        diagnostics: summarizeDiagnostics(cacheSafeReport.diagnostics),
      },
    };
    serialized = JSON.stringify(envelope);
  }

  try {
    window.localStorage.setItem(CACHE_KEY, serialized);
    const history = [
      envelope,
      ...readReportHistory().filter((item) => item.analysisHash !== envelope.analysisHash),
    ].slice(0, MAX_HISTORY_ITEMS);
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    clearCache();
  }
}

export type ConcurrencyLimiter = {
  schedule<T>(task: () => Promise<T>): Promise<T>;
};

export function createConcurrencyLimiter(concurrency: number): ConcurrencyLimiter {
  const limit = Math.max(1, Math.floor(concurrency));
  const queue: Array<() => void> = [];
  let activeCount = 0;

  function acquire(): Promise<void> {
    if (activeCount < limit) {
      activeCount += 1;
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      queue.push(() => {
        activeCount += 1;
        resolve();
      });
    });
  }

  function release(): void {
    activeCount -= 1;
    queue.shift()?.();
  }

  return {
    async schedule<T>(task: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await task();
      } finally {
        release();
      }
    },
  };
}
