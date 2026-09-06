import { Redis } from "@upstash/redis";

import { getUpstashRedisRestConfig } from "../redis-config";
import {
  CommercialIdempotencyConflictError,
  CommercialNotFoundError,
  CommercialQuotaExceededError,
  CommercialRunNotCancellableError,
  COMMERCIAL_RUN_HISTORY_LIMIT,
  type AnalysisRun,
  type CommercialActor,
  type IdempotencyRecord,
  type Project,
  type UsageSnapshot,
} from "./domain";
import type { CommercialRepository } from "./repository";

/**
 * Preview-only persistence for the interview workspace.
 *
 * This deliberately uses a dedicated Redis key namespace instead of the
 * commercial Neon schema. It gives Vercel Preview requests shared state while
 * keeping the portfolio/demo data isolated from Production workspaces.
 */
export class InterviewRedisCommercialRepository implements CommercialRepository {
  private readonly prefix: string;

  constructor(
    private readonly redis: Redis,
    private readonly runLimit: number,
    workspaceId = "interview-workspace",
  ) {
    if (!Number.isSafeInteger(runLimit) || runLimit < 1) throw new Error("runLimit must be a positive integer");
    this.prefix = `evidra:interview:v1:${workspaceId}`;
  }

  private projectKey(projectId: string): string {
    return `${this.prefix}:project:${projectId}`;
  }

  private projectIdsKey(): string {
    return `${this.prefix}:projects`;
  }

  private runKey(runId: string): string {
    return `${this.prefix}:run:${runId}`;
  }

  private runIdsKey(projectId: string): string {
    return `${this.prefix}:project:${projectId}:runs`;
  }

  private idempotencyKey(record: Pick<IdempotencyRecord, "operation" | "key">): string {
    return `${this.prefix}:idempotency:${record.operation}:${record.key}`;
  }

  private consumedKey(): string {
    return `${this.prefix}:usage:consumed`;
  }

  private reservedKey(): string {
    return `${this.prefix}:usage:reserved`;
  }

  private async getJson<T>(key: string): Promise<T | null> {
    return this.redis.get<T>(key);
  }

  private async setJson<T>(key: string, value: T): Promise<void> {
    await this.redis.set(key, value);
  }

  private async getRunOrThrow(actor: CommercialActor, runId: string): Promise<AnalysisRun> {
    const run = await this.getJson<AnalysisRun>(this.runKey(runId));
    if (!run || run.workspaceId !== actor.workspaceId) throw new CommercialNotFoundError("运行记录不存在。");
    return run;
  }

  async verifyActor(_actor: CommercialActor): Promise<void> {}

  async listProjects(actor: CommercialActor): Promise<Project[]> {
    const ids = await this.redis.smembers(this.projectIdsKey());
    const projects = await Promise.all(ids.map((id) => this.getJson<Project>(this.projectKey(id))));
    return projects
      .filter((project): project is Project => Boolean(project && project.workspaceId === actor.workspaceId))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async getIdempotency(record: Pick<IdempotencyRecord, "workspaceId" | "operation" | "key">): Promise<IdempotencyRecord | null> {
    if (record.workspaceId !== "interview-workspace") return null;
    return this.getJson<IdempotencyRecord>(this.idempotencyKey(record));
  }

  async createProject(
    actor: CommercialActor,
    name: string,
    requestFingerprint: string,
    idempotencyKey?: string,
  ): Promise<Project> {
    if (idempotencyKey) {
      const existing = await this.getIdempotency({ workspaceId: actor.workspaceId, operation: "project.create", key: idempotencyKey });
      if (existing) {
        if (existing.requestFingerprint !== requestFingerprint) throw new CommercialIdempotencyConflictError();
        const replay = await this.getJson<Project>(this.projectKey(existing.resourceId));
        if (replay) return replay;
      }
    }

    const project: Project = {
      id: `project_${crypto.randomUUID()}`,
      workspaceId: actor.workspaceId,
      name,
      createdBy: actor.subjectId,
      createdAt: new Date().toISOString(),
    };
    await this.setJson(this.projectKey(project.id), project);
    await this.redis.sadd(this.projectIdsKey(), project.id);
    if (idempotencyKey) {
      const record: IdempotencyRecord = {
        workspaceId: actor.workspaceId,
        operation: "project.create",
        key: idempotencyKey,
        requestFingerprint,
        resourceId: project.id,
        createdAt: project.createdAt,
      };
      const inserted = await this.redis.set(this.idempotencyKey(record), record, { nx: true });
      if (inserted === null) {
        const existing = await this.getIdempotency(record);
        if (existing?.requestFingerprint !== requestFingerprint) throw new CommercialIdempotencyConflictError();
        const replay = existing ? await this.getJson<Project>(this.projectKey(existing.resourceId)) : null;
        if (replay) return replay;
      }
    }
    return project;
  }

  async createRun(
    actor: CommercialActor,
    projectId: string,
    requestFingerprint: string,
    idempotencyKey?: string,
  ): Promise<AnalysisRun> {
    const project = await this.getJson<Project>(this.projectKey(projectId));
    if (!project || project.workspaceId !== actor.workspaceId) throw new CommercialNotFoundError("项目不存在。");
    if (idempotencyKey) {
      const existing = await this.getIdempotency({ workspaceId: actor.workspaceId, operation: "run.create", key: idempotencyKey });
      if (existing) {
        if (existing.requestFingerprint !== requestFingerprint) throw new CommercialIdempotencyConflictError();
        const replay = await this.getJson<AnalysisRun>(this.runKey(existing.resourceId));
        if (replay) return replay;
      }
    }

    const consumed = Number((await this.redis.get<number>(this.consumedKey())) ?? 0);
    const reserved = Number((await this.redis.get<number>(this.reservedKey())) ?? 0);
    if (consumed + reserved >= this.runLimit) throw new CommercialQuotaExceededError();

    const run: AnalysisRun = {
      id: `run_${crypto.randomUUID()}`,
      workspaceId: actor.workspaceId,
      projectId,
      status: "queued",
      createdBy: actor.subjectId,
      createdAt: new Date().toISOString(),
    };
    await this.redis.incr(this.reservedKey());
    await this.setJson(this.runKey(run.id), run);
    await this.redis.sadd(this.runIdsKey(projectId), run.id);
    if (idempotencyKey) {
      const record: IdempotencyRecord = {
        workspaceId: actor.workspaceId,
        operation: "run.create",
        key: idempotencyKey,
        requestFingerprint,
        resourceId: run.id,
        createdAt: run.createdAt,
      };
      const inserted = await this.redis.set(this.idempotencyKey(record), record, { nx: true });
      if (inserted === null) {
        const existing = await this.getIdempotency(record);
        if (existing?.requestFingerprint !== requestFingerprint) throw new CommercialIdempotencyConflictError();
        const replay = existing ? await this.getJson<AnalysisRun>(this.runKey(existing.resourceId)) : null;
        if (replay) return replay;
      }
    }
    return run;
  }

  async cancelQueuedRun(
    actor: CommercialActor,
    runId: string,
    requestFingerprint: string,
    idempotencyKey: string,
  ): Promise<AnalysisRun> {
    const existing = await this.getIdempotency({ workspaceId: actor.workspaceId, operation: "run.cancel", key: idempotencyKey });
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) throw new CommercialIdempotencyConflictError();
      return this.getRunOrThrow(actor, existing.resourceId);
    }
    const run = await this.getRunOrThrow(actor, runId);
    if (run.status !== "queued" || (Number((await this.redis.get<number>(this.reservedKey())) ?? 0) < 1)) {
      throw new CommercialRunNotCancellableError();
    }
    const cancelled: AnalysisRun = { ...run, status: "cancelled", failureCode: "USER_CANCELLED" };
    await this.setJson(this.runKey(run.id), cancelled);
    await this.redis.decr(this.reservedKey());
    await this.setJson(this.idempotencyKey({ operation: "run.cancel", key: idempotencyKey }), {
      workspaceId: actor.workspaceId,
      operation: "run.cancel",
      key: idempotencyKey,
      requestFingerprint,
      resourceId: run.id,
      createdAt: new Date().toISOString(),
    } satisfies IdempotencyRecord);
    return cancelled;
  }

  async getUsage(actor: CommercialActor): Promise<UsageSnapshot> {
    return {
      workspaceId: actor.workspaceId,
      consumed: Number((await this.redis.get<number>(this.consumedKey())) ?? 0),
      limit: this.runLimit,
      accessMode: "paid",
      accessExpiresAt: null,
    };
  }

  async getRun(actor: CommercialActor, runId: string): Promise<AnalysisRun | null> {
    const run = await this.getJson<AnalysisRun>(this.runKey(runId));
    return run?.workspaceId === actor.workspaceId ? run : null;
  }

  async listRuns(actor: CommercialActor, projectId: string): Promise<AnalysisRun[]> {
    const ids = await this.redis.smembers(this.runIdsKey(projectId));
    const runs = await Promise.all(ids.map((id) => this.getJson<AnalysisRun>(this.runKey(id))));
    return runs
      .filter((run): run is AnalysisRun => Boolean(run && run.workspaceId === actor.workspaceId && run.projectId === projectId))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
      .slice(0, COMMERCIAL_RUN_HISTORY_LIMIT);
  }

  async transitionRun(
    actor: CommercialActor,
    runId: string,
    from: AnalysisRun["status"],
    to: AnalysisRun["status"],
    update: { failureCode?: string | null; resultKey?: string | null } = {},
  ): Promise<AnalysisRun | null> {
    const run = await this.getRun(actor, runId);
    if (!run || run.status !== from) return null;
    if (to === "succeeded" && (from !== "running" || !update.resultKey)) return null;
    if (from === "queued" && !["running", "failed", "cancelled"].includes(to)) return null;
    if (from === "running" && !["succeeded", "failed", "cancelled"].includes(to)) return null;
    const next: AnalysisRun = {
      ...run,
      status: to,
      ...(update.failureCode !== undefined ? { failureCode: update.failureCode } : {}),
      ...(update.resultKey !== undefined ? { resultKey: update.resultKey } : {}),
    };
    await this.setJson(this.runKey(runId), next);
    if (["succeeded", "failed", "cancelled"].includes(to)) {
      await this.redis.decr(this.reservedKey());
      if (to === "succeeded") await this.redis.incr(this.consumedKey());
    }
    return next;
  }
}

export function getInterviewRedisCommercialRepository(runLimit: number): InterviewRedisCommercialRepository | null {
  const { url, token } = getUpstashRedisRestConfig();
  if (!url || !token) return null;
  return new InterviewRedisCommercialRepository(new Redis({ url, token }), runLimit);
}
