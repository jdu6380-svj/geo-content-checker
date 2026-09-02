import { createHash } from "node:crypto";

import {
  commercialIdSchema,
  createProjectInputSchema,
  createRunInputSchema,
  CommercialValidationError,
  type CommercialActor,
} from "./domain";
import { InMemoryCommercialRepository, type CommercialRepository } from "./repository";
import { getNeonCommercialRepository } from "./neon-repository";

export type CommercialServiceConfig = {
  repository: CommercialRepository;
};

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function normalizeCommercialIdempotencyKey(key: string | null | undefined): string | undefined {
  const normalized = key?.trim();
  if (!normalized) return undefined;
  if (normalized.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(normalized)) {
    throw new CommercialValidationError("幂等键格式不正确。");
  }
  return normalized;
}

export class CommercialService {
  constructor(private readonly config: CommercialServiceConfig) {}

  async verifyActor(actor: CommercialActor) {
    await this.config.repository.verifyActor(actor);
  }

  async listProjects(actor: CommercialActor) {
    return this.config.repository.listProjects(actor);
  }

  async createProject(actor: CommercialActor, input: unknown, idempotencyHeader?: string) {
    const parsed = createProjectInputSchema.safeParse(input);
    if (!parsed.success) throw new CommercialValidationError();
    const idempotencyKey = normalizeCommercialIdempotencyKey(idempotencyHeader);
    return this.config.repository.createProject(
      actor,
      parsed.data.name,
      fingerprint(parsed.data),
      idempotencyKey,
    );
  }

  async createRun(actor: CommercialActor, input: unknown, idempotencyHeader?: string) {
    const parsed = createRunInputSchema.safeParse(input);
    if (!parsed.success) throw new CommercialValidationError();
    const idempotencyKey = normalizeCommercialIdempotencyKey(idempotencyHeader);
    return this.config.repository.createRun(
      actor,
      parsed.data.projectId,
      fingerprint(parsed.data),
      idempotencyKey,
    );
  }

  async cancelQueuedRun(
    actor: CommercialActor,
    input: { runId: string },
    idempotencyHeader?: string,
  ) {
    const runId = commercialIdSchema.safeParse(input.runId);
    if (!runId.success) throw new CommercialValidationError();
    const idempotencyKey = normalizeCommercialIdempotencyKey(idempotencyHeader);
    if (!idempotencyKey) throw new CommercialValidationError("缺少幂等键。");
    const request = { intent: "cancel", runId: runId.data };
    return this.config.repository.cancelQueuedRun(
      actor,
      runId.data,
      fingerprint(request),
      idempotencyKey,
    );
  }

  async usage(actor: CommercialActor) {
    return this.config.repository.getUsage(actor);
  }

  async getRun(actor: CommercialActor, runId: string) {
    return this.config.repository.getRun(actor, runId);
  }

  async listRuns(actor: CommercialActor, projectId: string) {
    const parsed = commercialIdSchema.safeParse(projectId);
    if (!parsed.success) throw new CommercialValidationError("项目不存在。");
    return this.config.repository.listRuns(actor, parsed.data);
  }

  async transitionRun(
    actor: CommercialActor,
    runId: string,
    from: import("./domain").AnalysisRun["status"],
    to: import("./domain").AnalysisRun["status"],
    update?: { failureCode?: string | null; resultKey?: string | null },
  ) {
    return this.config.repository.transitionRun(actor, runId, from, to, update);
  }
}

let localService: { key: string; service: CommercialService } | null = null;
let neonService: { key: string; service: CommercialService } | null = null;

function readPositiveInteger(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function getLocalCommercialService(): CommercialService | null {
  if (process.env.NODE_ENV === "production") return null;
  if (process.env.COMMERCIAL_DATA_ADAPTER !== "memory") return null;
  const limit = readPositiveInteger(process.env.COMMERCIAL_RUN_LIMIT);
  if (!limit) return null;
  const key = `memory:${limit}`;
  if (!localService || localService.key !== key) {
    localService = { key, service: new CommercialService({ repository: new InMemoryCommercialRepository(limit) }) };
  }
  return localService.service;
}

export function getConfiguredCommercialService(): CommercialService | null {
  if (process.env.NODE_ENV === "production" && process.env.COMMERCIAL_DATA_ADAPTER !== "neon") return null;
  if (process.env.COMMERCIAL_DATA_ADAPTER === "memory") return getLocalCommercialService();
  if (process.env.COMMERCIAL_DATA_ADAPTER !== "neon") return null;
  const repository = getNeonCommercialRepository();
  if (!repository) return null;
  const key = createHash("sha256").update(process.env.DATABASE_URL?.trim() ?? "").digest("hex");
  if (!neonService || neonService.key !== key) {
    neonService = { key, service: new CommercialService({ repository }) };
  }
  return neonService.service;
}
