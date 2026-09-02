import { generateKeyPairSync, sign, verify } from "node:crypto";
import { describe, expect, it } from "vitest";

import { AlipayHttpTransport, AlipayPaymentAdapter, InMemoryAlipayOrderStore, verifyAlipayRsa2 } from "@/lib/server/commercial/alipay";
import { CommercialPaymentResponseInvalidError, CommercialPaymentUnavailableError } from "@/lib/server/commercial/domain";
import { AlipayEntitlementService, InMemoryAlipayEntitlementRepository } from "@/lib/server/commercial/alipay-entitlement";
import { InMemoryPaymentEventStore } from "@/lib/server/commercial/providers";

function signed(payload: string, privateKey: string): string {
  return sign("RSA-SHA256", Buffer.from(new URLSearchParams(payload).toString().split("&").filter((entry) => !entry.startsWith("sign=")).sort().join("&")), privateKey).toString("base64");
}

describe("Alipay payment adapter", () => {
  it("creates an HTTPS order idempotently and verifies RSA2 notify replay", async () => {
    const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const privateKey = keys.privateKey.export({ type: "pkcs1", format: "pem" }).toString();
    const publicKey = keys.publicKey.export({ type: "pkcs1", format: "pem" }).toString();
    const orders = new InMemoryAlipayOrderStore();
    let calls = 0;
    const entitlementRepository = new InMemoryAlipayEntitlementRepository();
    const adapter = new AlipayPaymentAdapter({ appId: "app", privateKey, publicKey, gatewayUrl: "https://openapi.alipay.com/gateway.do", returnUrl: "https://example.test/return", notifyUrl: "https://example.test/notify", orders, events: new InMemoryPaymentEventStore(), entitlements: new AlipayEntitlementService(entitlementRepository, new Map([["alipay-pro", { amount: "99.00", runLimit: 20 }]])), planAmounts: new Map([["alipay-pro", "99.00"]]), transport: { async createPageOrder() { calls += 1; return { checkoutUrl: "https://alipay.example/checkout" }; } }, now: () => new Date("2026-01-01T00:00:00Z") });
    const first = await adapter.createCheckoutSession({ workspaceId: "ws", actorId: "actor", priceId: "alipay-pro", idempotencyKey: "k1" });
    const second = await adapter.createCheckoutSession({ workspaceId: "ws", actorId: "actor", priceId: "alipay-pro", idempotencyKey: "k1" });
    expect(first.checkoutUrl).toMatch(/^https:\/\//);
    expect(second.sessionId).toBe(first.sessionId);
    expect(calls).toBe(1);
    const payload = `out_trade_no=${encodeURIComponent(first.sessionId)}&trade_no=trade-1&trade_status=TRADE_SUCCESS`;
    const signature = signed(payload, privateKey);
    verifyAlipayRsa2(payload, signature, publicKey);
    expect(await adapter.handleWebhook(payload, signature)).toEqual({ duplicate: false });
    expect(await adapter.handleWebhook(payload, signature)).toEqual({ duplicate: true });
    expect([...entitlementRepository.grants.values()]).toEqual([{ workspaceId: "ws", runLimit: 20, status: "granted" }]);
  });

  it("signs a page-pay request and accepts only an HTTPS redirect", async () => {
    const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const privateKey = keys.privateKey.export({ type: "pkcs1", format: "pem" }).toString();
    const publicKey = keys.publicKey.export({ type: "pkcs1", format: "pem" }).toString();
    let body = "";
    const transport = new AlipayHttpTransport({ appId: "app", privateKey, gatewayUrl: "https://openapi.alipay.com/gateway.do", fetchImpl: async (_url, init) => {
      body = String(init?.body);
      return new Response(null, { status: 302, headers: { location: "https://cashier.alipay.com/checkout" } });
    } });
    await expect(transport.createPageOrder({ outTradeNo: "order_1", subject: "pro", totalAmount: "99.00", returnUrl: "https://app.example/return", notifyUrl: "https://app.example/notify" })).resolves.toEqual({ checkoutUrl: "https://cashier.alipay.com/checkout" });
    const params = new URLSearchParams(body);
    const signature = params.get("sign");
    params.delete("sign");
    const signable = [...params.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}=${value}`).join("&");
    expect(signature).toBeTruthy();
    expect(verify("RSA-SHA256", Buffer.from(signable), publicKey, Buffer.from(signature!, "base64"))).toBe(true);
  });

  it("rejects an unapproved gateway before fetch", () => {
    expect(() => new AlipayHttpTransport({ appId: "app", privateKey: "secret", gatewayUrl: "https://example.test/gateway", fetchImpl: async () => new Response() })).toThrow(CommercialPaymentUnavailableError);
  });

  it("maps provider failures without exposing the response", async () => {
    const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const privateKey = keys.privateKey.export({ type: "pkcs1", format: "pem" }).toString();
    const transport = new AlipayHttpTransport({ appId: "app", privateKey, gatewayUrl: "https://openapi.alipay.com/gateway.do", fetchImpl: async () => new Response("private provider detail", { status: 500 }) });
    await expect(transport.createPageOrder({ outTradeNo: "order_1", subject: "pro", totalAmount: "99.00", returnUrl: "https://app.example/return", notifyUrl: "https://app.example/notify" })).rejects.toEqual(expect.any(CommercialPaymentResponseInvalidError));
  });

  it("aborts a timed-out request with a stable unavailable error", async () => {
    const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const privateKey = keys.privateKey.export({ type: "pkcs1", format: "pem" }).toString();
    const transport = new AlipayHttpTransport({ appId: "app", privateKey, gatewayUrl: "https://openapi.alipay.com/gateway.do", timeoutMs: 5, fetchImpl: async (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))) });
    await expect(transport.createPageOrder({ outTradeNo: "order_1", subject: "pro", totalAmount: "99.00", returnUrl: "https://app.example/return", notifyUrl: "https://app.example/notify" })).rejects.toEqual(expect.any(CommercialPaymentUnavailableError));
  });

  it("derives workspace entitlement from the persisted order and never reverses quota silently", async () => {
    const repository = new InMemoryAlipayEntitlementRepository();
    const service = new AlipayEntitlementService(repository, new Map([["alipay-pro", { amount: "99.00", runLimit: 20 }]]));
    const order = { workspaceId: "workspace_server", actorId: "actor_server", outTradeNo: "order_1", idempotencyKey: "key_1", requestFingerprint: "fingerprint", plan: "alipay-pro", amount: "99.00", status: "TRADE_SUCCESS" as const, tradeNo: "trade_1", checkoutUrl: null, updatedAt: "2026-01-01T00:00:00.000Z" };
    await expect(service.apply("event_success", order)).resolves.toEqual({ granted: true, review: false });
    await expect(service.apply("event_success", order)).resolves.toEqual({ granted: false, review: false });
    await expect(service.apply("event_closed", { ...order, status: "TRADE_CLOSED" })).resolves.toEqual({ granted: false, review: true });
    expect(repository.grants.get("event_success")).toEqual({ workspaceId: "workspace_server", runLimit: 20, status: "granted" });
    expect(repository.grants.get("event_closed")).toEqual({ workspaceId: "workspace_server", runLimit: 0, status: "review" });
  });

  it("fails closed for an unknown plan or mismatched amount", async () => {
    const service = new AlipayEntitlementService(new InMemoryAlipayEntitlementRepository(), new Map([["alipay-pro", { amount: "99.00", runLimit: 20 }]]));
    const order = { workspaceId: "workspace_server", actorId: "actor_server", outTradeNo: "order_1", idempotencyKey: "key_1", requestFingerprint: "fingerprint", plan: "unknown", amount: "1.00", status: "TRADE_SUCCESS" as const, tradeNo: "trade_1", checkoutUrl: null, updatedAt: "2026-01-01T00:00:00.000Z" };
    await expect(service.apply("event_unknown", order)).rejects.toEqual(expect.any(CommercialPaymentResponseInvalidError));
  });
});
