import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { resolveVerifiedCommercialActor } from "@/lib/server/commercial/auth";
import {
  CommercialAuthUnavailableError,
  CommercialDataUnavailableError,
  CommercialIdempotencyConflictError,
  CommercialNotFoundError,
  CommercialPaymentResponseInvalidError,
  CommercialPaymentUnavailableError,
  CommercialSignatureInvalidError,
  CommercialUnauthenticatedError,
  CommercialValidationError,
  CommercialWorkspaceRequiredError,
  type CommercialActor,
} from "@/lib/server/commercial/domain";
import { getConfiguredStripeAdapter, resolveStripePlanPrice, type PaymentAdapter } from "@/lib/server/commercial/providers";
import { readCommercialJsonBody } from "@/lib/server/commercial/request-body";
import { normalizeCommercialIdempotencyKey } from "@/lib/server/commercial/service";
import {
  commercialTelemetryErrorCode,
  emitCommercialOperationTelemetry,
  getCommercialTelemetrySink,
  type CommercialTelemetrySink,
} from "@/lib/server/commercial/observability";

const checkoutSchema = z.object({ plan: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/) }).strict();

function toResponse(error: unknown): NextResponse {
  if (
    error instanceof CommercialAuthUnavailableError ||
    error instanceof CommercialUnauthenticatedError ||
    error instanceof CommercialWorkspaceRequiredError ||
    error instanceof CommercialDataUnavailableError ||
    error instanceof CommercialNotFoundError ||
    error instanceof CommercialIdempotencyConflictError ||
    error instanceof CommercialPaymentResponseInvalidError ||
    error instanceof CommercialPaymentUnavailableError ||
    error instanceof CommercialSignatureInvalidError ||
    error instanceof CommercialValidationError
  ) return NextResponse.json({ error: error.code, message: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ error: "INTERNAL_ERROR", message: "支付请求暂时不可用。" }, { status: 500, headers: { "Cache-Control": "no-store" } });
}

type CheckoutRouteDependencies = {
  resolveActor(request: Request): Promise<CommercialActor>;
  getAdapter(): PaymentAdapter | null;
  resolvePlan(plan: string): string | null;
  telemetry?: CommercialTelemetrySink;
};

const defaultDependencies: CheckoutRouteDependencies = {
  resolveActor: resolveVerifiedCommercialActor,
  getAdapter: getConfiguredStripeAdapter,
  resolvePlan: resolveStripePlanPrice,
  telemetry: getCommercialTelemetrySink(),
};

export async function createCheckoutPost(
  request: NextRequest,
  dependencies: CheckoutRouteDependencies = defaultDependencies,
): Promise<NextResponse> {
  const startedAt = performance.now();
  let actor: CommercialActor | undefined;
  try {
    actor = await dependencies.resolveActor(request);
    const adapter = dependencies.getAdapter();
    if (!adapter) throw new CommercialPaymentUnavailableError();
    const body = await readCommercialJsonBody(request);
    const input = checkoutSchema.safeParse(body);
    if (!input.success) throw new CommercialValidationError();
    const priceId = dependencies.resolvePlan(input.data.plan);
    if (!priceId) throw new CommercialPaymentUnavailableError();
    const idempotencyKey = normalizeCommercialIdempotencyKey(request.headers.get("idempotency-key"));
    if (!idempotencyKey) throw new CommercialValidationError("缺少幂等键。");
    const session = await adapter.createCheckoutSession({
      workspaceId: actor.workspaceId,
      actorId: actor.subjectId,
      priceId,
      idempotencyKey,
    });
    emitCommercialOperationTelemetry(dependencies.telemetry ?? getCommercialTelemetrySink(), {
      operation: "payment",
      workspaceId: actor.workspaceId,
      resourceId: "checkout",
      requestId: idempotencyKey,
      stage: "payment_succeeded",
      status: "succeeded",
      durationMs: performance.now() - startedAt,
    });
    return NextResponse.json({ checkoutUrl: session.checkoutUrl }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = commercialTelemetryErrorCode(error);
    emitCommercialOperationTelemetry(dependencies.telemetry ?? getCommercialTelemetrySink(), {
      operation: "payment",
      workspaceId: actor?.workspaceId,
      resourceId: "checkout",
      stage: code === "PAYMENT_UNAVAILABLE" ? "payment_unavailable" : "payment_failed",
      status: code === "PAYMENT_UNAVAILABLE" ? "unavailable" : "failed",
      durationMs: performance.now() - startedAt,
      errorCode: code,
    });
    return toResponse(error);
  }
}
