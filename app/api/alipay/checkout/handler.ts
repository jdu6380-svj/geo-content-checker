import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveVerifiedCommercialActor } from "@/lib/server/commercial/auth";
import { CommercialPaymentUnavailableError, CommercialValidationError, type CommercialActor } from "@/lib/server/commercial/domain";
import type { PaymentAdapter } from "@/lib/server/commercial/providers";
import { getConfiguredAlipayAdapter } from "@/lib/server/commercial/alipay-runtime";
import { readCommercialJsonBody } from "@/lib/server/commercial/request-body";
import { normalizeCommercialIdempotencyKey } from "@/lib/server/commercial/service";
import {
  commercialTelemetryErrorCode,
  emitCommercialOperationTelemetry,
  getCommercialTelemetrySink,
  type CommercialTelemetrySink,
} from "@/lib/server/commercial/observability";

const schema = z.object({ plan: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/) }).strict();
const publicErrors: Record<string, { status: number; message: string }> = {
  PAYMENT_UNAVAILABLE: { status: 503, message: "支付服务尚未配置。" },
  PAYMENT_RESPONSE_INVALID: { status: 502, message: "支付服务返回了无法验证的数据。" },
  SIGNATURE_INVALID: { status: 400, message: "签名校验失败。" },
  DATA_UNAVAILABLE: { status: 503, message: "支付服务暂时不可用。" },
  INVALID_REQUEST: { status: 400, message: "商业请求格式不正确。" },
  IDEMPOTENCY_CONFLICT: { status: 409, message: "幂等键已用于不同请求。请使用新的幂等键。" },
};
type Deps = { resolveActor(request: Request): Promise<CommercialActor>; getAdapter(): PaymentAdapter | null; resolvePlan(plan: string): string | null; telemetry?: CommercialTelemetrySink };
const defaults: Deps = { resolveActor: resolveVerifiedCommercialActor, getAdapter: getConfiguredAlipayAdapter, resolvePlan: (plan) => process.env[`ALIPAY_PLAN_${plan.toUpperCase()}_PRICE_ID`]?.trim() || null, telemetry: getCommercialTelemetrySink() };

export async function createAlipayCheckoutPost(request: NextRequest, deps: Deps = defaults): Promise<NextResponse> {
  const startedAt = performance.now();
  let actor: CommercialActor | undefined;
  let idempotencyKey: string | undefined;
  try {
    actor = await deps.resolveActor(request); const adapter = deps.getAdapter(); if (!adapter) throw new CommercialPaymentUnavailableError();
    const body = await readCommercialJsonBody(request); const parsed = schema.safeParse(body); const key = normalizeCommercialIdempotencyKey(request.headers.get("idempotency-key"));
    idempotencyKey = key;
    if (!parsed.success || !key) throw new CommercialValidationError(); const priceId = deps.resolvePlan(parsed.data.plan); if (!priceId) throw new CommercialPaymentUnavailableError();
    const result = await adapter.createCheckoutSession({ workspaceId: actor.workspaceId, actorId: actor.subjectId, priceId, idempotencyKey: key });
    emitCommercialOperationTelemetry(deps.telemetry ?? getCommercialTelemetrySink(), { operation: "payment", workspaceId: actor.workspaceId, resourceId: "checkout", requestId: key, stage: "payment_succeeded", status: "succeeded", durationMs: performance.now() - startedAt });
    return NextResponse.json({ checkoutUrl: result.checkoutUrl }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { const code = commercialTelemetryErrorCode(error); emitCommercialOperationTelemetry(deps.telemetry ?? getCommercialTelemetrySink(), { operation: "payment", workspaceId: actor?.workspaceId, resourceId: "checkout", requestId: idempotencyKey, stage: code === "PAYMENT_UNAVAILABLE" ? "payment_unavailable" : "payment_failed", status: code === "PAYMENT_UNAVAILABLE" ? "unavailable" : "failed", durationMs: performance.now() - startedAt, errorCode: code }); const safe = publicErrors[code]; return NextResponse.json({ error: safe ? code : "PAYMENT_UNAVAILABLE", message: safe?.message ?? "支付服务暂时不可用。" }, { status: safe?.status ?? 503, headers: { "Cache-Control": "no-store" } }); }
}
