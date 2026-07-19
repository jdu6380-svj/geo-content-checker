import type { DiagnosticResult, EvaluateScoringResponse } from "@/lib/schemas/geo";
import type { PredictQuestionsResponse } from "@/lib/schemas/geo";
import {
  ANALYSIS_CONTRACT_VERSION,
  ANALYSIS_VERSION,
  REPORT_SCHEMA_VERSION,
} from "@/lib/constants/analysis-contract";

export type DiagnosticStatus = "queued" | "loading" | "success" | "error";

export interface DiagnosticItem {
  question: string;
  status: DiagnosticStatus;
  errorCount: number;
  data?: DiagnosticResult;
  error?: string;
}

export type DiagnosticsState = Record<string, DiagnosticItem>;

export type LoadState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: string };

export type CachedReport = {
  title: string;
  publishedAt: string;
  scoring: EvaluateScoringResponse;
  questionSource: PredictQuestionsResponse["source"];
  questionOrder: string[];
  diagnostics: DiagnosticsState;
};

const CACHE_KEY = "geo:last-report";
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
    (envelope.report?.questionSource === "model" || envelope.report?.questionSource === "fallback") &&
    Array.isArray(envelope.report?.questionOrder) &&
    Boolean(envelope.report?.scoring) &&
    Boolean(envelope.report?.diagnostics)
  );
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
  const cacheSafeReport: CachedReport = {
    ...report,
    scoring: { ...report.scoring, numbered_paragraphs: [] },
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
