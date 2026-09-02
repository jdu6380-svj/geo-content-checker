import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  CommercialDataUnavailableError,
  CommercialIdempotencyConflictError,
  CommercialPaymentResponseInvalidError,
  CommercialPaymentUnavailableError,
} from "@/lib/server/commercial/domain";
import {
  InMemoryPaymentEventStore,
  StripePaymentAdapter,
  VercelBlobStorageAdapter,
} from "@/lib/server/commercial/providers";

function checkoutClient() {
  const create = vi.fn().mockResolvedValue({ id: "cs_test", url: "https://checkout.test/session" });
  const portalCreate = vi.fn().mockResolvedValue({ url: "https://billing.test/session" });
  return {
    checkout: { sessions: { create } },
    billingPortal: { sessions: { create: portalCreate } },
    webhooks: { constructEvent: vi.fn() },
    create,
    portalCreate,
  };
}

function event(id: string, type: string, object: unknown, created = 1): unknown {
  return { id, type, created, data: { object } };
}

describe("commercial payment adapters", () => {
  beforeEach(() => {
    process.env.STRIPE_PRICE_ID_ALLOWLIST = "price_allowed";
  });

  afterEach(() => {
    delete process.env.STRIPE_PRICE_ID_ALLOWLIST;
    delete process.env.STRIPE_PRICE_ID_RUN_LIMITS;
  });

  it("binds checkout idempotency to actor and reuses completed sessions", async () => {
    const client = checkoutClient();
    const store = new InMemoryPaymentEventStore();
    const adapter = new StripePaymentAdapter(client as never, "whsec_test", "https://app.test", store);
    const input = { workspaceId: "workspace_1", actorId: "user_1", priceId: "price_allowed", idempotencyKey: "checkout_1" };
    const first = await adapter.createCheckoutSession(input);
    const replay = await adapter.createCheckoutSession(input);
    expect(replay).toEqual(first);
    expect(client.create).toHaveBeenCalledTimes(1);
    await expect(adapter.createCheckoutSession({ ...input, actorId: "user_2" })).rejects.toBeInstanceOf(
      CommercialIdempotencyConflictError,
    );
  });

  it("rejects prices outside the server allowlist", async () => {
    const adapter = new StripePaymentAdapter(checkoutClient() as never, "whsec_test", "https://app.test", new InMemoryPaymentEventStore());
    await expect(
      adapter.createCheckoutSession({
        workspaceId: "workspace_1",
        actorId: "user_1",
        priceId: "price_client_supplied",
        idempotencyKey: "checkout_1",
      }),
    ).rejects.toBeInstanceOf(CommercialPaymentUnavailableError);
  });

  it("derives an existing customer server-side and rejects insecure checkout URLs", async () => {
    const client = checkoutClient();
    const store = new InMemoryPaymentEventStore();
    await store.upsertSubscription({
      workspaceId: "workspace_1", customerId: "cus_private", subscriptionId: "sub_1", status: "active",
      priceId: "price_allowed", currentPeriodEnd: new Date(Date.now() + 3_600_000).toISOString(), updatedAt: new Date().toISOString(),
    });
    const adapter = new StripePaymentAdapter(client as never, "whsec_test", "https://app.test", store);
    await adapter.createCheckoutSession({
      workspaceId: "workspace_1", actorId: "user_1", priceId: "price_allowed", idempotencyKey: "checkout_customer",
    });
    expect(client.create.mock.calls[0][0]).toMatchObject({ customer: "cus_private" });

    const insecureClient = checkoutClient();
    insecureClient.create.mockResolvedValue({ id: "cs_test", url: "http://checkout.test/session" });
    const insecure = new StripePaymentAdapter(insecureClient as never, "whsec_test", "https://app.test", new InMemoryPaymentEventStore());
    await expect(insecure.createCheckoutSession({
      workspaceId: "workspace_1", actorId: "user_1", priceId: "price_allowed", idempotencyKey: "checkout_http",
    })).rejects.toBeInstanceOf(CommercialPaymentResponseInvalidError);
  });

  it("leaves failed events retryable and suppresses only completed duplicates", async () => {
    const client = checkoutClient();
    const store = new InMemoryPaymentEventStore();
    const adapter = new StripePaymentAdapter(client as never, "whsec_test", "https://app.test", store);
    const constructEvent = client.webhooks.constructEvent as ReturnType<typeof vi.fn>;
    let current = event("evt_1", "customer.subscription.updated", { metadata: {} });
    constructEvent.mockImplementation(() => current);
    await expect(adapter.handleWebhook("raw", "sig")).rejects.toBeInstanceOf(CommercialDataUnavailableError);

    current = event(
      "evt_1",
      "customer.subscription.updated",
      {
        id: "sub_1",
        customer: "cus_1",
        status: "active",
        metadata: { workspace_id: "workspace_1" },
        items: { data: [{ price: { id: "price_allowed" }, current_period_end: 2 }] },
      },
      10,
    );
    await expect(adapter.handleWebhook("raw", "sig")).resolves.toEqual({ duplicate: false });
    await expect(adapter.handleWebhook("raw", "sig")).resolves.toEqual({ duplicate: true });
  });

  it("reports an in-flight event as retryable instead of completing it", async () => {
    const store = new InMemoryPaymentEventStore();
    expect(await store.claimEvent("evt_inflight", "customer.subscription.updated")).toBe("claimed");
    expect(await store.claimEvent("evt_inflight", "customer.subscription.updated")).toBe("in_progress");
    expect(await store.claimEvent("evt_inflight", "customer.subscription.updated")).toBe("in_progress");
    await store.completeEvent("evt_inflight");
    expect(await store.claimEvent("evt_inflight", "customer.subscription.updated")).toBe("duplicate");
  });

  it("keeps newer subscription events when delivery order is reversed", async () => {
    const client = checkoutClient();
    const store = new InMemoryPaymentEventStore();
    const adapter = new StripePaymentAdapter(client as never, "whsec_test", "https://app.test", store);
    const constructEvent = client.webhooks.constructEvent as ReturnType<typeof vi.fn>;
    const newer = event(
      "evt_new",
      "customer.subscription.updated",
      {
        id: "sub_new",
        customer: "cus_1",
        status: "active",
        metadata: { workspace_id: "workspace_1" },
        items: { data: [{ price: { id: "price_allowed" }, current_period_end: 2 }] },
      },
      20,
    );
    const older = event(
      "evt_old",
      "customer.subscription.updated",
      {
        id: "sub_old",
        customer: "cus_1",
        status: "past_due",
        metadata: { workspace_id: "workspace_1" },
        items: { data: [{ price: { id: "price_allowed" }, current_period_end: 1 }] },
      },
      10,
    );
    constructEvent.mockReturnValueOnce(newer).mockReturnValueOnce(older);
    await adapter.handleWebhook("raw", "sig");
    await adapter.handleWebhook("raw", "sig");
    expect(await adapter.getSubscription("workspace_1")).toMatchObject({ status: "active", eventCreated: 20 });
  });

  it("records zero entitlement for inactive or expired subscriptions and maps active prices", async () => {
    process.env.STRIPE_PRICE_ID_RUN_LIMITS = "price_allowed=10";
    const client = checkoutClient();
    const store = new InMemoryPaymentEventStore();
    const adapter = new StripePaymentAdapter(client as never, "whsec_test", "https://app.test", store);
    const constructEvent = client.webhooks.constructEvent as ReturnType<typeof vi.fn>;
    constructEvent.mockReturnValueOnce(event("evt_active", "customer.subscription.updated", {
      id: "sub_1", customer: "cus_1", status: "active", metadata: { workspace_id: "workspace_1" },
      items: { data: [{ price: { id: "price_allowed" }, current_period_end: Math.floor(Date.now() / 1000) + 3600 }] },
    }, 20));
    await adapter.handleWebhook("raw", "sig");
    expect(await adapter.getSubscription("workspace_1")).toMatchObject({ entitlementRunLimit: 10 });

    constructEvent.mockReturnValueOnce(event("evt_past_due", "customer.subscription.updated", {
      id: "sub_1", customer: "cus_1", status: "past_due", metadata: { workspace_id: "workspace_1" },
      items: { data: [{ price: { id: "price_allowed" }, current_period_end: Math.floor(Date.now() / 1000) + 3600 }] },
    }, 30));
    await adapter.handleWebhook("raw", "sig");
    expect(await adapter.getSubscription("workspace_1")).toMatchObject({ entitlementRunLimit: 0, status: "past_due" });
  });

  it("does not re-grant entitlement from an equal-timestamp out-of-order event", async () => {
    process.env.STRIPE_PRICE_ID_RUN_LIMITS = "price_allowed=10";
    const client = checkoutClient();
    const adapter = new StripePaymentAdapter(client as never, "whsec_test", "https://app.test", new InMemoryPaymentEventStore());
    const constructEvent = client.webhooks.constructEvent as ReturnType<typeof vi.fn>;
    const subscription = (status: string) => ({
      id: "sub_1", customer: "cus_1", status, metadata: { workspace_id: "workspace_1" },
      items: { data: [{ price: { id: "price_allowed" }, current_period_end: Math.floor(Date.now() / 1000) + 3600 }] },
    });
    constructEvent
      .mockReturnValueOnce(event("evt_active", "customer.subscription.updated", subscription("active"), 20))
      .mockReturnValueOnce(event("evt_past_due", "customer.subscription.updated", subscription("past_due"), 20))
      .mockReturnValueOnce(event("evt_active_replay", "customer.subscription.updated", subscription("active"), 20));
    await adapter.handleWebhook("raw", "sig");
    await adapter.handleWebhook("raw", "sig");
    await adapter.handleWebhook("raw", "sig");
    expect(await adapter.getSubscription("workspace_1")).toMatchObject({ status: "past_due", entitlementRunLimit: 0 });
  });

  it("derives customer server-side and reuses an idempotent HTTPS portal session", async () => {
    const client = checkoutClient();
    const store = new InMemoryPaymentEventStore();
    const adapter = new StripePaymentAdapter(client as never, "whsec_test", "https://app.test", store);
    await store.upsertSubscription({
      workspaceId: "workspace_1", customerId: "cus_private", subscriptionId: "sub_1", status: "active",
      priceId: "price_allowed", currentPeriodEnd: new Date(Date.now() + 3_600_000).toISOString(), updatedAt: new Date().toISOString(),
    });
    const first = await adapter.createPortalSession({ workspaceId: "workspace_1", actorId: "user_1", idempotencyKey: "portal_1" });
    const replay = await adapter.createPortalSession({ workspaceId: "workspace_1", actorId: "user_1", idempotencyKey: "portal_1" });
    expect(first).toEqual({ portalUrl: "https://billing.test/session" });
    expect(replay).toEqual(first);
    expect(client.portalCreate).toHaveBeenCalledTimes(1);
    expect(client.portalCreate.mock.calls[0][0]).toMatchObject({ customer: "cus_private" });
  });

  it("fails closed for missing or inactive subscriptions and invalid portal URLs", async () => {
    const missing = new StripePaymentAdapter(checkoutClient() as never, "whsec_test", "https://app.test", new InMemoryPaymentEventStore());
    await expect(missing.createPortalSession({ workspaceId: "workspace_1", actorId: "user_1", idempotencyKey: "portal_missing" })).rejects.toThrow("没有可管理");

    const client = checkoutClient();
    client.portalCreate.mockResolvedValue({ url: "http://billing.test/session" });
    const store = new InMemoryPaymentEventStore();
    await store.upsertSubscription({
      workspaceId: "workspace_1", customerId: "cus_private", subscriptionId: "sub_1", status: "active",
      priceId: "price_allowed", currentPeriodEnd: new Date(Date.now() + 3_600_000).toISOString(), updatedAt: new Date().toISOString(),
    });
    const adapter = new StripePaymentAdapter(client as never, "whsec_test", "https://app.test", store);
    await expect(adapter.createPortalSession({ workspaceId: "workspace_1", actorId: "user_1", idempotencyKey: "portal_http" })).rejects.toThrow("无法验证");
  });
});

describe("private blob adapter", () => {
  it("checks persisted run ownership before reading or writing", async () => {
    const put = vi.fn().mockResolvedValue({ pathname: "workspaces/workspace_1/runs/run_1/result.bin" });
    const get = vi.fn();
    const transport = { put, get } as never;
    const adapter = new VercelBlobStorageAdapter("blob_test", transport, async () => "workspace_2");
    await expect(
      adapter.putResult({ workspaceId: "workspace_1", runId: "run_1", bytes: new Uint8Array([1]), contentType: "application/octet-stream" }),
    ).rejects.toBeInstanceOf(CommercialDataUnavailableError);
    expect(put).not.toHaveBeenCalled();
  });
});
