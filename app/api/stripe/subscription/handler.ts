import { NextRequest, NextResponse } from "next/server";

import { resolveVerifiedCommercialActor } from "@/lib/server/commercial/auth";
import {
  CommercialAuthUnavailableError,
  CommercialDataUnavailableError,
  CommercialNotFoundError,
  CommercialPaymentUnavailableError,
  CommercialUnauthenticatedError,
  CommercialWorkspaceRequiredError,
} from "@/lib/server/commercial/domain";
import { getConfiguredStripeAdapter, type PaymentAdapter, type SubscriptionState } from "@/lib/server/commercial/providers";
import type { CommercialActor } from "@/lib/server/commercial/domain";
import {
  commercialTelemetryErrorCode,
  emitCommercialOperationTelemetry,
  getCommercialTelemetrySink,
  type CommercialTelemetrySink,
} from "@/lib/server/commercial/observability";

type SubscriptionRouteDependencies = {
  resolveActor(request: Request): Promise<CommercialActor>;
  getAdapter(): PaymentAdapter | null;
  telemetry?: CommercialTelemetrySink;
};

const defaultDependencies: SubscriptionRouteDependencies = {
  resolveActor: resolveVerifiedCommercialActor,
  getAdapter: getConfiguredStripeAdapter,
  telemetry: getCommercialTelemetrySink(),
};

function publicSubscription(state: SubscriptionState) {
  return {
    status: state.status,
    currentPeriodEnd: state.currentPeriodEnd,
    updatedAt: state.updatedAt,
    eventCreated: state.eventCreated,
    entitlementRunLimit: state.entitlementRunLimit,
  };
}

function toResponse(error: unknown): NextResponse {
  if (
    error instanceof CommercialAuthUnavailableError ||
    error instanceof CommercialUnauthenticatedError ||
    error instanceof CommercialWorkspaceRequiredError ||
    error instanceof CommercialDataUnavailableError ||
    error instanceof CommercialNotFoundError ||
    error instanceof CommercialPaymentUnavailableError
  ) {
    return NextResponse.json({ error: error.code, message: error.message }, {
      status: error.status,
      headers: { "Cache-Control": "no-store" },
    });
  }
  return NextResponse.json({ error: "INTERNAL_ERROR", message: "订阅状态暂时不可用。" }, {
    status: 500,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function getSubscriptionGet(
  request: NextRequest,
  dependencies: SubscriptionRouteDependencies = defaultDependencies,
): Promise<NextResponse> {
  const startedAt = performance.now();
  let actor: CommercialActor | undefined;
  try {
    actor = await dependencies.resolveActor(request);
    const adapter = dependencies.getAdapter();
    if (!adapter) throw new CommercialPaymentUnavailableError();
    const subscription = await adapter.getSubscription(actor.workspaceId);
    emitCommercialOperationTelemetry(dependencies.telemetry ?? getCommercialTelemetrySink(), {
      operation: "payment",
      workspaceId: actor.workspaceId,
      resourceId: "subscription",
      stage: "payment_succeeded",
      status: "succeeded",
      durationMs: performance.now() - startedAt,
    });
    return NextResponse.json({ subscription: subscription ? publicSubscription(subscription) : null }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const code = commercialTelemetryErrorCode(error);
    emitCommercialOperationTelemetry(dependencies.telemetry ?? getCommercialTelemetrySink(), {
      operation: "payment",
      workspaceId: actor?.workspaceId,
      resourceId: "subscription",
      stage: code === "PAYMENT_UNAVAILABLE" ? "payment_unavailable" : "payment_failed",
      status: code === "PAYMENT_UNAVAILABLE" ? "unavailable" : "failed",
      durationMs: performance.now() - startedAt,
      errorCode: code,
    });
    return toResponse(error);
  }
}
