import { readFileSync } from "node:fs";
import path from "node:path";

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAlipayNotifyPost } from "@/app/api/alipay/notify/handler";
import type { PaymentAdapter } from "@/lib/server/commercial/providers";

afterEach(() => vi.unstubAllEnvs());

function source(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}

function fakeAdapter(handleWebhook: PaymentAdapter["handleWebhook"]): PaymentAdapter {
  return {
    createCheckoutSession: async () => ({ checkoutUrl: "https://pay.example/checkout", sessionId: "opaque" }),
    createPortalSession: async () => ({ portalUrl: "https://pay.example/portal" }),
    handleWebhook,
    getSubscription: async () => null,
  };
}

describe("commercial request-source and response boundaries", () => {
  it("forces Clerk sign-in and sign-up to a fixed internal onboarding path", () => {
    expect(source("app/sign-in/[[...sign-in]]/page.tsx")).toContain('forceRedirectUrl="/onboarding"');
    expect(source("app/sign-up/[[...sign-up]]/page.tsx")).toContain('forceRedirectUrl="/onboarding"');
    expect(source("middleware.ts")).toContain("await auth.protect()");
  });

  it("passes the raw webhook body only to the injected verifier and never leaks provider errors", async () => {
    const payload = "out_trade_no=opaque-order&trade_status=TRADE_SUCCESS";
    const signature = "opaque-signature";
    let received = "";
    const response = await createAlipayNotifyPost(
      new NextRequest("https://app.test/api/alipay/notify", {
        method: "POST",
        headers: { "content-type": "text/plain", "alipay-signature": signature },
        body: payload,
      }),
      {
        getAdapter: () => fakeAdapter(async (actualPayload, actualSignature) => {
          received = `${actualPayload}|${actualSignature}`;
          throw Object.assign(new Error("provider secret response"), { code: "PROVIDER_RAW", status: 502 });
        }),
      },
    );
    expect(received).toBe(`${payload}|${signature}`);
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const text = await response.text();
    expect(text).not.toContain("provider secret response");
    expect(text).not.toContain("PROVIDER_RAW");
  });

  it("maps signature failures to a stable non-cacheable response", async () => {
    const response = await createAlipayNotifyPost(
      new NextRequest("https://app.test/api/alipay/notify", { method: "POST", body: "opaque" }),
      { getAdapter: () => fakeAdapter(async () => { throw Object.assign(new Error("raw provider detail"), { code: "SIGNATURE_INVALID", status: 400, message: "raw provider detail" }); }) },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "SIGNATURE_INVALID", message: "签名校验失败。" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("keeps commercial error responses non-cacheable and result data private", () => {
    for (const file of [
      "app/api/commercial/projects/handler.ts",
      "app/api/commercial/projects/[projectId]/analyze/handler.ts",
      "app/api/commercial/runs/[runId]/route.ts",
      "app/api/commercial/runs/[runId]/result/handler.ts",
      "app/api/stripe/checkout/handler.ts",
      "app/api/stripe/portal/handler.ts",
      "app/api/stripe/subscription/handler.ts",
    ]) {
      const text = source(file);
      expect(text, file).toContain('"Cache-Control": "no-store"');
    }
    expect(source("app/api/commercial/runs/[runId]/result/handler.ts")).toContain('"Cache-Control": "private, no-store"');
  });

  it("fails closed for malformed HTTPS app configuration on payment return", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://");
    const { GET } = await import("@/app/api/alipay/return/route");
    const response = await GET(new Request("https://app.test/api/alipay/return"));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "PAYMENT_UNAVAILABLE", message: "支付服务尚未配置。" });
  });
});
