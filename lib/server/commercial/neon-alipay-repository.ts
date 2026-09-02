import { getNeonSql } from "./neon-client";
import type { AlipayOrder, AlipayOrderStore } from "./alipay";
import type { AlipayEntitlementRepository } from "./alipay-entitlement";
import type { AlipayOperatorRepository, SafeOperatorRequest } from "./alipay-operator";
import type { CommercialActor } from "./domain";
import type { PaymentOperationsRepository } from "./payment-operations";

type OrderRow = {
  workspace_id: string; actor_id: string; out_trade_no: string; plan_key: string; amount: string;
  status: "pending" | "paid" | "closed" | "refunded" | "unknown"; provider_trade_no: string | null;
  idempotency_key: string; request_fingerprint: string; checkout_url: string | null; updated_at: string | Date;
};

function fromOrderRow(row: OrderRow): AlipayOrder {
  const status = row.status === "paid" ? "TRADE_SUCCESS" : row.status === "closed" ? "TRADE_CLOSED" : row.status === "refunded" ? "REFUND" : row.status === "pending" ? "WAIT_BUYER_PAY" : "UNKNOWN";
  return { workspaceId: row.workspace_id, actorId: row.actor_id, outTradeNo: row.out_trade_no, idempotencyKey: row.idempotency_key, requestFingerprint: row.request_fingerprint, plan: row.plan_key, amount: row.amount, status, tradeNo: row.provider_trade_no, checkoutUrl: row.checkout_url, updatedAt: new Date(row.updated_at).toISOString() };
}

function databaseStatus(status: AlipayOrder["status"]): OrderRow["status"] {
  return status === "TRADE_SUCCESS" ? "paid" : status === "TRADE_CLOSED" ? "closed" : status === "REFUND" ? "refunded" : status === "WAIT_BUYER_PAY" ? "pending" : "unknown";
}

export class NeonAlipayPaymentRepository implements PaymentOperationsRepository, AlipayOrderStore, AlipayEntitlementRepository, AlipayOperatorRepository {
  async assertOwner(actor: CommercialActor): Promise<void> {
    const sql = getNeonSql(); const rows = await sql`select 1 from workspace_members where workspace_id = ${actor.workspaceId} and subject_id = ${actor.subjectId} and role = 'owner' limit 1` as unknown as unknown[];
    if (!rows[0]) throw Object.assign(new Error("仅工作区所有者可执行此操作。"), { code: "FORBIDDEN", status: 403 });
  }
  async claimRequest(input: { id: string; workspaceId: string; actorId: string; idempotencyKey: string; type: SafeOperatorRequest["type"]; targetRef: string; status: SafeOperatorRequest["status"] }): Promise<SafeOperatorRequest | null> {
    const sql = getNeonSql();
    const inserted = await sql`insert into payment_operator_requests (request_id, workspace_id, actor_id, idempotency_key, operation, target_ref, status, created_at) values (${input.id}, ${input.workspaceId}, ${input.actorId}, ${input.idempotencyKey}, ${input.type}, ${input.targetRef}, ${input.status}, now()) on conflict (workspace_id, idempotency_key) do nothing returning request_id, operation, status, created_at` as unknown as Array<{ request_id: string; operation: SafeOperatorRequest["type"]; status: SafeOperatorRequest["status"]; created_at: string | Date }>;
    if (inserted[0]) return { id: inserted[0].request_id, type: inserted[0].operation, status: inserted[0].status, createdAt: new Date(inserted[0].created_at).toISOString() };
    const rows = await sql`select request_id, operation, status, created_at from payment_operator_requests where workspace_id = ${input.workspaceId} and idempotency_key = ${input.idempotencyKey} and actor_id = ${input.actorId} and operation = ${input.type} limit 1` as unknown as Array<{ request_id: string; operation: SafeOperatorRequest["type"]; status: SafeOperatorRequest["status"]; created_at: string | Date }>;
    return rows[0] ? { id: rows[0].request_id, type: rows[0].operation, status: rows[0].status, createdAt: new Date(rows[0].created_at).toISOString() } : null;
  }
  async list(workspaceId: string): Promise<SafeOperatorRequest[]> {
    const sql = getNeonSql(); const rows = await sql`select request_id, operation, status, created_at from payment_operator_requests where workspace_id = ${workspaceId} order by created_at desc limit 50` as unknown as Array<{ request_id: string; operation: SafeOperatorRequest["type"]; status: SafeOperatorRequest["status"]; created_at: string | Date }>;
    return rows.map((row) => ({ id: row.request_id, type: row.operation, status: row.status, createdAt: new Date(row.created_at).toISOString() }));
  }
  async audit(input: { id: string; workspaceId: string; actorId: string; action: string; resourceId: string }): Promise<void> { const sql = getNeonSql(); await sql`insert into commercial_audit_events (event_id, workspace_id, actor_id, action, resource_id, created_at) values (${input.id}, ${input.workspaceId}, ${input.actorId}, ${input.action}, ${input.resourceId}, now()) on conflict (event_id) do nothing`; }
  async grant(input: { eventId: string; workspaceId: string; outTradeNo: string; plan: string; runLimit: number }): Promise<boolean> {
    const sql = getNeonSql();
    const rows = await sql`with entitlement as (insert into payment_entitlements (event_id, workspace_id, out_trade_no, plan_key, run_limit, status, created_at) values (${input.eventId}, ${input.workspaceId}, ${input.outTradeNo}, ${input.plan}, ${input.runLimit}, 'granted', now()) on conflict do nothing returning workspace_id, run_limit) update workspaces as workspace set run_limit = workspace.run_limit + entitlement.run_limit from entitlement where workspace.id = entitlement.workspace_id returning workspace.id` as unknown as Array<{ id: string }>;
    return Boolean(rows[0]);
  }
  async markReview(input: { eventId: string; workspaceId: string; outTradeNo: string; reason: "closed" | "refund" }): Promise<void> {
    const sql = getNeonSql();
    await sql`insert into payment_entitlements (event_id, workspace_id, out_trade_no, plan_key, run_limit, status, review_reason, created_at) select ${input.eventId}, ${input.workspaceId}, ${input.outTradeNo}, plan_key, 0, 'review', ${input.reason}, now() from payment_orders where out_trade_no = ${input.outTradeNo} and workspace_id = ${input.workspaceId} on conflict (event_id) do nothing`;
  }
  async claim(order: AlipayOrder): Promise<AlipayOrder | null> {
    const sql = getNeonSql();
    const inserted = await sql`insert into payment_orders (workspace_id, actor_id, out_trade_no, provider, plan_key, amount, status, provider_trade_no, checkout_url, idempotency_key, request_fingerprint, created_at, updated_at) values (${order.workspaceId}, ${order.actorId}, ${order.outTradeNo}, 'alipay', ${order.plan}, ${order.amount}, ${databaseStatus(order.status)}, ${order.tradeNo}, ${order.checkoutUrl}, ${order.idempotencyKey}, ${order.requestFingerprint}, now(), now()) on conflict (workspace_id, idempotency_key) do nothing returning out_trade_no` as unknown as Array<{ out_trade_no: string }>;
    if (inserted[0]) return null;
    const existing = await sql`select workspace_id, actor_id, out_trade_no, plan_key, amount, status, provider_trade_no, checkout_url, idempotency_key, request_fingerprint, updated_at from payment_orders where workspace_id = ${order.workspaceId} and idempotency_key = ${order.idempotencyKey} and provider = 'alipay' limit 1` as unknown as OrderRow[];
    return existing[0] ? fromOrderRow(existing[0]) : null;
  }
  async update(order: AlipayOrder): Promise<void> {
    const sql = getNeonSql();
    await sql`update payment_orders set status = ${databaseStatus(order.status)}, provider_trade_no = ${order.tradeNo}, checkout_url = ${order.checkoutUrl}, updated_at = ${order.updatedAt}::timestamptz where workspace_id = ${order.workspaceId} and out_trade_no = ${order.outTradeNo} and provider = 'alipay'`;
  }
  async get(outTradeNo: string): Promise<AlipayOrder | null> {
    const sql = getNeonSql();
    const rows = await sql`select workspace_id, actor_id, out_trade_no, plan_key, amount, status, provider_trade_no, checkout_url, idempotency_key, request_fingerprint, updated_at from payment_orders where out_trade_no = ${outTradeNo} and provider = 'alipay' limit 1` as unknown as OrderRow[];
    return rows[0] ? fromOrderRow(rows[0]) : null;
  }
  async claimRefund(input: { workspaceId: string; outTradeNo: string; refundRequestId: string; amount: string }) {
    const sql = getNeonSql();
    const inserted = await sql`insert into payment_refunds (workspace_id, out_trade_no, refund_request_id, status, amount, created_at, updated_at) values (${input.workspaceId}, ${input.outTradeNo}, ${input.refundRequestId}, 'requested', ${input.amount}, now(), now()) on conflict (workspace_id, refund_request_id) do nothing returning refund_request_id` as unknown as Array<{ refund_request_id: string }>;
    if (inserted[0]) return null;
    const rows = await sql`select status, provider_refund_no from payment_refunds where workspace_id = ${input.workspaceId} and refund_request_id = ${input.refundRequestId} limit 1` as unknown as Array<{ status: "requested" | "processing" | "succeeded" | "failed"; provider_refund_no: string | null }>;
    return rows[0] ? { status: rows[0].status, providerRefundNo: rows[0].provider_refund_no } : null;
  }
  async updateRefund(input: { workspaceId: string; refundRequestId: string; status: "requested" | "processing" | "succeeded" | "failed"; providerRefundNo?: string | null }) {
    const sql = getNeonSql(); await sql`update payment_refunds set status = ${input.status}, provider_refund_no = ${input.providerRefundNo ?? null}, updated_at = now() where workspace_id = ${input.workspaceId} and refund_request_id = ${input.refundRequestId}`;
  }
  async beginReconciliation(input: { provider: "alipay"; reconciliationId: string; periodStart: string; periodEnd: string }) { const sql = getNeonSql(); await sql`insert into payment_reconciliation (provider, reconciliation_id, period_start, period_end, status, created_at) values (${input.provider}, ${input.reconciliationId}, ${input.periodStart}::timestamptz, ${input.periodEnd}::timestamptz, 'pending', now()) on conflict (reconciliation_id) do nothing`; }
  async completeReconciliation(input: { provider: "alipay"; reconciliationId: string; status: "pending" | "matched" | "mismatch" | "failed"; mismatchCount: number }) { const sql = getNeonSql(); await sql`update payment_reconciliation set status = ${input.status}, mismatch_count = ${input.mismatchCount}, completed_at = now() where provider = ${input.provider} and reconciliation_id = ${input.reconciliationId}`; }
}
