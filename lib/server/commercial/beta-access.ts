import { randomUUID } from "node:crypto";

import { CommercialDataUnavailableError, CommercialIdempotencyConflictError, CommercialValidationError, commercialIdSchema, type CommercialActor } from "./domain";
import { getNeonSql } from "./neon-client";

export type BetaGrant = {
  grantId: string;
  workspaceId: string;
  runLimit: number;
  expiresAt: string;
  createdAt: string;
};

export type BetaGrantInput = {
  workspaceId: string;
  runLimit: number;
  expiresAt: string;
  idempotencyKey: string;
};

export interface BetaAccessRepository {
  grant(actor: CommercialActor, input: BetaGrantInput): Promise<BetaGrant>;
}

function isOperator(actor: CommercialActor): boolean {
  if (process.env.NEXT_PUBLIC_EVIDRA_BETA_MODE?.trim() !== "true") return false;
  if (actor.role !== "owner") return false;
  const allowlist = process.env.EVIDRA_BETA_OPERATOR_SUBJECTS?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
  return allowlist.includes(actor.subjectId);
}

function validate(input: BetaGrantInput): void {
  if (!commercialIdSchema.safeParse(input.workspaceId).success || input.runLimit < 1 || input.runLimit > 10_000 || !Number.isSafeInteger(input.runLimit) || !commercialIdSchema.safeParse(input.idempotencyKey).success) throw new CommercialValidationError();
  const expiry = new Date(input.expiresAt);
  if (Number.isNaN(expiry.getTime()) || expiry.getTime() <= Date.now() || expiry.getTime() > Date.now() + 366 * 24 * 60 * 60 * 1000) throw new CommercialValidationError("Beta 授权有效期不正确。");
}

export class BetaAccessService {
  constructor(private readonly repository: BetaAccessRepository) {}

  async grant(actor: CommercialActor, input: BetaGrantInput): Promise<BetaGrant> {
    if (!isOperator(actor)) {
      const error = new Error("仅受信任的 Beta 运营账号可发放授权。");
      Object.assign(error, { code: "FORBIDDEN", status: 403 });
      throw error;
    }
    if (input.workspaceId !== actor.workspaceId) throw new CommercialValidationError();
    validate(input);
    return this.repository.grant(actor, input);
  }
}

export class NeonBetaAccessRepository implements BetaAccessRepository {
  async grant(actor: CommercialActor, input: BetaGrantInput): Promise<BetaGrant> {
    const sql = getNeonSql();
    const existing = await sql`select grant_id, workspace_id, run_limit, expires_at, created_at from beta_access_grants where workspace_id = ${input.workspaceId} and idempotency_key = ${input.idempotencyKey} limit 1` as unknown as Array<{ grant_id: string; workspace_id: string; run_limit: number; expires_at: string | Date; created_at: string | Date }>;
    if (existing[0]) {
      if (Number(existing[0].run_limit) !== input.runLimit || new Date(existing[0].expires_at).toISOString() !== new Date(input.expiresAt).toISOString()) throw new CommercialIdempotencyConflictError();
      return { grantId: existing[0].grant_id, workspaceId: existing[0].workspace_id, runLimit: Number(existing[0].run_limit), expiresAt: new Date(existing[0].expires_at).toISOString(), createdAt: new Date(existing[0].created_at).toISOString() };
    }
    const grantId = `beta_${randomUUID()}`;
    const createdAt = new Date().toISOString();
    const rows = await sql`with inserted as (
      insert into beta_access_grants (grant_id, workspace_id, granted_by, idempotency_key, run_limit, quota_ceiling, status, expires_at, created_at)
      select ${grantId}, ${input.workspaceId}, ${actor.subjectId}, ${input.idempotencyKey}, ${input.runLimit}, usage.consumed + usage.reserved + ${input.runLimit}, 'active', ${input.expiresAt}::timestamptz, ${createdAt}::timestamptz
      from usage_counters usage where usage.workspace_id = ${input.workspaceId}
      on conflict (workspace_id, idempotency_key) do nothing
      returning grant_id, workspace_id, run_limit, expires_at, created_at, quota_ceiling
    ), recorded as (
      insert into commercial_audit_events (event_id, workspace_id, actor_id, action, resource_id, created_at)
      select ${`audit_${grantId}`}, ${input.workspaceId}, ${actor.subjectId}, 'commercial.beta.grant_created', ${grantId}, ${createdAt}::timestamptz from inserted
      on conflict (event_id) do nothing
    ) select grant_id, workspace_id, run_limit, expires_at, created_at from inserted` as unknown as Array<{ grant_id: string; workspace_id: string; run_limit: number; expires_at: string | Date; created_at: string | Date }>;
    if (!rows[0]) {
      const replay = await sql`select grant_id, workspace_id, run_limit, expires_at, created_at from beta_access_grants where workspace_id = ${input.workspaceId} and idempotency_key = ${input.idempotencyKey} limit 1` as unknown as typeof rows;
      if (replay[0]) {
        if (Number(replay[0].run_limit) !== input.runLimit || new Date(replay[0].expires_at).toISOString() !== new Date(input.expiresAt).toISOString()) throw new CommercialIdempotencyConflictError();
        return { grantId: replay[0].grant_id, workspaceId: replay[0].workspace_id, runLimit: Number(replay[0].run_limit), expiresAt: new Date(replay[0].expires_at).toISOString(), createdAt: new Date(replay[0].created_at).toISOString() };
      }
      throw new CommercialDataUnavailableError();
    }
    return { grantId: rows[0].grant_id, workspaceId: rows[0].workspace_id, runLimit: Number(rows[0].run_limit), expiresAt: new Date(rows[0].expires_at).toISOString(), createdAt: new Date(rows[0].created_at).toISOString() };
  }
}

export class InMemoryBetaAccessRepository implements BetaAccessRepository {
  readonly grants = new Map<string, BetaGrant>();
  async grant(_actor: CommercialActor, input: BetaGrantInput): Promise<BetaGrant> {
    const key = `${input.workspaceId}:${input.idempotencyKey}`;
    const existing = this.grants.get(key);
    if (existing) {
      if (existing.runLimit !== input.runLimit || existing.expiresAt !== new Date(input.expiresAt).toISOString()) throw new CommercialIdempotencyConflictError();
      return existing;
    }
    const grant = { grantId: `beta_${randomUUID()}`, workspaceId: input.workspaceId, runLimit: input.runLimit, expiresAt: new Date(input.expiresAt).toISOString(), createdAt: new Date().toISOString() };
    this.grants.set(key, grant);
    return grant;
  }
}

export function getNeonBetaAccessRepository(): NeonBetaAccessRepository | null {
  return process.env.COMMERCIAL_DATA_ADAPTER === "neon" && process.env.DATABASE_URL?.trim() ? new NeonBetaAccessRepository() : null;
}
