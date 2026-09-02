import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createPortalPost } from "@/app/api/stripe/portal/handler";
import { createCheckoutPost } from "@/app/api/stripe/checkout/handler";
import { CommercialSubscriptionManagementUnavailableError } from "@/lib/server/commercial/domain";
import type { PaymentAdapter } from "@/lib/server/commercial/providers";

const actor = { subjectId: "user_1", workspaceId: "workspace_1", role: "owner" as const };

function request(body: unknown = { intent: "manage" }, idempotencyKey = "portal_key"): NextRequest {
  return new NextRequest("https://app.test/api/stripe/portal", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
    body: JSON.stringify(body),
  });
}

function adapter(createPortalSession: PaymentAdapter["createPortalSession"]): PaymentAdapter {
  return {
    createPortalSession,
    createCheckoutSession: vi.fn(),
    handleWebhook: vi.fn(),
    getSubscription: vi.fn(),
  };
}

describe("commercial portal route", () => {
  it("derives workspace and actor from auth instead of accepting client ownership fields", async () => {
    const createPortalSession = vi.fn().mockResolvedValue({ portalUrl: "https://billing.test/session" });
    const response = await createPortalPost(request(), {
      resolveActor: async () => actor,
      getAdapter: () => adapter(createPortalSession),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ portalUrl: "https://billing.test/session" });
    expect(createPortalSession).toHaveBeenCalledWith({
      workspaceId: "workspace_1", actorId: "user_1", idempotencyKey: "portal_key",
    });

    const crossWorkspace = await createPortalPost(request({ intent: "manage", workspaceId: "workspace_2" }), {
      resolveActor: async () => actor,
      getAdapter: () => adapter(createPortalSession),
    });
    expect(crossWorkspace.status).toBe(400);
    expect((await crossWorkspace.json()).error).toBe("INVALID_REQUEST");
  });

  it("maps missing Stripe configuration and inactive subscriptions without provider detail", async () => {
    const unconfigured = await createPortalPost(request(), {
      resolveActor: async () => actor,
      getAdapter: () => null,
    });
    expect(unconfigured.status).toBe(503);
    expect(await unconfigured.json()).toEqual({ error: "PAYMENT_UNAVAILABLE", message: expect.any(String) });

    const inactive = await createPortalPost(request(), {
      resolveActor: async () => actor,
      getAdapter: () => adapter(vi.fn().mockRejectedValue(new CommercialSubscriptionManagementUnavailableError())),
    });
    expect(inactive.status).toBe(409);
    const body = await inactive.json();
    expect(body).toEqual({ error: "SUBSCRIPTION_MANAGEMENT_UNAVAILABLE", message: expect.any(String) });
    expect(JSON.stringify(body)).not.toContain("cus_");
  });
});

describe("commercial checkout route", () => {
  it("accepts only a server-mapped plan and omits Stripe identifiers", async () => {
    const createCheckoutSession = vi.fn().mockResolvedValue({
      checkoutUrl: "https://checkout.test/session",
      sessionId: "cs_private",
    });
    const paymentAdapter = adapter(vi.fn());
    paymentAdapter.createCheckoutSession = createCheckoutSession;
    const dependencies = {
      resolveActor: async () => actor,
      getAdapter: () => paymentAdapter,
      resolvePlan: (plan: string) => plan === "pro" ? "price_private" : null,
    };
    const valid = new NextRequest("https://app.test/api/stripe/checkout", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "checkout_key" },
      body: JSON.stringify({ plan: "pro" }),
    });
    const response = await createCheckoutPost(valid, dependencies);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ checkoutUrl: "https://checkout.test/session" });
    expect(createCheckoutSession).toHaveBeenCalledWith({
      workspaceId: actor.workspaceId,
      actorId: actor.subjectId,
      priceId: "price_private",
      idempotencyKey: "checkout_key",
    });

    const ownershipInjection = new NextRequest("https://app.test/api/stripe/checkout", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "checkout_other" },
      body: JSON.stringify({ plan: "pro", workspaceId: "workspace_other", customerId: "cus_private", priceId: "price_other" }),
    });
    const rejected = await createCheckoutPost(ownershipInjection, dependencies);
    expect(rejected.status).toBe(400);
    expect((await rejected.json()).error).toBe("INVALID_REQUEST");
  });
});
