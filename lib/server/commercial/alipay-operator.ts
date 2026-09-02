import { createHash } from "node:crypto";
import { CommercialIdempotencyConflictError, CommercialValidationError, type CommercialActor } from "./domain";

export type SafeOperatorRequest = { id: string; type: "refund_review" | "reconciliation"; status: "pending_review" | "pending" | "completed" | "failed"; createdAt: string };
export interface AlipayOperatorRepository {
  assertOwner(actor: CommercialActor): Promise<void>;
  claimRequest(input: { id: string; workspaceId: string; actorId: string; idempotencyKey: string; type: SafeOperatorRequest["type"]; targetRef: string; status: SafeOperatorRequest["status"] }): Promise<SafeOperatorRequest | null>;
  list(workspaceId: string): Promise<SafeOperatorRequest[]>;
  audit(input: { id: string; workspaceId: string; actorId: string; action: string; resourceId: string }): Promise<void>;
}

export class AlipayOperatorService {
  constructor(private readonly repository: AlipayOperatorRepository) {}
  async list(actor: CommercialActor) { await this.repository.assertOwner(actor); return this.repository.list(actor.workspaceId); }
  async create(actor: CommercialActor, body: unknown, idempotencyKey: string | null): Promise<SafeOperatorRequest> {
    await this.repository.assertOwner(actor);
    if (!idempotencyKey || idempotencyKey.length > 128 || !body || typeof body !== "object") throw new CommercialValidationError();
    const value = body as Record<string, unknown>;
    const type = value.type;
    const reference = typeof value.reference === "string" ? value.reference.trim() : "";
    if ((type !== "refund_review" && type !== "reconciliation") || !reference || reference.length > 128 || Object.keys(value).some((key) => !["type", "reference"].includes(key))) throw new CommercialValidationError();
    const id = `op_${createHash("sha256").update(`${actor.workspaceId}:${idempotencyKey}`).digest("hex").slice(0, 24)}`;
    const status = type === "refund_review" ? "pending_review" : "pending";
    const claimed = await this.repository.claimRequest({ id, workspaceId: actor.workspaceId, actorId: actor.subjectId, idempotencyKey, type, targetRef: reference, status });
    if (!claimed) throw new CommercialIdempotencyConflictError();
    await this.repository.audit({ id: `audit_${id}`, workspaceId: actor.workspaceId, actorId: actor.subjectId, action: `alipay.${type}.created`, resourceId: id });
    return claimed;
  }
}

export class InMemoryAlipayOperatorRepository implements AlipayOperatorRepository {
  readonly requests = new Map<string, SafeOperatorRequest>(); readonly audits: string[] = [];
  async assertOwner(actor: CommercialActor) { if (actor.role !== "owner") throw Object.assign(new Error("仅工作区所有者可执行此操作。"), { code: "FORBIDDEN", status: 403 }); }
  async claimRequest(input: { id: string; idempotencyKey: string; type: SafeOperatorRequest["type"]; status: SafeOperatorRequest["status"] }) { const existing = this.requests.get(input.idempotencyKey); if (existing) return existing.type === input.type ? existing : null; const value = { id: input.id, type: input.type, status: input.status, createdAt: new Date(0).toISOString() }; this.requests.set(input.idempotencyKey, value); return value; }
  async list() { return [...this.requests.values()]; }
  async audit(input: { action: string }) { if (!this.audits.includes(input.action)) this.audits.push(input.action); }
}
