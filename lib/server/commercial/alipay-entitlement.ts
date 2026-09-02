import { CommercialPaymentResponseInvalidError } from "./domain";
import type { AlipayOrder } from "./alipay";

export type AlipayEntitlementPlan = { amount: string; runLimit: number };

export interface AlipayEntitlementRepository {
  grant(input: { eventId: string; workspaceId: string; outTradeNo: string; plan: string; runLimit: number }): Promise<boolean>;
  markReview(input: { eventId: string; workspaceId: string; outTradeNo: string; reason: "closed" | "refund" }): Promise<void>;
}

export class AlipayEntitlementService {
  constructor(private readonly repository: AlipayEntitlementRepository, private readonly plans: ReadonlyMap<string, AlipayEntitlementPlan>) {}

  async apply(eventId: string, order: AlipayOrder): Promise<{ granted: boolean; review: boolean }> {
    if (order.status === "TRADE_SUCCESS") {
      const plan = this.plans.get(order.plan);
      if (!plan || plan.amount !== order.amount || !Number.isSafeInteger(plan.runLimit) || plan.runLimit <= 0) throw new CommercialPaymentResponseInvalidError();
      return { granted: await this.repository.grant({ eventId, workspaceId: order.workspaceId, outTradeNo: order.outTradeNo, plan: order.plan, runLimit: plan.runLimit }), review: false };
    }
    if (order.status === "TRADE_CLOSED" || order.status === "REFUND") {
      await this.repository.markReview({ eventId, workspaceId: order.workspaceId, outTradeNo: order.outTradeNo, reason: order.status === "REFUND" ? "refund" : "closed" });
      return { granted: false, review: true };
    }
    throw new CommercialPaymentResponseInvalidError();
  }
}

export class InMemoryAlipayEntitlementRepository implements AlipayEntitlementRepository {
  readonly grants = new Map<string, { workspaceId: string; runLimit: number; status: "granted" | "review" }>();
  async grant(input: { eventId: string; workspaceId: string; runLimit: number }): Promise<boolean> {
    if (this.grants.has(input.eventId)) return false;
    this.grants.set(input.eventId, { workspaceId: input.workspaceId, runLimit: input.runLimit, status: "granted" });
    return true;
  }
  async markReview(input: { eventId: string; workspaceId: string }): Promise<void> {
    if (!this.grants.has(input.eventId)) this.grants.set(input.eventId, { workspaceId: input.workspaceId, runLimit: 0, status: "review" });
  }
}
