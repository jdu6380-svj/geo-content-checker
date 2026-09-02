import { createHash, sign as createSignature, verify as verifySignature } from "node:crypto";

import {
  CommercialIdempotencyConflictError,
  CommercialPaymentResponseInvalidError,
  CommercialPaymentUnavailableError,
  CommercialSignatureInvalidError,
} from "./domain";
import type { PaymentAdapter, PaymentEventStore, SubscriptionState } from "./providers";
import type { AlipayEntitlementService } from "./alipay-entitlement";

export type AlipayOrderStatus = "WAIT_BUYER_PAY" | "TRADE_SUCCESS" | "TRADE_CLOSED" | "REFUND" | "UNKNOWN";

export type AlipayOrder = {
  workspaceId: string;
  actorId: string;
  outTradeNo: string;
  idempotencyKey: string;
  requestFingerprint: string;
  plan: string;
  amount: string;
  status: AlipayOrderStatus;
  tradeNo: string | null;
  checkoutUrl: string | null;
  updatedAt: string;
};

export interface AlipayOrderStore {
  claim(order: AlipayOrder): Promise<AlipayOrder | null>;
  update(order: AlipayOrder): Promise<void>;
  get(outTradeNo: string): Promise<AlipayOrder | null>;
}

export interface AlipayTransport {
  createPageOrder(input: { outTradeNo: string; subject: string; totalAmount: string; returnUrl: string; notifyUrl: string }): Promise<{ checkoutUrl: string }>;
}

const ALIPAY_GATEWAY_HOSTS = new Set(["openapi.alipay.com", "openapi-sandbox.dl.alipaydev.com"]);

export type AlipayHttpTransportOptions = {
  appId: string;
  privateKey: string;
  gatewayUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

function validatedGateway(value: string): URL {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !ALIPAY_GATEWAY_HOSTS.has(url.hostname) || url.username || url.password) throw new Error("invalid gateway");
    return url;
  } catch {
    throw new CommercialPaymentUnavailableError();
  }
}

export function buildAlipayPagePayParameters(input: {
  appId: string; privateKey: string; outTradeNo: string; subject: string; totalAmount: string; returnUrl: string; notifyUrl: string;
  timestamp?: string;
}): URLSearchParams {
  const params = new URLSearchParams({
    app_id: input.appId,
    method: "alipay.trade.page.pay",
    format: "JSON",
    charset: "utf-8",
    sign_type: "RSA2",
    timestamp: input.timestamp ?? new Date().toISOString().slice(0, 19).replace("T", " "),
    version: "1.0",
    notify_url: input.notifyUrl,
    return_url: input.returnUrl,
    biz_content: JSON.stringify({ out_trade_no: input.outTradeNo, product_code: "FAST_INSTANT_TRADE_PAY", total_amount: input.totalAmount, subject: input.subject }),
  });
  const signable = [...params.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}=${value}`).join("&");
  try {
    params.set("sign", createSignature("RSA-SHA256", Buffer.from(signable), input.privateKey).toString("base64"));
  } catch {
    throw new CommercialPaymentUnavailableError();
  }
  return params;
}

export class AlipayHttpTransport implements AlipayTransport {
  private readonly gateway: URL;
  constructor(private readonly options: AlipayHttpTransportOptions) {
    this.gateway = validatedGateway(options.gatewayUrl);
    if (!options.appId.trim() || !options.privateKey.trim()) throw new CommercialPaymentUnavailableError();
  }

  async createPageOrder(input: { outTradeNo: string; subject: string; totalAmount: string; returnUrl: string; notifyUrl: string }): Promise<{ checkoutUrl: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 8_000);
    try {
      const response = await (this.options.fetchImpl ?? fetch)(this.gateway, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
        body: buildAlipayPagePayParameters({ ...input, appId: this.options.appId, privateKey: this.options.privateKey }),
        redirect: "manual",
        signal: controller.signal,
      });
      if (response.status < 200 || response.status >= 400) throw new CommercialPaymentResponseInvalidError();
      const candidate = response.headers.get("location") ?? response.url;
      const checkout = new URL(candidate);
      if (checkout.protocol !== "https:") throw new CommercialPaymentResponseInvalidError();
      return { checkoutUrl: checkout.toString() };
    } catch (error) {
      if (error instanceof CommercialPaymentResponseInvalidError) throw error;
      throw new CommercialPaymentUnavailableError();
    } finally {
      clearTimeout(timeout);
    }
  }
}

export type AlipayAdapterOptions = {
  appId: string;
  privateKey: string;
  publicKey: string;
  gatewayUrl: string;
  returnUrl: string;
  notifyUrl: string;
  transport: AlipayTransport;
  orders: AlipayOrderStore;
  events: PaymentEventStore;
  entitlements: AlipayEntitlementService;
  planAmounts: ReadonlyMap<string, string>;
  now?: () => Date;
};

function signableParams(payload: string): string {
  const params = new URLSearchParams(payload);
  return [...params.entries()]
    .filter(([key, value]) => key !== "sign" && key !== "sign_type" && value !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function verifyRsa2(payload: string, signature: string, publicKey: string): boolean {
  try {
    return verifySignature("RSA-SHA256", Buffer.from(signableParams(payload)), publicKey, Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}

export function verifyAlipayRsa2(payload: string, signature: string, publicKey: string): void {
  if (!payload || !signature || !publicKey || !verifyRsa2(payload, signature, publicKey)) throw new CommercialSignatureInvalidError();
}

export class AlipayPaymentAdapter implements PaymentAdapter {
  constructor(private readonly options: AlipayAdapterOptions) {
    if (!options.appId || !options.privateKey || !options.publicKey || !/^https:\/\//.test(options.gatewayUrl) || !/^https:\/\//.test(options.returnUrl) || !/^https:\/\//.test(options.notifyUrl)) {
      throw new CommercialPaymentUnavailableError();
    }
  }

  async createCheckoutSession(input: { workspaceId: string; actorId: string; priceId: string; idempotencyKey: string }): Promise<{ checkoutUrl: string; sessionId: string }> {
    const amount = this.options.planAmounts.get(input.priceId);
    if (!amount) throw new CommercialPaymentUnavailableError();
    const outTradeNo = `ev-${createHash("sha256").update(`${input.workspaceId}:${input.idempotencyKey}`).digest("hex").slice(0, 32)}`;
    const now = (this.options.now ?? (() => new Date()))().toISOString();
    const requestFingerprint = createHash("sha256").update(JSON.stringify({ workspaceId: input.workspaceId, actorId: input.actorId, priceId: input.priceId, amount })).digest("hex");
    const order: AlipayOrder = { workspaceId: input.workspaceId, actorId: input.actorId, outTradeNo, idempotencyKey: input.idempotencyKey, requestFingerprint, plan: input.priceId, amount, status: "WAIT_BUYER_PAY", tradeNo: null, checkoutUrl: null, updatedAt: now };
    const existing = await this.options.orders.claim(order);
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint || existing.actorId !== input.actorId || existing.workspaceId !== input.workspaceId) throw new CommercialIdempotencyConflictError();
      if (existing.checkoutUrl && existing.status === "WAIT_BUYER_PAY" && existing.tradeNo === null) {
        return { checkoutUrl: existing.checkoutUrl, sessionId: outTradeNo };
      }
      if (existing.status === "WAIT_BUYER_PAY" && existing.tradeNo === null) {
        const checkoutUrl = await this.options.transport.createPageOrder({ outTradeNo, subject: input.priceId, totalAmount: amount, returnUrl: this.options.returnUrl, notifyUrl: this.options.notifyUrl });
        if (!/^https:\/\//.test(checkoutUrl.checkoutUrl)) throw new CommercialPaymentResponseInvalidError();
        await this.options.orders.update({ ...existing, checkoutUrl: checkoutUrl.checkoutUrl, updatedAt: now });
        return { checkoutUrl: checkoutUrl.checkoutUrl, sessionId: outTradeNo };
      }
      return { checkoutUrl: this.options.returnUrl, sessionId: outTradeNo };
    }
    const created = await this.options.transport.createPageOrder({ outTradeNo, subject: input.priceId, totalAmount: amount, returnUrl: this.options.returnUrl, notifyUrl: this.options.notifyUrl });
    if (!/^https:\/\//.test(created.checkoutUrl)) throw new CommercialPaymentResponseInvalidError();
    await this.options.orders.update({ ...order, checkoutUrl: created.checkoutUrl, updatedAt: now });
    return { checkoutUrl: created.checkoutUrl, sessionId: outTradeNo };
  }

  async createPortalSession(): Promise<{ portalUrl: string }> { throw new CommercialPaymentUnavailableError(); }

  async handleWebhook(payload: string, signature: string): Promise<{ duplicate: boolean; retryable?: boolean }> {
    verifyAlipayRsa2(payload, signature, this.options.publicKey);
    const params = new URLSearchParams(payload);
    const outTradeNo = params.get("out_trade_no");
    const tradeStatus = params.get("trade_status");
    const tradeNo = params.get("trade_no");
    if (!outTradeNo || !tradeNo || !tradeStatus) throw new CommercialPaymentResponseInvalidError();
    const eventId = `alipay:${tradeNo}:${tradeStatus}`;
    const claim = await this.options.events.claimEvent(eventId, `alipay.${tradeStatus.toLowerCase()}`);
    if (claim === "duplicate") return { duplicate: true };
    if (claim === "in_progress") return { duplicate: false, retryable: true };
    try {
      const order = await this.options.orders.get(outTradeNo);
      if (!order) throw new CommercialPaymentResponseInvalidError();
      const status: AlipayOrderStatus = tradeStatus === "TRADE_SUCCESS" ? "TRADE_SUCCESS" : tradeStatus === "TRADE_CLOSED" ? "TRADE_CLOSED" : "UNKNOWN";
      if (status === "UNKNOWN") throw new CommercialPaymentResponseInvalidError();
      const updatedOrder = { ...order, status, tradeNo, updatedAt: (this.options.now ?? (() => new Date()))().toISOString() };
      await this.options.orders.update(updatedOrder);
      await this.options.entitlements.apply(eventId, updatedOrder);
      await this.options.events.completeEvent(eventId);
      return { duplicate: false };
    } catch (error) {
      await this.options.events.failEvent(eventId, "alipay_event_failed");
      throw error;
    }
  }

  async getSubscription(workspaceId: string): Promise<SubscriptionState | null> {
    return this.options.events.getSubscription(workspaceId);
  }
}

export class InMemoryAlipayOrderStore implements AlipayOrderStore {
  private readonly orders = new Map<string, AlipayOrder>();
  async claim(order: AlipayOrder): Promise<AlipayOrder | null> { const existing = this.orders.get(order.outTradeNo); if (!existing) this.orders.set(order.outTradeNo, order); return existing ? { ...existing } : null; }
  async update(order: AlipayOrder): Promise<void> { this.orders.set(order.outTradeNo, { ...order }); }
  async get(outTradeNo: string): Promise<AlipayOrder | null> { const order = this.orders.get(outTradeNo); return order ? { ...order } : null; }
}
