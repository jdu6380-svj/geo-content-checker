import assert from "node:assert/strict";
import { createNumberedParagraphs } from "../lib/geo/paragraphs.ts";
import { createAnalysisHash } from "../lib/client/analysis-persistence.ts";
import {
  parseWorkflowState,
  paragraphsForWorkflow,
  canUseAuthenticatedWorkflow,
  canPersistWorkflow,
  hasPendingDraftChange,
  readWorkflowState,
  saveWorkflowState,
  serializeWorkflowState,
  type WorkflowState,
} from "../lib/client/workflow-state.ts";
import { ANALYSIS_CONTRACT_VERSION, ANALYSIS_VERSION, REPORT_SCHEMA_VERSION } from "../lib/constants/analysis-contract.ts";
import { createPatchSourceSignature, filterPatchChecklistForSource, shouldAdoptExternalPatchState } from "../lib/client/patch-state.ts";
import { resolveRecheckStatus, resolveWorkflowRecovery } from "../lib/client/workflow-recovery.ts";

const draft = { title: "测试文章", content: "第一段事实。\n\n第二段边界。", publishedAt: "" };
const reportHash = await createAnalysisHash(draft);
const state: WorkflowState = {
  workflowVersion: 1,
  analysisVersion: ANALYSIS_VERSION,
  analysisContractVersion: ANALYSIS_CONTRACT_VERSION,
  reportSchemaVersion: REPORT_SCHEMA_VERSION,
  savedAt: new Date().toISOString(),
  reportId: `report:${reportHash}`,
  reportHash,
  draftHash: reportHash,
  patchSourceHash: reportHash,
  analyzedDraft: draft,
  draft,
  report: {
    title: draft.title,
    publishedAt: draft.publishedAt,
    scoring: {
      totalScore: 50,
      dimensions: {
        questionCoverage: { score: 15, max: 35, reason: "覆盖部分问题" },
        factCompleteness: { score: 15, max: 30, reason: "事实仍需补充" },
        structureClarity: { score: 10, max: 20, reason: "结构清楚" },
        freshness: { score: 10, max: 15, reason: "时间信息有限" },
      },
      numbered_paragraphs: createNumberedParagraphs(draft.content),
      source: "model",
    },
    questionSource: "model",
    questionOrder: [],
    diagnostics: {},
  },
  paragraphs: createNumberedParagraphs(draft.content),
  patchStates: [],
  patchChecklist: [],
  recheckBaseline: null,
  workspaceStage: "report",
  reportView: "overview",
};

const serialized = await serializeWorkflowState(state);
assert.ok(serialized);
assert.deepEqual((await parseWorkflowState(serialized))?.patchChecklist, []);
assert.equal(paragraphsForWorkflow(state).length, 2);
assert.equal(await parseWorkflowState(serialized.replace('"workflowVersion":1', '"workflowVersion":99')), null);
assert.equal(await parseWorkflowState(`${serialized}broken`), null);
assert.equal(await parseWorkflowState(serialized.replace(state.reportHash, "0".repeat(64))), null);
assert.equal(await parseWorkflowState(serialized.replace("第一段事实。", "被篡改的段落。")), null);
const withWorkflowData = {
  ...state,
  patchStates: [{
    mode: "advice" as const,
    sourceReportHash: reportHash,
    data: {
      mode: "advice" as const,
      source: "model" as const,
      markdown: "建议摘要",
      actions: [{
        type: "author_evidence" as const,
        id: "00000000-0000-4000-8000-000000000001",
        createdAt: "2026-10-15T00:00:00.000Z",
        field: "来源",
        reason: "补充可核验来源",
      }],
    },
  }],
  patchChecklist: [{ id: "patch-1", sourceReportHash: reportHash, title: "补充来源", recommendation: "加入来源", location: "Para-1", status: "attention" as const }],
  recheckBaseline: {
    totalScore: 50,
    dimensions: {
      questionCoverage: { score: 10, max: 35 }, factCompleteness: { score: 10, max: 30 },
      structureClarity: { score: 10, max: 20 }, freshness: { score: 10, max: 15 },
    },
    diagnostics: [],
  },
};
const withWorkflowDataSerialized = await serializeWorkflowState(withWorkflowData);
assert.ok(withWorkflowDataSerialized);
const restoredWorkflowData = await parseWorkflowState(withWorkflowDataSerialized);
assert.equal(restoredWorkflowData?.patchChecklist[0]?.id, "patch-1");
assert.equal(restoredWorkflowData?.patchStates[0]?.mode, "advice");
assert.equal(restoredWorkflowData?.recheckBaseline?.totalScore, 50);
const changed = { ...state, draft: { ...draft, content: "不同正文。" }, draftHash: await createAnalysisHash({ ...draft, content: "不同正文。" }) };
assert.ok(await serializeWorkflowState(changed));
assert.equal(paragraphsForWorkflow(changed).length, 2);

// A pending edited draft keeps the original report as an immutable recheck
// baseline while its own hash identifies the new, not-yet-analyzed content.
const pendingDraft = { ...draft, content: "不同正文。" };
const pendingSerialized = await serializeWorkflowState(withWorkflowData);
assert.ok(pendingSerialized);
const pendingRestored = await parseWorkflowState(pendingSerialized);
assert.equal(pendingRestored?.reportHash, reportHash);
assert.equal(pendingRestored?.draftHash, reportHash);
assert.equal(pendingRestored?.recheckBaseline?.totalScore, 50);
assert.equal(pendingRestored?.patchStates[0]?.sourceReportHash, reportHash);
const pendingRecovery = resolveWorkflowRecovery({
  workflow: pendingRestored,
  draft: {
    draft: pendingDraft,
    analysisVersion: ANALYSIS_VERSION,
    analysisContractVersion: ANALYSIS_CONTRACT_VERSION,
    reportSchemaVersion: REPORT_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
  },
  draftHash: await createAnalysisHash(pendingDraft),
});
assert.equal(pendingRecovery.kind, "pending-draft");
if (pendingRecovery.kind === "pending-draft") {
  assert.equal(pendingRecovery.workflow.recheckBaseline?.totalScore, 50);
  assert.deepEqual(pendingRecovery.workflow.patchChecklist.map((item) => item.id), ["patch-1"]);
}
assert.equal(canUseAuthenticatedWorkflow(null), false);
assert.equal(canUseAuthenticatedWorkflow("run-1"), true);
assert.equal(hasPendingDraftChange(reportHash, reportHash), false);
assert.equal(hasPendingDraftChange(reportHash, "0".repeat(64)), true);
assert.equal(hasPendingDraftChange(reportHash, null), false);
assert.equal(resolveWorkflowRecovery({ workflow: state, draft: { draft, analysisVersion: ANALYSIS_VERSION, analysisContractVersion: ANALYSIS_CONTRACT_VERSION, reportSchemaVersion: REPORT_SCHEMA_VERSION, savedAt: new Date().toISOString() }, draftHash: reportHash }).kind, "workflow");
assert.equal(resolveWorkflowRecovery({ workflow: state, draft: { draft: { ...draft, content: "新正文" }, analysisVersion: ANALYSIS_VERSION, analysisContractVersion: ANALYSIS_CONTRACT_VERSION, reportSchemaVersion: REPORT_SCHEMA_VERSION, savedAt: new Date().toISOString() }, draftHash: "0".repeat(64) }).kind, "pending-draft");
assert.equal(resolveWorkflowRecovery({ workflow: null, workflowInvalid: true, draft: { draft, analysisVersion: ANALYSIS_VERSION, analysisContractVersion: ANALYSIS_CONTRACT_VERSION, reportSchemaVersion: REPORT_SCHEMA_VERSION, savedAt: new Date().toISOString() }, draftHash: reportHash }).kind, "draft");
assert.equal(resolveWorkflowRecovery({ workflow: null, workflowError: true, draft: null, draftHash: null }).kind, "empty");
assert.equal(resolveRecheckStatus({ hasBaseline: true, comparisonReady: true, restoredFromCache: true, flowHasError: false }), "complete");
assert.equal(resolveRecheckStatus({ hasBaseline: true, comparisonReady: false, restoredFromCache: true, flowHasError: false }), "cached");
assert.equal(resolveRecheckStatus({ hasBaseline: true, comparisonReady: false, restoredFromCache: false, flowHasError: false }), "running");
assert.equal(resolveRecheckStatus({ hasBaseline: true, comparisonReady: true, restoredFromCache: true, flowHasError: true }), "error");
const persistenceContext = {
  storageReady: true,
  analysisStarted: true,
  reportHash,
  scoringSucceeded: true,
  questionsSucceeded: true,
  diagnosticsSucceeded: true,
  paragraphsCount: state.paragraphs.length,
  restoredFromCache: false,
  completeWorkflowRestored: false,
  persistenceBlocked: false,
};
assert.equal(canPersistWorkflow(persistenceContext), true);
assert.equal(canPersistWorkflow({ ...persistenceContext, analysisStarted: false }), false);
assert.equal(canPersistWorkflow({ ...persistenceContext, restoredFromCache: true }), false);
assert.equal(canPersistWorkflow({ ...persistenceContext, restoredFromCache: true, completeWorkflowRestored: true }), true);
assert.equal(canPersistWorkflow({ ...persistenceContext, paragraphsCount: 0 }), false);
assert.equal(canPersistWorkflow({ ...persistenceContext, persistenceBlocked: true }), false);
assert.equal(await serializeWorkflowState({ ...state, paragraphs: [] }), null);
assert.equal(shouldAdoptExternalPatchState({
  sourceChanged: false,
  incomingSignature: '{"advice":{"status":"success"}}',
  lastIncomingSignature: '{}',
  userEdited: false,
}), true);
assert.equal(shouldAdoptExternalPatchState({
  sourceChanged: false,
  incomingSignature: '{"advice":{"status":"success"}}',
  lastIncomingSignature: '{}',
  userEdited: true,
}), false);
assert.deepEqual(filterPatchChecklistForSource([
  { id: "current", sourceReportHash: reportHash, title: "当前", recommendation: "当前", location: "Para-1", status: "attention" as const },
  { id: "old", sourceReportHash: "0".repeat(64), title: "旧", recommendation: "旧", location: "Para-1", status: "attention" as const },
], reportHash).map((item) => item.id), ["current"]);
assert.equal(shouldAdoptExternalPatchState({
  sourceChanged: true,
  incomingSignature: '{}',
  lastIncomingSignature: '{}',
  userEdited: true,
}), true);

// Same-length edits must produce different source versions, even when title,
// paragraph count, and paragraph ids stay unchanged.
const sourceA = createPatchSourceSignature({
  title: "同一标题",
  paragraphs: [{ id: "Para-1", text: "相同长度文本" }],
});
const sourceB = createPatchSourceSignature({
  title: "同一标题",
  paragraphs: [{ id: "Para-1", text: "相同长度文案" }],
});
assert.notEqual(sourceA, sourceB);
// A changed source adopts the new empty state, clearing an edited old Patch.
assert.equal(shouldAdoptExternalPatchState({
  sourceChanged: sourceA !== sourceB,
  incomingSignature: '{"advice":{"status":"idle"}}',
  lastIncomingSignature: '{"advice":{"status":"success"}}',
  userEdited: true,
}), true);
// An unchanged source preserves a user edit across parent updates.
assert.equal(shouldAdoptExternalPatchState({
  sourceChanged: false,
  incomingSignature: '{"advice":{"status":"success"}}',
  lastIncomingSignature: '{}',
  userEdited: true,
}), false);

const storage = new Map<string, string>();
(globalThis as typeof globalThis & { window: Window }).window = {
  localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
  } as unknown as Storage,
} as unknown as Window & typeof globalThis;
assert.deepEqual(await saveWorkflowState(state), { ok: true });
assert.deepEqual(await readWorkflowState(), { state, storageAvailable: true, invalid: false });
const existingSerialized = storage.get("geo:workflow-state:v1");
assert.ok(existingSerialized);
assert.deepEqual(await saveWorkflowState({ ...state, paragraphs: [] }), { ok: false, reason: "serialization" });
assert.equal(storage.get("geo:workflow-state:v1"), existingSerialized);
const invalidSerialized = existingSerialized.replace(state.reportHash, "0".repeat(64));
storage.set("geo:workflow-state:v1", invalidSerialized);
assert.deepEqual(await readWorkflowState(), { state: null, storageAvailable: true, invalid: true });
assert.equal(storage.get("geo:workflow-state:v1"), invalidSerialized);
storage.set("geo:workflow-state:v1", existingSerialized);
assert.deepEqual(await saveWorkflowState(state, { isCurrent: () => false }), { ok: false, reason: "stale" });
assert.equal(storage.get("geo:workflow-state:v1"), existingSerialized);

// Exercise the actual async ordering guard: save A starts first, save B starts
// second, B's hash work completes first, and A is released only afterwards.
storage.set("geo:workflow-state:v1", existingSerialized);
const originalDigest = crypto.subtle.digest.bind(crypto.subtle);
const pendingDigests: Array<{ data: BufferSource; resolve: (value: ArrayBuffer) => void }> = [];
const draftB = { ...draft, content: "第一段事实。\n\n第二段边界。\n\n第三段版本。" };
const hashB = await createAnalysisHash(draftB);
const stateB: WorkflowState = {
  ...state,
  reportId: `report:${hashB}`,
  reportHash: hashB,
  draftHash: hashB,
  patchSourceHash: hashB,
  analyzedDraft: draftB,
  draft: draftB,
  paragraphs: createNumberedParagraphs(draftB.content),
};
// Install a deferred implementation for the two saves.
const deferredDigest = ((algorithm: AlgorithmIdentifier, data: BufferSource) => new Promise<ArrayBuffer>((resolve) => {
  pendingDigests.push({ data, resolve });
})) as typeof crypto.subtle.digest;
crypto.subtle.digest = deferredDigest;
const saveA = saveWorkflowState(state);
const saveB = saveWorkflowState(stateB);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(pendingDigests.length, 2);
const releaseNewest = async () => {
  const item = pendingDigests.pop();
  assert.ok(item);
  item.resolve(await originalDigest("SHA-256", item.data));
  await new Promise((resolve) => setTimeout(resolve, 0));
};
for (let index = 0; index < 4; index += 1) {
  while (pendingDigests.slice().length === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  await releaseNewest();
}
assert.deepEqual(await Promise.all([saveA, saveB]), [
  { ok: false, reason: "stale" },
  { ok: true },
]);
crypto.subtle.digest = originalDigest as typeof crypto.subtle.digest;
assert.equal((await readWorkflowState()).state?.reportHash, hashB);

// A checklist from the previous report cannot be serialized under a new
// report hash, so it cannot be carried into the new workflow.
assert.equal(await serializeWorkflowState({
  ...stateB,
  patchChecklist: [{
    id: "old-patch",
    sourceReportHash: reportHash,
    title: "旧建议",
    recommendation: "旧正文建议",
    location: "Para-1",
    status: "attention" as const,
  }],
}), null);

(globalThis as typeof globalThis & { window: { localStorage: unknown } }).window.localStorage = {
  getItem: () => null,
  setItem: () => { throw new Error("blocked"); },
  removeItem: () => undefined,
} as unknown as Storage;
assert.equal((await saveWorkflowState(state)).ok, false);
(globalThis as typeof globalThis & { window: { localStorage: unknown } }).window.localStorage = {
  getItem: () => { throw new Error("blocked"); },
  setItem: () => undefined,
  removeItem: () => undefined,
} as unknown as Storage;
assert.deepEqual(await readWorkflowState(), { state: null, storageAvailable: false, invalid: false });

console.log("PASS workflow state checks");
