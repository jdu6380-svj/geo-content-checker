import Stripe from "stripe";
import { get, put } from "@vercel/blob";
import { createHash } from "node:crypto";

import {
  CommercialDataUnavailableError,
  CommercialIdempotencyConflictError,
  CommercialPaymentUnavailableError,
  CommercialPaymentResponseInvalidError,
  CommercialSignatureInvalidError,
  CommercialSubscriptionManagementUnavailableError,
  commercialIdSchema,
  type CommercialActor,
} from "./domain";
import { getNeonPaymentEventStore } from "./neon-billing-store";

export interface PaymentAdapter {
  createCheckoutSession(input: {
    workspaceId: string;
    actorId: string;
    priceId: string;
    idempotencyKey: string;
  }): Promise<{ checkoutUrl: string; sessionId: string }>;
  createPortalSession(input: {
    workspaceId: string;
    actorId: string;
    idempotencyKey: string;
  }): Promise<{ portalUrl: string }>;
  handleWebhook(payload: string, signature: string): Promise<{ duplicate: boolean; retryable?: boolean }>;
  getSubscription(workspaceId: string): Promise<SubscriptionState | null>;
}

export function resolveStripePlanPrice(plan: string): string | null {
  const entries = process.env.STRIPE_PLAN_PRICE_MAP?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
  for (const entry of entries) {
    const separator = entry.indexOf("=");
    if (separator <= 0 || entry.slice(0, separator).trim() !== plan) continue;
    const priceId = entry.slice(separator + 1).trim();
    if (/^price_[A-Za-z0-9]+$/.test(priceId) && allowedPriceIds()?.has(priceId)) return priceId;
  }
  return null;
}

export function configuredStripePlans(): string[] {
  const entries = process.env.STRIPE_PLAN_PRICE_MAP?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
  return entries.map((entry) => entry.slice(0, entry.indexOf("="))).filter((plan) => /^[A-Za-z0-9_-]+$/.test(plan) && resolveStripePlanPrice(plan) !== null);
}

export interface StorageAdapter {
  putResult(input: { workspaceId: string; runId: string; bytes: Uint8Array; contentType: string }): Promise<{ key: string }>;
  getResult(input: { workspaceId: string; runId: string }): Promise<Uint8Array>;
}

export type SubscriptionState = {
  workspaceId: string;
  customerId: string;
  subscriptionId: string;
  status: string;
  priceId: string | null;
  currentPeriodEnd: string | null;
  updatedAt: string;
  eventCreated?: number;
  entitlementRunLimit?: number;
};

export type CheckoutRecord = {
  workspaceId: string;
  actorId: string;
  idempotencyKey: string;
  requestFingerprint: string;
  priceId: string;
  status: "pending" | "completed";
  sessionId: string | null;
  checkoutUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PortalRecord = {
  workspaceId: string;
  actorId: string;
  idempotencyKey: string;
  requestFingerprint: string;
  status: "pending" | "completed";
  portalUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export interface PaymentEventStore {
  claimEvent(eventId: string, eventType: string): Promise<"claimed" | "duplicate" | "in_progress">;
  completeEvent(eventId: string): Promise<void>;
  failEvent(eventId: string, reason: string): Promise<void>;
  upsertSubscription(state: SubscriptionState): Promise<void>;
  getSubscription(workspaceId: string): Promise<SubscriptionState | null>;
  claimCheckout(record: CheckoutRecord): Promise<CheckoutRecord | null>;
  completeCheckout(record: CheckoutRecord): Promise<void>;
  claimPortal(record: PortalRecord): Promise<PortalRecord | null>;
  completePortal(record: PortalRecord): Promise<void>;
}

export class InMemoryPaymentEventStore implements PaymentEventStore {
  private readonly events = new Map<string, { status: "processing" | "pending" | "completed"; eventType: string }>();
  private readonly subscriptions = new Map<string, SubscriptionState>();
  private readonly checkouts = new Map<string, CheckoutRecord>();
  private readonly portals = new Map<string, PortalRecord>();

  async claimEvent(eventId: string, eventType: string): Promise<"claimed" | "duplicate" | "in_progress"> {
    const existing = this.events.get(eventId);
    if (!existing) {
      this.events.set(eventId, { status: "processing", eventType });
      return "claimed";
    }
    if (existing.status === "completed") return "duplicate";
    if (existing.status === "processing") return "in_progress";
    existing.status = "processing";
    return "claimed";
  }

  async completeEvent(eventId: string): Promise<void> {
    const existing = this.events.get(eventId);
    if (existing) existing.status = "completed";
  }

  async failEvent(eventId: string): Promise<void> {
    const existing = this.events.get(eventId);
    if (existing && existing.status !== "completed") existing.status = "pending";
  }

  async upsertSubscription(state: SubscriptionState): Promise<void> {
    const existing = this.subscriptions.get(state.workspaceId);
    if (existing) {
      const existingCreated = existing.eventCreated ?? 0;
      const nextCreated = state.eventCreated ?? 0;
      const existingLimit = existing.entitlementRunLimit ?? 0;
      const nextLimit = state.entitlementRunLimit ?? 0;
      if (existingCreated > nextCreated || (existingCreated === nextCreated && existingLimit <= nextLimit)) return;
    }
    this.subscriptions.set(state.workspaceId, state);
  }

  async getSubscription(workspaceId: string): Promise<SubscriptionState | null> {
    return this.subscriptions.get(workspaceId) ?? null;
  }

  async claimCheckout(record: CheckoutRecord): Promise<CheckoutRecord | null> {
    const key = record.workspaceId + ":" + record.idempotencyKey;
    const existing = this.checkouts.get(key);
    if (existing) return { ...existing };
    this.checkouts.set(key, { ...record });
    return null;
  }

  async completeCheckout(record: CheckoutRecord): Promise<void> {
    const key = record.workspaceId + ":" + record.idempotencyKey;
    this.checkouts.set(key, { ...record, status: "completed", updatedAt: new Date().toISOString() });
  }

  async claimPortal(record: PortalRecord): Promise<PortalRecord | null> {
    const key = record.workspaceId + ":" + record.idempotencyKey;
    const existing = this.portals.get(key);
    if (existing) return { ...existing };
    this.portals.set(key, { ...record });
    return null;
  }

  async completePortal(record: PortalRecord): Promise<void> {
    const key = record.workspaceId + ":" + record.idempotencyKey;
    this.portals.set(key, { ...record, status: "completed", updatedAt: new Date().toISOString() });
  }
}

type StripeClientLike = Pick<Stripe, "billingPortal" | "checkout" | "webhooks">;

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function workspaceFromMetadata(metadata: Stripe.Metadata | null | undefined): string | null {
  const candidate = metadata?.workspace_id;
  return typeof candidate === "string" && commercialIdSchema.safeParse(candidate).success ? candidate : null;
}

function subscriptionStateFromStripe(
  subscription: Stripe.Subscription,
  workspaceId: string,
  eventCreated?: number,
): SubscriptionState {
  const item = subscription.items.data[0];
  const state: SubscriptionState = {
    workspaceId,
    customerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
    subscriptionId: subscription.id,
    status: subscription.status,
    priceId: item?.price.id ?? null,
    currentPeriodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null,
    updatedAt: new Date().toISOString(),
    eventCreated,
  };
  state.entitlementRunLimit = entitlementRunLimit(state);
  return state;
}

function priceRunLimitMap(): Map<string, number> {
  const entries = process.env.STRIPE_PRICE_ID_RUN_LIMITS?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
  const result = new Map<string, number>();
  for (const entry of entries) {
    const separator = entry.indexOf("=");
    if (separator <= 0) continue;
    const priceId = entry.slice(0, separator).trim();
    const limit = Number(entry.slice(separator + 1).trim());
    if (/^price_[A-Za-z0-9]+$/.test(priceId) && Number.isSafeInteger(limit) && limit >= 0) result.set(priceId, limit);
  }
  return result;
}

function entitlementRunLimit(state: SubscriptionState): number {
  if (state.status !== "active" && state.status !== "trialing") return 0;
  if (!state.currentPeriodEnd || new Date(state.currentPeriodEnd).getTime() <= Date.now()) return 0;
  if (!state.priceId) return 0;
  return priceRunLimitMap().get(state.priceId) ?? 0;
}

export class StripePaymentAdapter implements PaymentAdapter {
  constructor(
    private readonly client: StripeClientLike,
    private readonly webhookSecret: string,
    private readonly appUrl: string,
    private readonly events: PaymentEventStore,
  ) {}

  async createCheckoutSession(input: {
    workspaceId: string;
    actorId: string;
    priceId: string;
    idempotencyKey: string;
  }): Promise<{ checkoutUrl: string; sessionId: string }> {
    const allowed = allowedPriceIds();
    if (!allowed || !allowed.has(input.priceId)) throw new CommercialPaymentUnavailableError();
    const now = new Date().toISOString();
    const requestFingerprint = createHash("sha256")
      .update(JSON.stringify({ workspaceId: input.workspaceId, actorId: input.actorId, priceId: input.priceId }))
      .digest("hex");
    const reservation: CheckoutRecord = {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint,
      priceId: input.priceId,
      status: "pending",
      sessionId: null,
      checkoutUrl: null,
      createdAt: now,
      updatedAt: now,
    };
    const existing = await this.events.claimCheckout(reservation);
    if (existing) {
      if (
        existing.actorId !== reservation.actorId ||
        existing.requestFingerprint !== reservation.requestFingerprint ||
        existing.priceId !== reservation.priceId
      ) {
        const { CommercialIdempotencyConflictError } = await import("./domain");
        throw new CommercialIdempotencyConflictError();
      }
      if (existing.status === "completed" && existing.sessionId && existing.checkoutUrl) {
        return { checkoutUrl: existing.checkoutUrl, sessionId: existing.sessionId };
      }
    }
    const existingSubscription = await this.events.getSubscription(input.workspaceId);
    const customerId = existingSubscription?.customerId || undefined;
    const session = await this.client.checkout.sessions.create(
      {
        mode: "subscription",
        ...(customerId ? { customer: customerId } : {}),
        line_items: [{ price: input.priceId, quantity: 1 }],
        success_url: `${this.appUrl}/dashboard?billing=success`,
        cancel_url: `${this.appUrl}/dashboard?billing=cancelled`,
        metadata: { workspace_id: input.workspaceId },
        subscription_data: { metadata: { workspace_id: input.workspaceId } },
      },
      { idempotencyKey: input.idempotencyKey },
    );
    if (!session.url || !isHttpsUrl(session.url)) throw new CommercialPaymentResponseInvalidError();
    await this.events.completeCheckout({
      ...reservation,
      status: "completed",
      sessionId: session.id,
      checkoutUrl: session.url,
      updatedAt: new Date().toISOString(),
    });
    return { checkoutUrl: session.url, sessionId: session.id };
  }

  async createPortalSession(input: {
    workspaceId: string;
    actorId: string;
    idempotencyKey: string;
  }): Promise<{ portalUrl: string }> {
    const subscription = await this.events.getSubscription(input.workspaceId);
    const active = subscription?.status === "active" || subscription?.status === "trialing";
    const currentPeriodEnd = subscription?.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).getTime() : Number.NaN;
    if (!subscription || !active || !subscription.customerId || !Number.isFinite(currentPeriodEnd) || currentPeriodEnd <= Date.now()) {
      throw new CommercialSubscriptionManagementUnavailableError();
    }

    const now = new Date().toISOString();
    const requestFingerprint = createHash("sha256")
      .update(JSON.stringify({ workspaceId: input.workspaceId, actorId: input.actorId, intent: "subscription.manage" }))
      .digest("hex");
    const reservation: PortalRecord = {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint,
      status: "pending",
      portalUrl: null,
      createdAt: now,
      updatedAt: now,
    };
    const existing = await this.events.claimPortal(reservation);
    if (existing) {
      if (existing.actorId !== reservation.actorId || existing.requestFingerprint !== reservation.requestFingerprint) {
        throw new CommercialIdempotencyConflictError();
      }
      if (existing.status === "completed" && existing.portalUrl) {
        if (!isHttpsUrl(existing.portalUrl)) throw new CommercialPaymentResponseInvalidError();
        return { portalUrl: existing.portalUrl };
      }
    }

    const session = await this.client.billingPortal.sessions.create(
      { customer: subscription.customerId, return_url: `${this.appUrl}/dashboard?billing=portal-return` },
      { idempotencyKey: input.idempotencyKey },
    );
    if (!session.url || !isHttpsUrl(session.url)) throw new CommercialPaymentResponseInvalidError();
    await this.events.completePortal({
      ...reservation,
      status: "completed",
      portalUrl: session.url,
      updatedAt: new Date().toISOString(),
    });
    return { portalUrl: session.url };
  }

  async handleWebhook(payload: string, signature: string): Promise<{ duplicate: boolean; retryable?: boolean }> {
    let event: Stripe.Event;
    try {
      event = this.client.webhooks.constructEvent(payload, signature, this.webhookSecret);
    } catch {
      throw new CommercialSignatureInvalidError();
    }
    const claim = await this.events.claimEvent(event.id, event.type);
    if (claim === "duplicate") return { duplicate: true };
    if (claim === "in_progress") return { duplicate: false, retryable: true };
    try {
      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        const workspaceId = workspaceFromMetadata(session.metadata);
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
        if (!workspaceId || !subscriptionId || !customerId) throw new CommercialDataUnavailableError();
      }

      if (
        event.type === "customer.subscription.created" ||
        event.type === "customer.subscription.updated" ||
        event.type === "customer.subscription.deleted"
      ) {
        const subscription = event.data.object as Stripe.Subscription;
        const workspaceId = workspaceFromMetadata(subscription.metadata);
        if (!workspaceId) throw new CommercialDataUnavailableError();
        await this.events.upsertSubscription(subscriptionStateFromStripe(subscription, workspaceId, event.created));
      }
      await this.events.completeEvent(event.id);
      return { duplicate: false };
    } catch (error) {
      const failureCode = error && typeof error === "object" && "code" in error && typeof error.code === "string"
        ? error.code
        : "PAYMENT_EVENT_FAILED";
      await this.events.failEvent(event.id, failureCode);
      throw error;
    }
  }

  getSubscription(workspaceId: string): Promise<SubscriptionState | null> {
    return this.events.getSubscription(workspaceId);
  }
}

let stripeAdapter: { key: string; adapter: StripePaymentAdapter } | null = null;

export function getConfiguredStripeAdapter(): StripePaymentAdapter | null {
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (
    !secret ||
    !webhookSecret ||
    !appUrl ||
    !isHttpsUrl(appUrl) ||
    process.env.COMMERCIAL_PAYMENT_EVENT_STORE !== "neon" && process.env.NODE_ENV === "production"
  ) return null;
  let eventStore: PaymentEventStore | null = null;
  if (process.env.COMMERCIAL_DATA_ADAPTER === "neon" && process.env.COMMERCIAL_PAYMENT_EVENT_STORE === "neon") {
    eventStore = getNeonPaymentEventStore();
  } else if (process.env.NODE_ENV !== "production" && process.env.COMMERCIAL_PAYMENT_EVENT_STORE === "memory") {
    eventStore = new InMemoryPaymentEventStore();
  }
  if (!eventStore) return null;
  const key = createHash("sha256")
    .update([
      secret,
      webhookSecret,
      appUrl,
      process.env.COMMERCIAL_DATA_ADAPTER ?? "",
      process.env.COMMERCIAL_PAYMENT_EVENT_STORE ?? "",
      process.env.STRIPE_PRICE_ID_ALLOWLIST ?? "",
      process.env.STRIPE_PRICE_ID_RUN_LIMITS ?? "",
    ].join("\0"))
    .digest("hex");
  if (!stripeAdapter || stripeAdapter.key !== key) {
    stripeAdapter = { key, adapter: new StripePaymentAdapter(new Stripe(secret), webhookSecret, appUrl, eventStore) };
  }
  return stripeAdapter.adapter;
}

function allowedPriceIds(): Set<string> | null {
  const values = process.env.STRIPE_PRICE_ID_ALLOWLIST
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return values?.length ? new Set(values) : null;
}

export class UnconfiguredPaymentAdapter implements PaymentAdapter {
  async createCheckoutSession(): Promise<{ checkoutUrl: string; sessionId: string }> {
    throw new CommercialDataUnavailableError();
  }

  async createPortalSession(): Promise<{ portalUrl: string }> {
    throw new CommercialDataUnavailableError();
  }

  async handleWebhook(): Promise<{ duplicate: boolean }> {
    throw new CommercialDataUnavailableError();
  }

  async getSubscription(): Promise<SubscriptionState | null> {
    throw new CommercialDataUnavailableError();
  }
}

export class UnconfiguredStorageAdapter implements StorageAdapter {
  async putResult(): Promise<{ key: string }> {
    throw new CommercialDataUnavailableError();
  }

  async getResult(): Promise<Uint8Array> {
    throw new CommercialDataUnavailableError();
  }
}

type BlobTransport = {
  put: typeof put;
  get: typeof get;
};

export class VercelBlobStorageAdapter implements StorageAdapter {
  constructor(
    private readonly token: string,
    private readonly transport: BlobTransport = { put, get },
    private readonly runWorkspaceLookup?: (runId: string) => Promise<string | null>,
  ) {}

  private path(workspaceId: string, runId: string): string {
    const workspace = commercialIdSchema.parse(workspaceId);
    const run = commercialIdSchema.parse(runId);
    return `workspaces/${workspace}/runs/${run}/result.bin`;
  }

  async putResult(input: { workspaceId: string; runId: string; bytes: Uint8Array; contentType: string }): Promise<{ key: string }> {
    await this.assertRunOwnership(input.workspaceId, input.runId);
    const result = await this.transport.put(this.path(input.workspaceId, input.runId), Buffer.from(input.bytes), {
      access: "private",
      token: this.token,
      contentType: input.contentType,
      addRandomSuffix: false,
      allowOverwrite: false,
    });
    return { key: result.pathname || result.url };
  }

  async getResult(input: { workspaceId: string; runId: string }): Promise<Uint8Array> {
    await this.assertRunOwnership(input.workspaceId, input.runId);
    const result = await this.transport.get(this.path(input.workspaceId, input.runId), { access: "private", token: this.token });
    if (!result || result.statusCode !== 200) throw new CommercialDataUnavailableError();
    const reader = result.stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        chunks.push(next.value);
        total += next.value.byteLength;
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  }

  private async assertRunOwnership(workspaceId: string, runId: string): Promise<void> {
    if (!this.runWorkspaceLookup) return;
    if ((await this.runWorkspaceLookup(runId)) !== workspaceId) throw new CommercialDataUnavailableError();
  }
}

let blobAdapter: { key: string; adapter: VercelBlobStorageAdapter } | null = null;

export function getConfiguredBlobAdapter(): VercelBlobStorageAdapter | null {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token || process.env.COMMERCIAL_STORAGE_ADAPTER !== "vercel-blob") return null;
  if (process.env.NODE_ENV === "production" && process.env.COMMERCIAL_DATA_ADAPTER !== "neon") return null;
  const key = createHash("sha256")
    .update([token, process.env.COMMERCIAL_DATA_ADAPTER ?? "", process.env.COMMERCIAL_STORAGE_ADAPTER ?? ""].join("\0"))
    .digest("hex");
  if (!blobAdapter || blobAdapter.key !== key) {
    const lookup = process.env.COMMERCIAL_DATA_ADAPTER === "neon"
      ? async (runId: string) => (await import("./neon-repository")).getNeonCommercialRepository()?.getRunWorkspace(runId) ?? null
      : undefined;
    blobAdapter = { key, adapter: new VercelBlobStorageAdapter(token, { put, get }, lookup) };
  }
  return blobAdapter.adapter;
}
