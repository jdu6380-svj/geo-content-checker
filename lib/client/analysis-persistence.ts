import {
  ANALYSIS_CONTRACT_VERSION,
  ANALYSIS_VERSION,
  REPORT_SCHEMA_VERSION,
} from "../constants/analysis-contract.ts";

export type PersistedAnalysisStatus = "running" | "success" | "failed";

export type PersistedArticleDraft = {
  title: string;
  content: string;
  publishedAt: string;
};

export type PersistedAnalysisState = {
  analysisHash: string;
  status: PersistedAnalysisStatus;
};

export type DraftSessionEnvelope = {
  analysisVersion: typeof ANALYSIS_VERSION;
  analysisContractVersion: typeof ANALYSIS_CONTRACT_VERSION;
  reportSchemaVersion: typeof REPORT_SCHEMA_VERSION;
  savedAt: string;
  draft: PersistedArticleDraft;
  analysis?: PersistedAnalysisState;
};

export const DRAFT_CONTENT_MAX_BYTES = 64 * 1024;
export const DRAFT_PAYLOAD_MAX_BYTES = 128 * 1024;

const DRAFT_STORAGE_KEY = "geo:article-draft:v1";
const encoder = new TextEncoder();

function byteLength(value: string): number {
  return encoder.encode(value).byteLength;
}

export function normalizeAnalysisInput(draft: PersistedArticleDraft) {
  return {
    analysisVersion: ANALYSIS_VERSION,
    analysisContractVersion: ANALYSIS_CONTRACT_VERSION,
    title: draft.title.trim(),
    content: draft.content.trim().replace(/\r\n?/g, "\n"),
    publishedAt: draft.publishedAt.trim() || null,
  };
}

export async function createAnalysisHash(draft: PersistedArticleDraft): Promise<string> {
  const bytes = encoder.encode(JSON.stringify(normalizeAnalysisInput(draft)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export function serializeDraftSession(envelope: DraftSessionEnvelope): string | null {
  if (byteLength(envelope.draft.content) > DRAFT_CONTENT_MAX_BYTES) return null;
  const serialized = JSON.stringify(envelope);
  return byteLength(serialized) <= DRAFT_PAYLOAD_MAX_BYTES ? serialized : null;
}

function isDraft(value: unknown): value is PersistedArticleDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<PersistedArticleDraft>;
  return (
    typeof draft.title === "string" &&
    typeof draft.content === "string" &&
    typeof draft.publishedAt === "string"
  );
}

function isAnalysisState(value: unknown): value is PersistedAnalysisState {
  if (!value || typeof value !== "object") return false;
  const analysis = value as Partial<PersistedAnalysisState>;
  return (
    typeof analysis.analysisHash === "string" &&
    /^[0-9a-f]{64}$/.test(analysis.analysisHash) &&
    (analysis.status === "running" || analysis.status === "success" || analysis.status === "failed")
  );
}

export function parseDraftSession(raw: string): DraftSessionEnvelope | null {
  try {
    const value = JSON.parse(raw) as Partial<DraftSessionEnvelope>;
    if (
      value.analysisVersion !== ANALYSIS_VERSION ||
      value.analysisContractVersion !== ANALYSIS_CONTRACT_VERSION ||
      value.reportSchemaVersion !== REPORT_SCHEMA_VERSION ||
      typeof value.savedAt !== "string" ||
      !isDraft(value.draft) ||
      (value.analysis !== undefined && !isAnalysisState(value.analysis))
    ) {
      return null;
    }

    const envelope = value as DraftSessionEnvelope;
    return serializeDraftSession(envelope) ? envelope : null;
  } catch {
    return null;
  }
}

function readStoredEnvelope(): DraftSessionEnvelope | null {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const envelope = parseDraftSession(raw);
    if (!envelope) window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
    return envelope;
  } catch {
    return null;
  }
}

function writeEnvelope(envelope: DraftSessionEnvelope): boolean {
  const serialized = serializeDraftSession(envelope);
  if (!serialized) return false;

  try {
    window.sessionStorage.setItem(DRAFT_STORAGE_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}

export function readDraftSession(): DraftSessionEnvelope | null {
  return readStoredEnvelope();
}

export function saveDraftSession(draft: PersistedArticleDraft): boolean {
  const existing = readStoredEnvelope();
  return writeEnvelope({
    analysisVersion: ANALYSIS_VERSION,
    analysisContractVersion: ANALYSIS_CONTRACT_VERSION,
    reportSchemaVersion: REPORT_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    draft,
    ...(existing?.analysis ? { analysis: existing.analysis } : {}),
  });
}

export function markDraftAnalysis(
  draft: PersistedArticleDraft,
  analysisHash: string,
  status: PersistedAnalysisStatus,
): boolean {
  return writeEnvelope({
    analysisVersion: ANALYSIS_VERSION,
    analysisContractVersion: ANALYSIS_CONTRACT_VERSION,
    reportSchemaVersion: REPORT_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    draft,
    analysis: { analysisHash, status },
  });
}
