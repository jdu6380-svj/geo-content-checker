import { NextResponse } from "next/server";

import { resolveCommercialClerkOrganizationIdentity } from "@/lib/server/commercial/auth";
import {
  CommercialAuthUnavailableError,
  CommercialDataUnavailableError,
  CommercialUnauthenticatedError,
  CommercialValidationError,
} from "@/lib/server/commercial/domain";
import { getNeonCommercialWorkspaceOnboardingRepository } from "@/lib/server/commercial/neon-workspace-onboarding";
import {
  CommercialWorkspaceAdminRequiredError,
  CommercialWorkspaceOnboardingService,
  type CommercialClerkOrganizationIdentity,
} from "@/lib/server/commercial/workspace-onboarding";
import { readCommercialJsonBody } from "@/lib/server/commercial/request-body";
import {
  commercialTelemetryErrorCode,
  emitCommercialOperationTelemetry,
  getCommercialTelemetrySink,
  readCommercialRequestId,
  type CommercialTelemetrySink,
} from "@/lib/server/commercial/observability";

type Dependencies = {
  resolveIdentity(): Promise<CommercialClerkOrganizationIdentity>;
  service(): CommercialWorkspaceOnboardingService;
  telemetry?: CommercialTelemetrySink;
};

const defaults: Dependencies = {
  resolveIdentity: resolveCommercialClerkOrganizationIdentity,
  service() {
    const repository = getNeonCommercialWorkspaceOnboardingRepository();
    if (!repository) throw new CommercialDataUnavailableError();
    return new CommercialWorkspaceOnboardingService(repository);
  },
  telemetry: getCommercialTelemetrySink(),
};

function errorResponse(error: unknown): NextResponse {
  if (
    error instanceof CommercialAuthUnavailableError ||
    error instanceof CommercialUnauthenticatedError ||
    error instanceof CommercialDataUnavailableError ||
    error instanceof CommercialValidationError ||
    error instanceof CommercialWorkspaceAdminRequiredError
  ) {
    return NextResponse.json({ error: error.code, message: error.message }, {
      status: error.status,
      headers: { "Cache-Control": "no-store" },
    });
  }
  return NextResponse.json({ error: "ONBOARDING_UNAVAILABLE", message: "工作区设置暂不可用。" }, {
    status: 503,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function createCommercialOnboardingGet(_request: Request, dependencies = defaults): Promise<NextResponse> {
  const startedAt = performance.now();
  let subjectRef: string | undefined;
  try {
    const identity = await dependencies.resolveIdentity();
    subjectRef = identity.orgId ?? identity.subjectId;
    const result = await dependencies.service().status(identity);
    emitCommercialOperationTelemetry(dependencies.telemetry ?? getCommercialTelemetrySink(), {
      operation: "onboarding",
      workspaceId: subjectRef,
      resourceId: "status",
      requestId: readCommercialRequestId(_request),
      stage: "onboarding_succeeded",
      status: "succeeded",
      durationMs: performance.now() - startedAt,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    emitCommercialOperationTelemetry(dependencies.telemetry ?? getCommercialTelemetrySink(), {
      operation: "onboarding",
      workspaceId: subjectRef,
      resourceId: "status",
      requestId: readCommercialRequestId(_request),
      stage: "onboarding_failed",
      status: "failed",
      durationMs: performance.now() - startedAt,
      errorCode: commercialTelemetryErrorCode(error),
    });
    return errorResponse(error);
  }
}

export async function createCommercialOnboardingPost(request: Request, dependencies = defaults): Promise<NextResponse> {
  const startedAt = performance.now();
  let subjectRef: string | undefined;
  try {
    const identity = await dependencies.resolveIdentity();
    subjectRef = identity.orgId ?? identity.subjectId;
    emitCommercialOperationTelemetry(dependencies.telemetry ?? getCommercialTelemetrySink(), {
      operation: "onboarding",
      workspaceId: subjectRef,
      resourceId: "bootstrap",
      requestId: readCommercialRequestId(request),
      stage: "onboarding_started",
      status: "started",
      durationMs: 0,
    });
    const body = await readCommercialJsonBody(request);
    const result = await dependencies.service().bootstrap(identity, body);
    emitCommercialOperationTelemetry(dependencies.telemetry ?? getCommercialTelemetrySink(), {
      operation: "onboarding",
      workspaceId: subjectRef,
      resourceId: "bootstrap",
      requestId: readCommercialRequestId(request),
      stage: "onboarding_succeeded",
      status: "succeeded",
      durationMs: performance.now() - startedAt,
    });
    return NextResponse.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    emitCommercialOperationTelemetry(dependencies.telemetry ?? getCommercialTelemetrySink(), {
      operation: "onboarding",
      workspaceId: subjectRef,
      resourceId: "bootstrap",
      requestId: readCommercialRequestId(request),
      stage: "onboarding_failed",
      status: "failed",
      durationMs: performance.now() - startedAt,
      errorCode: commercialTelemetryErrorCode(error),
    });
    return errorResponse(error);
  }
}
