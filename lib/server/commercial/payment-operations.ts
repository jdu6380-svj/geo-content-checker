import { CommercialIdempotencyConflictError, CommercialPaymentResponseInvalidError } from "./domain";

export type RefundStatus = "requested" | "processing" | "succeeded" | "failed";
export type ReconciliationStatus = "pending" | "matched" | "mismatch" | "failed";

export type PaymentOperationsRepository = {
  claimRefund(input: { workspaceId: string; outTradeNo: string; refundRequestId: string; amount: string }): Promise<{ status: RefundStatus; providerRefundNo: string | null } | null>;
  updateRefund(input: { workspaceId: string; refundRequestId: string; status: RefundStatus; providerRefundNo?: string | null }): Promise<void>;
  beginReconciliation(input: { provider: "alipay"; reconciliationId: string; periodStart: string; periodEnd: string }): Promise<void>;
  completeReconciliation(input: { provider: "alipay"; reconciliationId: string; status: ReconciliationStatus; mismatchCount: number }): Promise<void>;
};

export type AlipayPaymentOperations = {
  requestRefund(input: { workspaceId: string; outTradeNo: string; refundRequestId: string; amount: string }): Promise<{ status: RefundStatus; providerRefundNo: string | null }>;
  queryRefund(input: { workspaceId: string; refundRequestId: string }): Promise<{ status: RefundStatus; providerRefundNo: string | null }>;
  reconcile(input: { reconciliationId: string; periodStart: string; periodEnd: string }): Promise<{ status: ReconciliationStatus; mismatchCount: number }>;
};

export function createAlipayPaymentOperations(
  repository: PaymentOperationsRepository,
  transport: {
    refund(input: { outTradeNo: string; refundRequestId: string; amount: string }): Promise<{ status: RefundStatus; providerRefundNo?: string | null }>;
    queryRefund(input: { refundRequestId: string }): Promise<{ status: RefundStatus; providerRefundNo?: string | null }>;
    reconcile(input: { periodStart: string; periodEnd: string }): Promise<{ status: ReconciliationStatus; mismatchCount: number }>;
  },
): AlipayPaymentOperations {
  return {
    async requestRefund(input) {
      const existing = await repository.claimRefund(input);
      if (existing) {
        if (existing.status === "succeeded" || existing.status === "processing") return existing;
        throw new CommercialIdempotencyConflictError();
      }
      const result = await transport.refund(input);
      if (!["requested", "processing", "succeeded", "failed"].includes(result.status)) throw new CommercialPaymentResponseInvalidError();
      await repository.updateRefund({ ...input, status: result.status, providerRefundNo: result.providerRefundNo ?? null });
      return { status: result.status, providerRefundNo: result.providerRefundNo ?? null };
    },
    async queryRefund(input) {
      const result = await transport.queryRefund(input);
      if (!["requested", "processing", "succeeded", "failed"].includes(result.status)) throw new CommercialPaymentResponseInvalidError();
      return { status: result.status, providerRefundNo: result.providerRefundNo ?? null };
    },
    async reconcile(input) {
      await repository.beginReconciliation({ provider: "alipay", ...input });
      const result = await transport.reconcile(input);
      if (!["matched", "mismatch", "failed"].includes(result.status) || !Number.isSafeInteger(result.mismatchCount) || result.mismatchCount < 0) throw new CommercialPaymentResponseInvalidError();
      await repository.completeReconciliation({ provider: "alipay", ...input, status: result.status, mismatchCount: result.mismatchCount });
      return result;
    },
  };
}
