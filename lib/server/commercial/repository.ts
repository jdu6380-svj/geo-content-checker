import { randomUUID } from "node:crypto";

import {
  CommercialIdempotencyConflictError,
  CommercialNotFoundError,
  CommercialQuotaExceededError,
  CommercialRunNotCancellableError,
  type AnalysisRun,
  type CommercialActor,
  COMMERCIAL_RUN_HISTORY_LIMIT,
  type IdempotencyRecord,
  type Project,
  type UsageSnapshot,
} from "./domain";

export interface CommercialRepository {
  verifyActor(actor: CommercialActor): Promise<void>;
  listProjects(actor: CommercialActor): Promise<Project[]>;
  createProject(actor: CommercialActor, name: string, requestFingerprint: string, idempotencyKey?: string): Promise<Project>;
  createRun(actor: CommercialActor, projectId: string, requestFingerprint: string, idempotencyKey?: string): Promise<AnalysisRun>;
  cancelQueuedRun(actor: CommercialActor, runId: string, requestFingerprint: string, idempotencyKey: string): Promise<AnalysisRun>;
  getRun(actor: CommercialActor, runId: string): Promise<AnalysisRun | null>;
  listRuns(actor: CommercialActor, projectId: string): Promise<AnalysisRun[]>;
  transitionRun(
    actor: CommercialActor,
    runId: string,
    from: AnalysisRun["status"],
    to: AnalysisRun["status"],
    update?: { failureCode?: string | null; resultKey?: string | null },
  ): Promise<AnalysisRun | null>;
  getIdempotency(record: Pick<IdempotencyRecord, "workspaceId" | "operation" | "key">): Promise<IdempotencyRecord | null>;
  getUsage(actor: CommercialActor): Promise<UsageSnapshot>;
}

function idempotencyMapKey(record: Pick<IdempotencyRecord, "workspaceId" | "operation" | "key">): string {
  return `${record.workspaceId}:${record.operation}:${record.key}`;
}

function assertIdempotency(
  existing: IdempotencyRecord | null,
  requestFingerprint: string,
): void {
  if (existing && existing.requestFingerprint !== requestFingerprint) {
    throw new CommercialIdempotencyConflictError();
  }
}

export class InMemoryCommercialRepository implements CommercialRepository {
  private readonly projects = new Map<string, Project>();
  private readonly runs = new Map<string, AnalysisRun>();
  private readonly idempotency = new Map<string, IdempotencyRecord>();
  private readonly usage = new Map<string, number>();
  private readonly reservations = new Map<string, number>();

  constructor(private readonly runLimit: number) {
    if (!Number.isSafeInteger(runLimit) || runLimit < 1) {
      throw new Error("runLimit must be a positive integer");
    }
  }

  async verifyActor(_actor: CommercialActor): Promise<void> {}

  async listProjects(actor: CommercialActor): Promise<Project[]> {
    return [...this.projects.values()]
      .filter((project) => project.workspaceId === actor.workspaceId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async getIdempotency(record: Pick<IdempotencyRecord, "workspaceId" | "operation" | "key">): Promise<IdempotencyRecord | null> {
    return this.idempotency.get(idempotencyMapKey(record)) ?? null;
  }

  async createProject(
    actor: CommercialActor,
    name: string,
    requestFingerprint: string,
    idempotencyKey?: string,
  ): Promise<Project> {
    const now = new Date().toISOString();
    if (idempotencyKey) {
      const key = idempotencyMapKey({ workspaceId: actor.workspaceId, operation: "project.create", key: idempotencyKey });
      const existing = this.idempotency.get(key) ?? null;
      assertIdempotency(existing, requestFingerprint);
      if (existing) return this.projects.get(existing.resourceId) as Project;
    }

    const project: Project = {
      id: `project_${randomUUID()}`,
      workspaceId: actor.workspaceId,
      name,
      createdBy: actor.subjectId,
      createdAt: now,
    };
    this.projects.set(project.id, project);
    if (idempotencyKey) {
      this.idempotency.set(
        idempotencyMapKey({ workspaceId: actor.workspaceId, operation: "project.create", key: idempotencyKey }),
        {
          workspaceId: actor.workspaceId,
          operation: "project.create",
          key: idempotencyKey,
          requestFingerprint,
          resourceId: project.id,
          createdAt: now,
        },
      );
    }
    return project;
  }

  async createRun(
    actor: CommercialActor,
    projectId: string,
    requestFingerprint: string,
    idempotencyKey?: string,
  ): Promise<AnalysisRun> {
    const project = this.projects.get(projectId);
    if (!project || project.workspaceId !== actor.workspaceId) throw new CommercialNotFoundError("项目不存在。");
    if (idempotencyKey) {
      const key = idempotencyMapKey({ workspaceId: actor.workspaceId, operation: "run.create", key: idempotencyKey });
      const existing = this.idempotency.get(key) ?? null;
      assertIdempotency(existing, requestFingerprint);
      if (existing) return this.runs.get(existing.resourceId) as AnalysisRun;
    }

    const consumed = this.usage.get(actor.workspaceId) ?? 0;
    const reserved = this.reservations.get(actor.workspaceId) ?? 0;
    if (consumed + reserved >= this.runLimit) throw new CommercialQuotaExceededError();
    const now = new Date().toISOString();
    const run: AnalysisRun = {
      id: `run_${randomUUID()}`,
      workspaceId: actor.workspaceId,
      projectId,
      status: "queued",
      createdBy: actor.subjectId,
      createdAt: now,
    };
    this.runs.set(run.id, run);
    this.reservations.set(actor.workspaceId, reserved + 1);
    if (idempotencyKey) {
      this.idempotency.set(
        idempotencyMapKey({ workspaceId: actor.workspaceId, operation: "run.create", key: idempotencyKey }),
        {
          workspaceId: actor.workspaceId,
          operation: "run.create",
          key: idempotencyKey,
          requestFingerprint,
          resourceId: run.id,
          createdAt: now,
        },
      );
    }
    return run;
  }

  async cancelQueuedRun(
    actor: CommercialActor,
    runId: string,
    requestFingerprint: string,
    idempotencyKey: string,
  ): Promise<AnalysisRun> {
    const key = idempotencyMapKey({ workspaceId: actor.workspaceId, operation: "run.cancel", key: idempotencyKey });
    const existing = this.idempotency.get(key) ?? null;
    assertIdempotency(existing, requestFingerprint);
    if (existing) {
      const replay = this.runs.get(existing.resourceId);
      if (replay?.workspaceId === actor.workspaceId) return replay;
      throw new CommercialNotFoundError("运行记录不存在。");
    }

    const run = this.runs.get(runId);
    const project = run ? this.projects.get(run.projectId) : undefined;
    if (!project || project.workspaceId !== actor.workspaceId || !run || run.workspaceId !== actor.workspaceId) {
      throw new CommercialNotFoundError("运行记录不存在。");
    }
    if (run.status !== "queued" || run.resultKey || (this.reservations.get(actor.workspaceId) ?? 0) < 1) {
      throw new CommercialRunNotCancellableError();
    }

    const cancelled: AnalysisRun = { ...run, status: "cancelled", failureCode: "USER_CANCELLED" };
    this.runs.set(run.id, cancelled);
    this.reservations.set(actor.workspaceId, (this.reservations.get(actor.workspaceId) ?? 1) - 1);
    this.idempotency.set(key, {
      workspaceId: actor.workspaceId,
      operation: "run.cancel",
      key: idempotencyKey,
      requestFingerprint,
      resourceId: run.id,
      createdAt: new Date().toISOString(),
    });
    return cancelled;
  }

  async getUsage(actor: CommercialActor): Promise<UsageSnapshot> {
    return {
      workspaceId: actor.workspaceId,
      consumed: this.usage.get(actor.workspaceId) ?? 0,
      limit: this.runLimit,
    };
  }

  async getRun(actor: CommercialActor, runId: string): Promise<AnalysisRun | null> {
    const run = this.runs.get(runId);
    return run?.workspaceId === actor.workspaceId ? run : null;
  }

  async listRuns(actor: CommercialActor, projectId: string): Promise<AnalysisRun[]> {
    return [...this.runs.values()]
      .filter((run) => run.workspaceId === actor.workspaceId && run.projectId === projectId)
      .sort((left, right) => {
        const createdAtOrder = right.createdAt.localeCompare(left.createdAt);
        return createdAtOrder || right.id.localeCompare(left.id);
      })
      .slice(0, COMMERCIAL_RUN_HISTORY_LIMIT);
  }

  async transitionRun(
    actor: CommercialActor,
    runId: string,
    from: AnalysisRun["status"],
    to: AnalysisRun["status"],
    update: { failureCode?: string | null; resultKey?: string | null } = {},
  ): Promise<AnalysisRun | null> {
    const run = this.runs.get(runId);
    if (!run || run.workspaceId !== actor.workspaceId || run.status !== from) return null;
    if (to === "succeeded" && (from !== "running" || !update.resultKey)) return null;
    if (from === "queued" && to !== "running" && to !== "failed" && to !== "cancelled") return null;
    if (from === "running" && to !== "succeeded" && to !== "failed" && to !== "cancelled") return null;
    if ((to === "succeeded" || to === "failed" || to === "cancelled") && (this.reservations.get(actor.workspaceId) ?? 0) < 1) return null;
    const next = {
      ...run,
      status: to,
      ...(update.failureCode !== undefined ? { failureCode: update.failureCode } : {}),
      ...(update.resultKey !== undefined ? { resultKey: update.resultKey } : {}),
    };
    this.runs.set(runId, next);
    if (to === "succeeded") {
      this.reservations.set(actor.workspaceId, (this.reservations.get(actor.workspaceId) ?? 1) - 1);
      this.usage.set(actor.workspaceId, (this.usage.get(actor.workspaceId) ?? 0) + 1);
    } else if (to === "failed" || to === "cancelled") {
      this.reservations.set(actor.workspaceId, (this.reservations.get(actor.workspaceId) ?? 1) - 1);
    }
    return next;
  }
}
