import type { PersistedArticleDraft, DraftSessionEnvelope } from "./analysis-persistence.ts";
import type { WorkflowState } from "./workflow-state.ts";

export type RecheckStatus = "running" | "complete" | "error" | "cached";

export function resolveRecheckStatus(input: {
  hasBaseline: boolean;
  comparisonReady: boolean;
  restoredFromCache: boolean;
  completeWorkflowRestored: boolean;
  flowHasError: boolean;
}): RecheckStatus {
  if (input.flowHasError) return "error";
  if (
    input.hasBaseline &&
    input.comparisonReady &&
    (!input.restoredFromCache || input.completeWorkflowRestored)
  ) return "complete";
  if (input.restoredFromCache) return "cached";
  return "running";
}

export type RecoveryDecision =
  | { kind: "workflow"; workflow: WorkflowState; draft: PersistedArticleDraft }
  | { kind: "pending-draft"; workflow: WorkflowState; draft: PersistedArticleDraft; warning: string }
  | { kind: "draft"; draft: PersistedArticleDraft; warning?: string }
  | { kind: "empty"; warning?: string };

export type RecoveryInput = {
  workflow: WorkflowState | null;
  workflowInvalid?: boolean;
  workflowError?: boolean;
  draft: DraftSessionEnvelope | null;
  draftInvalid?: boolean;
  draftError?: boolean;
  draftHash: string | null;
};

export function resolveWorkflowRecovery(input: RecoveryInput): RecoveryDecision {
  const warningParts: string[] = [];
  if (input.workflowInvalid || input.workflowError) warningParts.push("完整工作流缓存无法恢复");
  if (input.draftInvalid || input.draftError) warningParts.push("正文草稿缓存无法恢复");

  if (input.workflow && input.draft) {
    if (input.draftHash && input.draftHash !== input.workflow.draftHash) {
      return {
        kind: "pending-draft",
        workflow: input.workflow,
        draft: input.draft.draft,
        warning: "已恢复最新正文草稿，旧修改建议和清单需要重新分析。",
      };
    }
    return { kind: "workflow", workflow: input.workflow, draft: input.workflow.draft };
  }
  if (input.workflow) return { kind: "workflow", workflow: input.workflow, draft: input.workflow.draft };
  if (input.draft) return {
    kind: "draft",
    draft: input.draft.draft,
    ...(warningParts.length ? { warning: `${warningParts.join("；")}，已恢复可用正文草稿。` } : {}),
  };
  return warningParts.length ? { kind: "empty", warning: `${warningParts.join("；")}，请重新开始审查。` } : { kind: "empty" };
}
