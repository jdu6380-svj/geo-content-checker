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
  CommercialSubscriptionManagementUnavailableError,
  CommercialUnauthenticatedError,
  CommercialValidationError,
  CommercialWorkspaceRequiredError,
} from "@/lib/server/commercial/domain";
import { getConfiguredStripeAdapter, type PaymentAdapter } from "@/lib/server/commercial/providers";
import type { CommercialActor } from "@/lib/server/commercial/domain";
import { readCommercialJsonBody } from "@/lib/server/commercial/request-body";
import { normalizeCommercialIdempotencyKey } from "@/lib/server/commercial/service";
import {
  commercialTelemetryErrorCode,
  emitCommercialOperationTelemetry,
  getCommercialTelemetrySink,
  type CommercialTelemetrySink,
} from "@/lib/server/commercial/observability";

const portalSchema = z.object({ intent: z.literal("manage").optional() }).strict();

function toResponse(error: unknown): NextResponse {
  if (
    error instanceof CommercialAuthUnavailableError ||
    error instanceof CommercialUnauthenticatedError ||
    error instanceof CommercialWorkspaceRequiredError ||
    error instanceof CommercialDataUnavailableError ||
    error instanceof CommercialNotFoundError ||
    error instanceof CommercialPaymentUnavailableError ||
    error instanceof CommercialSubscriptionManagementUnavailableError ||
    error instanceof CommercialPaymentResponseInvalidError ||
    error instanceof CommercialIdempotencyConflictError ||
    error instanceof CommercialValidationError
  ) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ error: "INTERNAL_ERROR", message: "订阅管理暂时不可用。" }, { status: 500, headers: { "Cache-Control": "no-store" } });
}

type PortalRouteDependencies = {
  resolveActor(request: Request): Promise<CommercialActor>;
  getAdapter(): PaymentAdapter | null;
  telemetry?: CommercialTelemetrySink;
};

const defaultDependencies: PortalRouteDependencies = {
  resolveActor: resolveVerifiedCommercialActor,
  getAdapter: getConfiguredStripeAdapter,
  telemetry: getCommercialTelemetrySink(),
};

export async function createPortalPost(
  request: NextRequest,
  dependencies: PortalRouteDependencies = defaultDependencies,
): Promise<NextResponse> {
  const startedAt = performance.now();
  let actor: CommercialActor | undefined;
  try {
    actor = await dependencies.resolveActor(request);
    const adapter = dependencies.getAdapter();
    if (!adapter) throw new CommercialPaymentUnavailableError();
    const body = await readCommercialJsonBody(request);
    const input = portalSchema.safeParse(body);
    if (!input.success) throw new CommercialValidationError();
    const idempotencyKey = normalizeCommercialIdempotencyKey(request.headers.get("idempotency-key"));
    if (!idempotencyKey) throw new CommercialValidationError("缺少幂等键。");
    const session = await adapter.createPortalSession({
      workspaceId: actor.workspaceId,
      actorId: actor.subjectId,
      idempotencyKey,
    });
    emitCommercialOperationTelemetry(dependencies.telemetry ?? getCommercialTelemetrySink(), {
      operation: "payment",
      workspaceId: actor.workspaceId,
      resourceId: "portal",
      requestId: idempotencyKey,
      stage: "payment_succeeded",
      status: "succeeded",
      durationMs: performance.now() - startedAt,
    });
    return NextResponse.json(session, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = commercialTelemetryErrorCode(error);
    emitCommercialOperationTelemetry(dependencies.telemetry ?? getCommercialTelemetrySink(), {
      operation: "payment",
      workspaceId: actor?.workspaceId,
      resourceId: "portal",
      stage: code === "PAYMENT_UNAVAILABLE" ? "payment_unavailable" : "payment_failed",
      status: code === "PAYMENT_UNAVAILABLE" ? "unavailable" : "failed",
      durationMs: performance.now() - startedAt,
      errorCode: code,
    });
    return toResponse(error);
  }
}
