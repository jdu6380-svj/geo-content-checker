import { getCommercialDatabaseUrl, getNeonSql } from "./neon-client";
import { CommercialDataUnavailableError } from "./domain";
import type { CheckoutRecord, PaymentEventStore, PortalRecord, SubscriptionState } from "./providers";

type EventRow = {
  status: "processing" | "pending" | "completed";
  lease_until: string | Date | null;
};

export class NeonPaymentEventStore implements PaymentEventStore {
  async claimEvent(eventId: string, eventType: string): Promise<"claimed" | "duplicate" | "in_progress"> {
    const sql = getNeonSql();
    const inserted = (await sql`
      insert into billing_events (event_id, event_type, status, received_at, attempts, lease_until)
      values (${eventId}, ${eventType}, 'processing', now(), 1, now() + interval '5 minutes')
      on conflict (event_id) do nothing
      returning event_id
    `) as unknown as Array<{ event_id: string }>;
    if (inserted[0]) return "claimed";

    const rows = (await sql`
      select status, lease_until from billing_events where event_id = ${eventId} limit 1
    `) as unknown as EventRow[];
    const existing = rows[0];
    if (!existing) throw new CommercialDataUnavailableError();
    if (existing.status === "completed") return "duplicate";
    const leaseExpired = !existing.lease_until || new Date(existing.lease_until).getTime() <= Date.now();
    if (!leaseExpired) return "in_progress";
    const reclaimed = (await sql`
      update billing_events
      set status = 'processing', lease_until = now() + interval '5 minutes', attempts = attempts + 1, last_error = null
      where event_id = ${eventId} and status <> 'completed'
        and (lease_until is null or lease_until <= now())
      returning event_id
    `) as unknown as Array<{ event_id: string }>;
    return reclaimed[0] ? "claimed" : "duplicate";
  }

  async completeEvent(eventId: string): Promise<void> {
    const sql = getNeonSql();
    await sql`
      update billing_events
      set status = 'completed', completed_at = now(), lease_until = null, last_error = null
      where event_id = ${eventId}
    `;
  }

  async failEvent(eventId: string, reason: string): Promise<void> {
    const sql = getNeonSql();
    await sql`
      update billing_events
      set status = 'pending', lease_until = null, last_error = ${reason.slice(0, 500)}
      where event_id = ${eventId} and status <> 'completed'
    `;
  }

  async upsertSubscription(state: SubscriptionState): Promise<void> {
    const sql = getNeonSql();
    await sql`
      with upserted as (
        insert into subscriptions (workspace_id, customer_id, subscription_id, status, price_id, current_period_end, entitlement_run_limit, event_created, updated_at)
      values (${state.workspaceId}, ${state.customerId}, ${state.subscriptionId}, ${state.status}, ${state.priceId}, ${state.currentPeriodEnd}::timestamptz, ${state.entitlementRunLimit ?? 0}, ${state.eventCreated ?? 0}, ${state.updatedAt}::timestamptz)
      on conflict (workspace_id) do update set
        customer_id = case when excluded.event_created > subscriptions.event_created or (excluded.event_created = subscriptions.event_created and excluded.entitlement_run_limit < subscriptions.entitlement_run_limit) then excluded.customer_id else subscriptions.customer_id end,
        subscription_id = case when excluded.event_created > subscriptions.event_created or (excluded.event_created = subscriptions.event_created and excluded.entitlement_run_limit < subscriptions.entitlement_run_limit) then excluded.subscription_id else subscriptions.subscription_id end,
        status = case when excluded.event_created > subscriptions.event_created or (excluded.event_created = subscriptions.event_created and excluded.entitlement_run_limit < subscriptions.entitlement_run_limit) then excluded.status else subscriptions.status end,
        price_id = case when excluded.event_created > subscriptions.event_created or (excluded.event_created = subscriptions.event_created and excluded.entitlement_run_limit < subscriptions.entitlement_run_limit) then excluded.price_id else subscriptions.price_id end,
        current_period_end = case when excluded.event_created > subscriptions.event_created or (excluded.event_created = subscriptions.event_created and excluded.entitlement_run_limit < subscriptions.entitlement_run_limit) then excluded.current_period_end else subscriptions.current_period_end end,
        entitlement_run_limit = case when excluded.event_created > subscriptions.event_created or (excluded.event_created = subscriptions.event_created and excluded.entitlement_run_limit < subscriptions.entitlement_run_limit) then excluded.entitlement_run_limit else subscriptions.entitlement_run_limit end,
        event_created = greatest(subscriptions.event_created, excluded.event_created),
        updated_at = case when excluded.event_created > subscriptions.event_created or (excluded.event_created = subscriptions.event_created and excluded.entitlement_run_limit < subscriptions.entitlement_run_limit) then excluded.updated_at else subscriptions.updated_at end
        returning workspace_id, event_created
      )
      update workspaces as workspace
      set run_limit = subscription.entitlement_run_limit
      from upserted
      join subscriptions as subscription on subscription.workspace_id = upserted.workspace_id
      where workspace.id = upserted.workspace_id
    `;
  }

  async getSubscription(workspaceId: string): Promise<SubscriptionState | null> {
    const sql = getNeonSql();
    const rows = (await sql`
      select workspace_id, customer_id, subscription_id, status, price_id, current_period_end, entitlement_run_limit, event_created, updated_at
      from subscriptions where workspace_id = ${workspaceId} limit 1
    `) as unknown as Array<{
      workspace_id: string;
      customer_id: string;
      subscription_id: string;
      status: string;
      price_id: string | null;
      current_period_end: string | Date | null;
      event_created: number;
      entitlement_run_limit: number;
      updated_at: string | Date;
    }>;
    const row = rows[0];
    return row
      ? {
          workspaceId: row.workspace_id,
          customerId: row.customer_id,
          subscriptionId: row.subscription_id,
          status: row.status,
          priceId: row.price_id,
          currentPeriodEnd: row.current_period_end ? new Date(row.current_period_end).toISOString() : null,
      eventCreated: Number(row.event_created),
      updatedAt: new Date(row.updated_at).toISOString(),
      entitlementRunLimit: Number(row.entitlement_run_limit),
        }
      : null;
  }

  async claimCheckout(record: CheckoutRecord): Promise<CheckoutRecord | null> {
    const sql = getNeonSql();
    const inserted = (await sql`
      insert into checkout_idempotency
        (workspace_id, idempotency_key, actor_id, request_fingerprint, price_id, status, created_at, updated_at)
      values (${record.workspaceId}, ${record.idempotencyKey}, ${record.actorId}, ${record.requestFingerprint}, ${record.priceId}, 'pending', now(), now())
      on conflict (workspace_id, idempotency_key) do nothing
      returning workspace_id
    `) as unknown as Array<{ workspace_id: string }>;
    if (inserted[0]) return null;
    const rows = (await sql`
      select workspace_id, idempotency_key, actor_id, request_fingerprint, price_id, status, session_id, checkout_url, created_at, updated_at
      from checkout_idempotency
      where workspace_id = ${record.workspaceId} and idempotency_key = ${record.idempotencyKey}
      limit 1
    `) as unknown as CheckoutRow[];
    return rows[0] ? checkoutFromRow(rows[0]) : null;
  }

  async completeCheckout(record: CheckoutRecord): Promise<void> {
    if (!record.sessionId || !record.checkoutUrl) throw new CommercialDataUnavailableError();
    const sql = getNeonSql();
    const updated = (await sql`
      update checkout_idempotency
      set status = 'completed', session_id = ${record.sessionId}, checkout_url = ${record.checkoutUrl}, updated_at = now()
      where workspace_id = ${record.workspaceId}
        and idempotency_key = ${record.idempotencyKey}
        and actor_id = ${record.actorId}
        and request_fingerprint = ${record.requestFingerprint}
      returning workspace_id
    `) as unknown as Array<{ workspace_id: string }>;
    if (!updated[0]) throw new CommercialDataUnavailableError();
  }

  async claimPortal(record: PortalRecord): Promise<PortalRecord | null> {
    const sql = getNeonSql();
    const inserted = (await sql`
      insert into portal_idempotency
        (workspace_id, idempotency_key, actor_id, request_fingerprint, status, created_at, updated_at)
      values (${record.workspaceId}, ${record.idempotencyKey}, ${record.actorId}, ${record.requestFingerprint}, 'pending', now(), now())
      on conflict (workspace_id, idempotency_key) do nothing
      returning workspace_id
    `) as unknown as Array<{ workspace_id: string }>;
    if (inserted[0]) return null;
    const rows = (await sql`
      select workspace_id, idempotency_key, actor_id, request_fingerprint, status, portal_url, created_at, updated_at
      from portal_idempotency
      where workspace_id = ${record.workspaceId} and idempotency_key = ${record.idempotencyKey}
      limit 1
    `) as unknown as PortalRow[];
    return rows[0] ? portalFromRow(rows[0]) : null;
  }

  async completePortal(record: PortalRecord): Promise<void> {
    if (!record.portalUrl) throw new CommercialDataUnavailableError();
    const sql = getNeonSql();
    const updated = (await sql`
      update portal_idempotency
      set status = 'completed', portal_url = ${record.portalUrl}, updated_at = now()
      where workspace_id = ${record.workspaceId}
        and idempotency_key = ${record.idempotencyKey}
        and actor_id = ${record.actorId}
        and request_fingerprint = ${record.requestFingerprint}
      returning workspace_id
    `) as unknown as Array<{ workspace_id: string }>;
    if (!updated[0]) throw new CommercialDataUnavailableError();
  }
}

type CheckoutRow = {
  workspace_id: string;
  idempotency_key: string;
  actor_id: string;
  request_fingerprint: string;
  price_id: string;
  status: CheckoutRecord["status"];
  session_id: string | null;
  checkout_url: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

function checkoutFromRow(row: CheckoutRow): CheckoutRecord {
  return {
    workspaceId: row.workspace_id,
    idempotencyKey: row.idempotency_key,
    actorId: row.actor_id,
    requestFingerprint: row.request_fingerprint,
    priceId: row.price_id,
    status: row.status,
    sessionId: row.session_id,
    checkoutUrl: row.checkout_url,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

type PortalRow = {
  workspace_id: string;
  idempotency_key: string;
  actor_id: string;
  request_fingerprint: string;
  status: PortalRecord["status"];
  portal_url: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

function portalFromRow(row: PortalRow): PortalRecord {
  return {
    workspaceId: row.workspace_id,
    idempotencyKey: row.idempotency_key,
    actorId: row.actor_id,
    requestFingerprint: row.request_fingerprint,
    status: row.status,
    portalUrl: row.portal_url,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export function getNeonPaymentEventStore(): NeonPaymentEventStore | null {
  return getCommercialDatabaseUrl() ? new NeonPaymentEventStore() : null;
}
