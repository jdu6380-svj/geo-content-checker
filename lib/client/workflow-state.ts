import type { Paragraph, GeneratePatchesResponse } from "../schemas/geo.ts";
import type { PatchChecklistItem } from "./patch-checklist.ts";
import type { ReportComparisonSnapshot } from "./report-comparison.ts";
import type { CacheEnvelope, CachedReport } from "./report-state.ts";
import { createNumberedParagraphs } from "../geo/paragraphs.ts";
import { createAnalysisHash, type PersistedArticleDraft } from "./analysis-persistence.ts";
import { ANALYSIS_CONTRACT_VERSION, ANALYSIS_VERSION, REPORT_SCHEMA_VERSION } from "../constants/analysis-contract.ts";

export const WORKFLOW_STATE_VERSION = 1 as const;
export const WORKFLOW_STORAGE_KEY = "geo:workflow-state:v1";
export type WorkflowWorkspaceStage = "review" | "report" | "advice" | "recheck";
export type WorkflowReportView = "overview" | "evidence" | "diagnosis" | "patch" | "recheck";
export type PersistedPatchState = { mode: "advice" | "content_draft"; sourceReportHash: string; data: GeneratePatchesResponse };
export type WorkflowPatchStates = Record<PersistedPatchState["mode"], PersistedPatchState | null>;
export type WorkflowPatchInputs = Record<PersistedPatchState["mode"], { mode: PersistedPatchState["mode"]; data: GeneratePatchesResponse } | null>;
export type WorkflowState = {
  workflowVersion: typeof WORKFLOW_STATE_VERSION;
  analysisVersion: typeof ANALYSIS_VERSION;
  analysisContractVersion: typeof ANALYSIS_CONTRACT_VERSION;
  reportSchemaVersion: typeof REPORT_SCHEMA_VERSION;
  savedAt: string;
  reportId: string;
  reportHash: string;
  draftHash: string;
  patchSourceHash?: string;
  analyzedDraft: PersistedArticleDraft;
  draft: PersistedArticleDraft;
  report: CachedReport;
  paragraphs: Paragraph[];
  patchStates: PersistedPatchState[];
  patchChecklist: PatchChecklistItem[];
  recheckBaseline: ReportComparisonSnapshot | null;
  workspaceStage: WorkflowWorkspaceStage;
  reportView: WorkflowReportView;
};
export type WorkflowStorageResult = { ok: true } | { ok: false; reason: "unavailable" | "serialization" | "quota" | "stale" };
export type WorkflowSaveOptions = { isCurrent?: () => boolean };
let latestSaveSequence = 0;
export type WorkflowPersistenceContext = {
  storageReady: boolean; analysisStarted: boolean; reportHash: string | null;
  scoringSucceeded: boolean; questionsSucceeded: boolean; diagnosticsSucceeded: boolean;
  paragraphsCount: number; restoredFromCache: boolean; completeWorkflowRestored: boolean; persistenceBlocked: boolean;
};
export function canPersistWorkflow(context: WorkflowPersistenceContext): boolean {
  return context.storageReady && context.analysisStarted && Boolean(context.reportHash) && context.scoringSucceeded &&
    context.questionsSucceeded && context.diagnosticsSucceeded && context.paragraphsCount > 0 &&
    (!context.restoredFromCache || context.completeWorkflowRestored) && !context.persistenceBlocked;
}
function isHash(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{64}$/.test(value); }
function isDraft(value: unknown): value is PersistedArticleDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<PersistedArticleDraft>;
  return typeof draft.title === "string" && typeof draft.content === "string" && typeof draft.publishedAt === "string";
}
function isScoring(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const scoring = value as Partial<import("../schemas/geo.ts").EvaluateScoringResponse>;
  return typeof scoring.totalScore === "number" && (scoring.source === "model" || scoring.source === "fallback") && Boolean(scoring.dimensions && scoring.numbered_paragraphs);
}
function isDiagnostic(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const diagnostic = value as Partial<import("../schemas/geo.ts").DiagnosticResult>;
  return typeof diagnostic.question === "string" &&
    (diagnostic.answerability === "可以完全回答" || diagnostic.answerability === "信息不足" || diagnostic.answerability === "有风险") &&
    (diagnostic.riskLevel === "low" || diagnostic.riskLevel === "medium" || diagnostic.riskLevel === "high") &&
    (diagnostic.evidenceStatus === "valid" || diagnostic.evidenceStatus === "missing" || diagnostic.evidenceStatus === "invalid") && Array.isArray(diagnostic.evidence);
}
function isReport(value: unknown): value is CachedReport {
  if (!value || typeof value !== "object") return false;
  const report = value as Partial<CachedReport>;
  if (typeof report.title !== "string" || typeof report.publishedAt !== "string" ||
    (report.questionSource !== "model" && report.questionSource !== "fallback") || !Array.isArray(report.questionOrder) ||
    !report.questionOrder.every((question) => typeof question === "string") || !isScoring(report.scoring) ||
    !report.diagnostics || typeof report.diagnostics !== "object" || Array.isArray(report.diagnostics)) return false;
  return Object.entries(report.diagnostics).every(([question, item]) => item && item.question === question && item.status === "success" && item.data !== undefined && isDiagnostic(item.data));
}
function isPatchResponse(value: unknown): value is GeneratePatchesResponse {
  if (!value || typeof value !== "object") return false;
  const patch = value as Partial<GeneratePatchesResponse>;
  return (patch.mode === "advice" || patch.mode === "content_draft") && (patch.source === "model" || patch.source === "fallback") && typeof patch.markdown === "string" && Array.isArray(patch.actions);
}
function isChecklistItem(value: unknown): value is PatchChecklistItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PatchChecklistItem>;
  return typeof item.id === "string" && (item.sourceReportHash === undefined || isHash(item.sourceReportHash)) && typeof item.title === "string" && typeof item.recommendation === "string" && typeof item.location === "string" && (item.paragraphIds === undefined || (Array.isArray(item.paragraphIds) && item.paragraphIds.every((id) => typeof id === "string"))) && (item.decision === undefined || item.decision === "pending" || item.decision === "applied" || item.decision === "skipped") && (item.status === "high" || item.status === "attention" || item.status === "passed");
}
function isComparisonSnapshot(value: unknown): value is ReportComparisonSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<ReportComparisonSnapshot>;
  return (snapshot.draftHash === undefined || isHash(snapshot.draftHash)) && typeof snapshot.totalScore === "number" && Boolean(snapshot.dimensions) && Array.isArray(snapshot.diagnostics) && snapshot.diagnostics.every((item) => typeof item.question === "string" && (item.answerability === "可以完全回答" || item.answerability === "信息不足" || item.answerability === "有风险") && (item.riskLevel === "low" || item.riskLevel === "medium" || item.riskLevel === "high") && (item.evidenceStatus === "valid" || item.evidenceStatus === "missing" || item.evidenceStatus === "invalid"));
}
function isWorkflowState(value: unknown): value is WorkflowState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<WorkflowState>;
  return state.workflowVersion === WORKFLOW_STATE_VERSION && state.analysisVersion === ANALYSIS_VERSION && state.analysisContractVersion === ANALYSIS_CONTRACT_VERSION && state.reportSchemaVersion === REPORT_SCHEMA_VERSION && typeof state.savedAt === "string" && state.reportId === `report:${state.reportHash}` && isHash(state.reportHash) && isHash(state.draftHash) && isDraft(state.analyzedDraft) && isDraft(state.draft) && isReport(state.report) && Array.isArray(state.paragraphs) && Array.isArray(state.patchStates) && state.patchStates.every((patch) => patch && (patch.mode === "advice" || patch.mode === "content_draft") && (patch.sourceReportHash === undefined || isHash(patch.sourceReportHash)) && isPatchResponse(patch.data)) && Array.isArray(state.patchChecklist) && state.patchChecklist.every(isChecklistItem) && (state.patchSourceHash === undefined || isHash(state.patchSourceHash)) && (state.recheckBaseline === null || isComparisonSnapshot(state.recheckBaseline)) && (state.workspaceStage === "review" || state.workspaceStage === "report" || state.workspaceStage === "advice" || state.workspaceStage === "recheck") && (state.reportView === "overview" || state.reportView === "evidence" || state.reportView === "diagnosis" || state.reportView === "patch" || state.reportView === "recheck");
}
export async function serializeWorkflowState(state: WorkflowState): Promise<string | null> {
  const reportHash = await createAnalysisHash(state.analyzedDraft);
  const draftHash = await createAnalysisHash(state.draft);
  if (reportHash !== state.reportHash || draftHash !== state.draftHash || state.patchSourceHash !== state.reportHash) return null;
  if (state.patchStates.some((patch) => patch.sourceReportHash !== state.reportHash) || state.patchChecklist.some((item) => item.sourceReportHash !== state.reportHash)) return null;
  const rebuiltParagraphs = createNumberedParagraphs(state.analyzedDraft.content);
  if (state.paragraphs.length === 0 || JSON.stringify(state.paragraphs) !== JSON.stringify(rebuiltParagraphs)) return null;
  const serialized = JSON.stringify(state);
  return new TextEncoder().encode(serialized).byteLength <= 750 * 1024 ? serialized : null;
}
export async function parseWorkflowState(raw: string): Promise<WorkflowState | null> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isWorkflowState(parsed) || Date.now() - Date.parse(parsed.savedAt) > 30 * 24 * 60 * 60 * 1000) return null;
    if (await createAnalysisHash(parsed.analyzedDraft) !== parsed.reportHash || await createAnalysisHash(parsed.draft) !== parsed.draftHash) return null;
    const rebuiltParagraphs = createNumberedParagraphs(parsed.analyzedDraft.content);
    if (JSON.stringify(parsed.paragraphs) !== JSON.stringify(rebuiltParagraphs) || parsed.report.title !== parsed.analyzedDraft.title || parsed.report.publishedAt !== parsed.analyzedDraft.publishedAt) return null;
    if (parsed.report.questionOrder.some((question) => !parsed.report.diagnostics[question]?.data)) return null;
    const paragraphIds = new Set(rebuiltParagraphs.map((paragraph) => paragraph.id));
    for (const item of Object.values(parsed.report.diagnostics)) if (item.data?.evidence.some((evidence) => !paragraphIds.has(evidence.paragraphId))) return null;
    const patchSourceHash = parsed.patchSourceHash === parsed.reportHash ? parsed.reportHash : null;
    return { ...parsed, patchSourceHash: parsed.reportHash, patchStates: patchSourceHash ? parsed.patchStates.filter((patch) => patch.sourceReportHash === parsed.reportHash) : [], patchChecklist: patchSourceHash ? parsed.patchChecklist.filter((item) => item.sourceReportHash === parsed.reportHash) : [] };
  } catch { return null; }
}
export async function readWorkflowState(): Promise<{ state: WorkflowState | null; storageAvailable: boolean; invalid: boolean }> {
  try { const raw = window.localStorage.getItem(WORKFLOW_STORAGE_KEY); if (!raw) return { state: null, storageAvailable: true, invalid: false }; const state = await parseWorkflowState(raw); return { state, storageAvailable: true, invalid: state === null }; } catch { return { state: null, storageAvailable: false, invalid: false }; }
}
export async function saveWorkflowState(state: WorkflowState, options: WorkflowSaveOptions = {}): Promise<WorkflowStorageResult> {
  const saveSequence = ++latestSaveSequence;
  const serialized = await serializeWorkflowState(state);
  if (!serialized) return { ok: false, reason: "serialization" };
  if (saveSequence !== latestSaveSequence || (options.isCurrent && !options.isCurrent())) return { ok: false, reason: "stale" };
  try { window.localStorage.setItem(WORKFLOW_STORAGE_KEY, serialized); return { ok: true }; } catch (error) { return { ok: false, reason: error instanceof DOMException && error.name === "QuotaExceededError" ? "quota" : "unavailable" }; }
}
export function clearWorkflowState(): boolean { latestSaveSequence += 1; try { window.localStorage.removeItem(WORKFLOW_STORAGE_KEY); return true; } catch { return false; } }
export function paragraphsForWorkflow(state: WorkflowState): Paragraph[] { const rebuilt = createNumberedParagraphs(state.analyzedDraft.content); return rebuilt.length === state.paragraphs.length ? rebuilt : []; }
export function hasPendingDraftChange(workflowDraftHash: string, storedDraftHash: string | null): boolean {
  return Boolean(storedDraftHash && storedDraftHash !== workflowDraftHash);
}
export function patchStatesForWorkflow(states: WorkflowPatchInputs, sourceReportHash: string): PersistedPatchState[] { return Object.values(states).filter((state): state is PersistedPatchState => state !== null).map((state) => ({ mode: state.mode, sourceReportHash, data: state.data })); }
export function canUseAuthenticatedWorkflow(runId: string | null): boolean { return typeof runId === "string" && runId.length > 0; }
export function workflowReportEnvelope(state: WorkflowState): CacheEnvelope { return { analysisVersion: state.analysisVersion, analysisContractVersion: state.analysisContractVersion, reportSchemaVersion: state.reportSchemaVersion, analysisHash: state.reportHash, status: "success", savedAt: state.savedAt, report: state.report }; }
