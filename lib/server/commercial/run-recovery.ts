import { createHash } from "node:crypto";

import type { AnalysisRun, CommercialActor } from "./domain";
import { CommercialIdempotencyConflictError, CommercialNotFoundError, CommercialValidationError } from "./domain";

export type RunUsageState = "unknown" | "reserved" | "charged" | "released";
export type RunRecoveryActionName = "cancel_and_release" | "release_reservation";
export type RunReconciliation = "active" | "consistent" | "reservation_mismatch" | "manual_review";

export type SafeRunObservation = {
  runId: string;
  status: AnalysisRun["status"];
  usageState: RunUsageState;
  resultRecorded: boolean;
  reconciliation: RunReconciliation;
  createdAt: string;
};

export type SafeRunRecoveryAction = {
  id: string;
  runId: string;
  action: RunRecoveryActionName;
  status: "completed";
  createdAt: string;
};

export type RunRecoverySnapshot = {
  runs: SafeRunObservation[];
  reservedCount: number;
  observedReservedRuns: number;
  orphanBlobPolicy: "manual_infrastructure_reconciliation";
};

export class CommercialRunRecoveryConflictError extends Error {
  readonly code = "RUN_RECOVERY_CONFLICT" as const;
  readonly status = 409 as const;

  constructor() {
    super("运行状态已变化或当前状态不允许执行该恢复动作。");
    this.name = "CommercialRunRecoveryConflictError";
  }
}

export interface CommercialRunRecoveryRepository {
  assertOwner(actor: CommercialActor): Promise<void>;
  list(workspaceId: string): Promise<RunRecoverySnapshot>;
  recover(input: {
    id: string;
    workspaceId: string;
    actorId: string;
    runId: string;
    action: RunRecoveryActionName;
    idempotencyKey: string;
    requestFingerprint: string;
  }): Promise<SafeRunRecoveryAction | null>;
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function reconciliationFor(record: Pick<SafeRunObservation, "status" | "usageState" | "resultRecorded">): RunReconciliation {
  if (record.status === "queued" || record.status === "running") {
    return record.usageState === "reserved" && !record.resultRecorded ? "active" : "manual_review";
  }
  if (record.status === "succeeded") return record.usageState === "charged" && record.resultRecorded ? "consistent" : "manual_review";
  if (record.usageState === "reserved" && !record.resultRecorded) return "reservation_mismatch";
  if (record.usageState === "released" && !record.resultRecorded) return "consistent";
  return "manual_review";
}

export class CommercialRunRecoveryService {
  constructor(private readonly repository: CommercialRunRecoveryRepository) {}

  async list(actor: CommercialActor): Promise<RunRecoverySnapshot> {
    await this.repository.assertOwner(actor);
    return this.repository.list(actor.workspaceId);
  }

  async recover(actor: CommercialActor, body: unknown, idempotencyKey: string | null): Promise<SafeRunRecoveryAction> {
    await this.repository.assertOwner(actor);
    if (!idempotencyKey || idempotencyKey.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(idempotencyKey)) throw new CommercialValidationError();
    if (!body || typeof body !== "object") throw new CommercialValidationError();
    const value = body as Record<string, unknown>;
    const runId = typeof value.runId === "string" ? value.runId.trim() : "";
    const action = value.action;
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(runId) || (action !== "cancel_and_release" && action !== "release_reservation") || Object.keys(value).some((key) => key !== "runId" && key !== "action")) {
      throw new CommercialValidationError();
    }
    const requestFingerprint = fingerprint({ runId, action });
    const id = `recovery_${createHash("sha256").update(`${actor.workspaceId}:${idempotencyKey}`).digest("hex").slice(0, 24)}`;
    const recovered = await this.repository.recover({ id, workspaceId: actor.workspaceId, actorId: actor.subjectId, runId, action, idempotencyKey, requestFingerprint });
    if (!recovered) throw new CommercialRunRecoveryConflictError();
    return recovered;
  }
}

type MemoryRun = SafeRunObservation & { workspaceId: string };

export class InMemoryCommercialRunRecoveryRepository implements CommercialRunRecoveryRepository {
  readonly runs = new Map<string, MemoryRun>();
  readonly actions = new Map<string, SafeRunRecoveryAction & { fingerprint: string; workspaceId: string }>();
  readonly audits: Array<{ workspaceId: string; actorId: string; action: string; runId: string }> = [];
  readonly reserved = new Map<string, number>();

  seed(workspaceId: string, record: Omit<MemoryRun, "workspaceId" | "reconciliation">): void {
    this.runs.set(record.runId, { ...record, workspaceId, reconciliation: reconciliationFor(record) });
    if (record.usageState === "reserved") this.reserved.set(workspaceId, (this.reserved.get(workspaceId) ?? 0) + 1);
  }

  async assertOwner(actor: CommercialActor): Promise<void> {
    if (actor.role !== "owner") throw Object.assign(new Error("仅工作区所有者可执行此操作。"), { code: "FORBIDDEN", status: 403 });
  }

  async list(workspaceId: string): Promise<RunRecoverySnapshot> {
    const runs = [...this.runs.values()].filter((run) => run.workspaceId === workspaceId).map(({ workspaceId: _workspaceId, ...run }) => ({ ...run, reconciliation: reconciliationFor(run) }));
    return { runs, reservedCount: this.reserved.get(workspaceId) ?? 0, observedReservedRuns: runs.filter((run) => run.usageState === "reserved").length, orphanBlobPolicy: "manual_infrastructure_reconciliation" };
  }

  async recover(input: { id: string; workspaceId: string; actorId: string; runId: string; action: RunRecoveryActionName; idempotencyKey: string; requestFingerprint: string }): Promise<SafeRunRecoveryAction | null> {
    const key = `${input.workspaceId}:${input.idempotencyKey}`;
    const existing = this.actions.get(key);
    if (existing) {
      if (existing.fingerprint !== input.requestFingerprint) throw new CommercialIdempotencyConflictError();
      const { fingerprint: _fingerprint, workspaceId: _workspaceId, ...safe } = existing;
      return safe;
    }
    const run = this.runs.get(input.runId);
    if (!run || run.workspaceId !== input.workspaceId) throw new CommercialNotFoundError();
    const active = run.status === "queued" || run.status === "running";
    const terminal = run.status === "failed" || run.status === "cancelled";
    if (run.usageState !== "reserved" || run.resultRecorded || (input.action === "cancel_and_release" ? !active : !terminal)) return null;
    run.status = active ? "cancelled" : run.status;
    run.usageState = "released";
    run.reconciliation = reconciliationFor(run);
    this.reserved.set(input.workspaceId, Math.max(0, (this.reserved.get(input.workspaceId) ?? 0) - 1));
    const action: SafeRunRecoveryAction & { fingerprint: string; workspaceId: string } = { id: input.id, runId: input.runId, action: input.action, status: "completed", createdAt: new Date(0).toISOString(), fingerprint: input.requestFingerprint, workspaceId: input.workspaceId };
    this.actions.set(key, action);
    this.audits.push({ workspaceId: input.workspaceId, actorId: input.actorId, action: `commercial.run.${input.action}`, runId: input.runId });
    const { fingerprint: _fingerprint, workspaceId: _workspaceId, ...safe } = action;
    return safe;
  }
}
