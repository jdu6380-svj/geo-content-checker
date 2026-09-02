import { NextResponse } from "next/server";

import { resolveCommercialActor } from "@/lib/server/commercial/auth";
import {
  CommercialAuthUnavailableError,
  CommercialDataUnavailableError,
  CommercialIdempotencyConflictError,
  CommercialNotFoundError,
  CommercialRunNotCancellableError,
  CommercialUnauthenticatedError,
  CommercialValidationError,
  CommercialWorkspaceRequiredError,
  publicAnalysisRun,
  type CommercialActor,
} from "@/lib/server/commercial/domain";
import { readCommercialJsonBody } from "@/lib/server/commercial/request-body";
import { getConfiguredCommercialService, type CommercialService } from "@/lib/server/commercial/service";

type Params = { params: Promise<{ runId: string }> };

export type CommercialRunCancelDependencies = {
  resolveActor(request: Request): Promise<CommercialActor>;
  getService(): CommercialService | null;
};

const defaultDependencies: CommercialRunCancelDependencies = {
  resolveActor: resolveCommercialActor,
  getService: getConfiguredCommercialService,
};

function errorResponse(error: unknown): NextResponse {
  if (
    error instanceof CommercialAuthUnavailableError ||
    error instanceof CommercialUnauthenticatedError ||
    error instanceof CommercialWorkspaceRequiredError ||
    error instanceof CommercialDataUnavailableError ||
    error instanceof CommercialValidationError ||
    error instanceof CommercialNotFoundError ||
    error instanceof CommercialIdempotencyConflictError ||
    error instanceof CommercialRunNotCancellableError
  ) {
    return NextResponse.json(
      { error: error.code, message: error.message },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(
    { error: "INTERNAL_ERROR", message: "运行取消暂时不可用。" },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}

export async function postCommercialRunCancel(
  request: Request,
  context: Params,
  dependencies: CommercialRunCancelDependencies = defaultDependencies,
): Promise<NextResponse> {
  try {
    const actor = await dependencies.resolveActor(request);
    const body = await readCommercialJsonBody(request);
    if (
      !body ||
      typeof body !== "object" ||
      (body as { intent?: unknown }).intent !== "cancel" ||
      Object.keys(body).some((key) => key !== "intent")
    ) {
      throw new CommercialValidationError();
    }
    const service = dependencies.getService();
    if (!service) throw new CommercialDataUnavailableError();
    const { runId } = await context.params;
    const run = await service.cancelQueuedRun(actor, { runId }, request.headers.get("idempotency-key") ?? undefined);
    return NextResponse.json(
      { run: publicAnalysisRun(run) },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
