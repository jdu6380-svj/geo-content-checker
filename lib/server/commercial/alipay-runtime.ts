import type { PaymentAdapter } from "./providers";
import { AlipayPaymentAdapter, type AlipayTransport } from "./alipay";
import { NeonAlipayPaymentRepository } from "./neon-alipay-repository";
import { NeonPaymentEventStore } from "./neon-billing-store";
import { AlipayEntitlementService, type AlipayEntitlementPlan } from "./alipay-entitlement";

export type AlipayRuntimeConfig = {
  appId: string;
  privateKey: string;
  publicKey: string;
  gatewayUrl: string;
  notifyUrl: string;
  returnUrl: string;
};

export type AlipayAdapterFactory = (config: AlipayRuntimeConfig) => PaymentAdapter;
export type AlipayTransportFactory = (config: AlipayRuntimeConfig) => AlipayTransport;

let registeredTransportFactory: AlipayTransportFactory | null = null;

export function registerAlipayTransportFactory(factory: AlipayTransportFactory | null): void {
  registeredTransportFactory = factory;
}

function configuredPlanAmounts(): ReadonlyMap<string, string> | null {
  const entries = process.env.ALIPAY_PLAN_AMOUNT_MAP?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? [];
  const values = new Map<string, string>();
  for (const entry of entries) {
    const [plan, amount, extra] = entry.split("=").map((value) => value.trim());
    if (extra !== undefined || !/^[A-Za-z0-9_-]+$/.test(plan) || !/^(?:0|[1-9]\d*)\.\d{2}$/.test(amount)) return null;
    values.set(plan, amount);
  }
  return values.size ? values : null;
}

function configuredEntitlementPlans(amounts: ReadonlyMap<string, string>): ReadonlyMap<string, AlipayEntitlementPlan> | null {
  const limits = new Map<string, number>();
  for (const entry of process.env.ALIPAY_PLAN_RUN_LIMIT_MAP?.split(",").map((value) => value.trim()).filter(Boolean) ?? []) {
    const [plan, rawLimit, extra] = entry.split("=").map((value) => value.trim());
    const limit = Number(rawLimit);
    if (extra !== undefined || !amounts.has(plan) || !Number.isSafeInteger(limit) || limit <= 0) return null;
    limits.set(plan, limit);
  }
  if (limits.size !== amounts.size) return null;
  return new Map([...amounts].map(([plan, amount]) => [plan, { amount, runLimit: limits.get(plan)! }]));
}

function httpsUrl(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function getConfiguredAlipayAdapter(factory?: AlipayAdapterFactory): PaymentAdapter | null {
  if (process.env.COMMERCIAL_PAYMENT_PROVIDER !== "alipay") return null;
  const gatewayUrl = httpsUrl(process.env.ALIPAY_GATEWAY_URL);
  const notifyUrl = httpsUrl(process.env.ALIPAY_NOTIFY_URL);
  const returnUrl = httpsUrl(process.env.ALIPAY_RETURN_URL);
  const appId = process.env.ALIPAY_APP_ID?.trim();
  const privateKey = process.env.ALIPAY_PRIVATE_KEY?.trim();
  const publicKey = process.env.ALIPAY_PUBLIC_KEY?.trim();
  if (!appId || !privateKey || !publicKey || !gatewayUrl || !notifyUrl || !returnUrl) return null;
  const config = { appId, privateKey, publicKey, gatewayUrl, notifyUrl, returnUrl };
  if (factory) return factory(config);
  const planAmounts = configuredPlanAmounts();
  const entitlementPlans = planAmounts ? configuredEntitlementPlans(planAmounts) : null;
  if (!registeredTransportFactory || !planAmounts || !entitlementPlans) return null;
  const repository = new NeonAlipayPaymentRepository();
  return new AlipayPaymentAdapter({
    ...config,
    transport: registeredTransportFactory(config),
    orders: repository,
    events: new NeonPaymentEventStore(),
    entitlements: new AlipayEntitlementService(repository, entitlementPlans),
    planAmounts,
  });
}
