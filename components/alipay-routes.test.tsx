import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createAlipayCheckoutPost } from "@/app/api/alipay/checkout/handler";
import { createAlipayPlansGet } from "@/app/api/alipay/plans/handler";
import { getConfiguredAlipayAdapter, registerAlipayTransportFactory } from "@/lib/server/commercial/alipay-runtime";
import type { CommercialTelemetryEvent, CommercialTelemetrySink } from "@/lib/server/commercial/observability";

afterEach(() => { vi.unstubAllEnvs(); registerAlipayTransportFactory(null); });
describe("Alipay HTTP boundary", () => {
  it("derives actor workspace and returns only checkout URL", async () => {
    const request = new NextRequest("https://app.test/api/alipay/checkout", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "k1" }, body: JSON.stringify({ plan: "pro" }) });
    const response = await createAlipayCheckoutPost(request, { resolveActor: async () => ({ subjectId: "actor", workspaceId: "ws", role: "owner" }), getAdapter: () => ({ createCheckoutSession: async (input) => { expect(input.workspaceId).toBe("ws"); expect(input.actorId).toBe("actor"); return { checkoutUrl: "https://alipay.example/checkout", sessionId: "opaque" }; }, createPortalSession: async () => { throw new Error(); }, handleWebhook: async () => ({ duplicate: false }), getSubscription: async () => null }), resolvePlan: () => "alipay-pro" });
    expect(response.status).toBe(201); expect(await response.json()).toEqual({ checkoutUrl: "https://alipay.example/checkout" });
  });
  it("rejects extra client identity fields", async () => {
    const request = new NextRequest("https://app.test/api/alipay/checkout", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "k1" }, body: JSON.stringify({ plan: "pro", workspaceId: "other" }) });
    const response = await createAlipayCheckoutPost(request, { resolveActor: async () => ({ subjectId: "actor", workspaceId: "ws", role: "owner" }), getAdapter: () => null, resolvePlan: () => null });
    expect(response.status).toBe(503);
  });

  it("records a safe unavailable operation when payment is not configured", async () => {
    const events: CommercialTelemetryEvent[] = [];
    const telemetry: CommercialTelemetrySink = { emit: (event) => { events.push(event); } };
    const request = new NextRequest("https://app.test/api/alipay/checkout", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "payment-unavailable" }, body: JSON.stringify({ plan: "pro" }) });
    const response = await createAlipayCheckoutPost(request, {
      resolveActor: async () => ({ subjectId: "actor_private", workspaceId: "workspace_private", role: "owner" }),
      getAdapter: () => null,
      resolvePlan: () => null,
      telemetry,
    });
    expect(response.status).toBe(503);
    expect(events.at(-1)).toMatchObject({ event: "commercial_operation", operation: "payment", stage: "payment_unavailable", status: "unavailable", errorCode: "PAYMENT_UNAVAILABLE" });
    expect(JSON.stringify(events)).not.toMatch(/actor_private|workspace_private/);
  });

  it("constructs only an injected adapter after strict configuration validation", () => {
    vi.stubEnv("COMMERCIAL_PAYMENT_PROVIDER", "alipay");
    vi.stubEnv("ALIPAY_APP_ID", "app");
    vi.stubEnv("ALIPAY_PRIVATE_KEY", "private-secret");
    vi.stubEnv("ALIPAY_PUBLIC_KEY", "public-key");
    vi.stubEnv("ALIPAY_GATEWAY_URL", "https://gateway.example/");
    vi.stubEnv("ALIPAY_NOTIFY_URL", "https://app.example/api/alipay/notify");
    vi.stubEnv("ALIPAY_RETURN_URL", "https://app.example/api/alipay/return");
    const adapter = { createCheckoutSession: vi.fn(), createPortalSession: vi.fn(), handleWebhook: vi.fn(), getSubscription: vi.fn() };
    const factory = vi.fn(() => adapter);
    expect(getConfiguredAlipayAdapter()).toBeNull();
    expect(getConfiguredAlipayAdapter(factory)).toBe(adapter);
    expect(factory).toHaveBeenCalledWith(expect.objectContaining({ appId: "app", gatewayUrl: "https://gateway.example/" }));
  });

  it("fails closed for incomplete or non-HTTPS configuration", () => {
    vi.stubEnv("COMMERCIAL_PAYMENT_PROVIDER", "alipay");
    vi.stubEnv("ALIPAY_APP_ID", "app");
    vi.stubEnv("ALIPAY_PRIVATE_KEY", "private-secret");
    vi.stubEnv("ALIPAY_PUBLIC_KEY", "public-key");
    vi.stubEnv("ALIPAY_GATEWAY_URL", "http://gateway.example/");
    vi.stubEnv("ALIPAY_NOTIFY_URL", "https://app.example/api/alipay/notify");
    vi.stubEnv("ALIPAY_RETURN_URL", "https://app.example/api/alipay/return");
    expect(getConfiguredAlipayAdapter(vi.fn())).toBeNull();
  });

  it("builds the production adapter only after an explicit transport registration", () => {
    vi.stubEnv("COMMERCIAL_PAYMENT_PROVIDER", "alipay");
    vi.stubEnv("ALIPAY_APP_ID", "app");
    vi.stubEnv("ALIPAY_PRIVATE_KEY", "private-secret");
    vi.stubEnv("ALIPAY_PUBLIC_KEY", "public-key");
    vi.stubEnv("ALIPAY_GATEWAY_URL", "https://gateway.example/");
    vi.stubEnv("ALIPAY_NOTIFY_URL", "https://app.example/api/alipay/notify");
    vi.stubEnv("ALIPAY_RETURN_URL", "https://app.example/api/alipay/return");
    vi.stubEnv("ALIPAY_PLAN_AMOUNT_MAP", "alipay-pro=99.00");
    vi.stubEnv("ALIPAY_PLAN_RUN_LIMIT_MAP", "alipay-pro=20");
    expect(getConfiguredAlipayAdapter()).toBeNull();
    const createPageOrder = vi.fn();
    registerAlipayTransportFactory(() => ({ createPageOrder }));
    expect(getConfiguredAlipayAdapter()).not.toBeNull();
    expect(createPageOrder).not.toHaveBeenCalled();
  });

  it("returns only safe server-mapped Alipay plan data", async () => {
    const response = await createAlipayPlansGet(new Request("https://app.test/api/alipay/plans"), {
      resolveActor: async () => ({ workspaceId: "workspace_private" }), provider: () => "alipay", amounts: () => "pro=99.00", limits: () => "pro=20",
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ plans: [{ key: "pro", amount: "99.00", runLimit: 20 }] });
    expect(JSON.stringify(body)).not.toMatch(/workspace|app.?id|private|signature|order/i);
  });

  it("fails closed when Alipay plan configuration is incomplete", async () => {
    const response = await createAlipayPlansGet(new Request("https://app.test/api/alipay/plans"), {
      resolveActor: async () => ({}), provider: () => "alipay", amounts: () => "pro=99.00", limits: () => undefined,
    });
    expect(response.status).toBe(503);
  });
});
