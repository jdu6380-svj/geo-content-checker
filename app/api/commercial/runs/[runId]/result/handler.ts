import { NextRequest, NextResponse } from "next/server";

import { resolveCommercialActor } from "@/lib/server/commercial/auth";
import {
  CommercialAuthUnavailableError,
  CommercialDataUnavailableError,
  CommercialNotFoundError,
  CommercialResultNotReadyError,
  CommercialUnauthenticatedError,
  CommercialWorkspaceRequiredError,
  type CommercialActor,
} from "@/lib/server/commercial/domain";
import { getConfiguredBlobAdapter, type StorageAdapter } from "@/lib/server/commercial/providers";
import { getConfiguredCommercialService, type CommercialService } from "@/lib/server/commercial/service";
import {
  commercialTelemetryErrorCode,
  emitCommercialOperationTelemetry,
  getCommercialTelemetrySink,
  readCommercialRequestId,
  type CommercialTelemetrySink,
} from "@/lib/server/commercial/observability";

type Params = { params: Promise<{ runId: string }> };

function errorResponse(error: unknown): NextResponse {
  if (
    error instanceof CommercialAuthUnavailableError ||
    error instanceof CommercialUnauthenticatedError ||
    error instanceof CommercialWorkspaceRequiredError ||
    error instanceof CommercialDataUnavailableError ||
    error instanceof CommercialNotFoundError ||
    error instanceof CommercialResultNotReadyError
  ) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ error: "INTERNAL_ERROR", message: "结果暂时不可用。" }, { status: 500, headers: { "Cache-Control": "no-store" } });
}

export type CommercialResultRouteDependencies = {
  resolveActor(request: Request): Promise<CommercialActor>;
  getService(): CommercialService | null;
  getStorage(): StorageAdapter | null;
  telemetry?: CommercialTelemetrySink;
};

const defaultDependencies: CommercialResultRouteDependencies = {
  resolveActor: resolveCommercialActor,
  getService: getConfiguredCommercialService,
  getStorage: getConfiguredBlobAdapter,
  telemetry: getCommercialTelemetrySink(),
};

async function authorize(
  request: NextRequest,
  runId: string,
  dependencies: CommercialResultRouteDependencies,
) {
  const actor = await dependencies.resolveActor(request);
  const service = dependencies.getService();
  if (!service) throw new CommercialDataUnavailableError();
  const run = await service.getRun(actor, runId);
  if (!run) throw new CommercialNotFoundError("运行记录不存在。");
  if (run.status !== "succeeded" || !run.resultKey) throw new CommercialResultNotReadyError();
  const storage = dependencies.getStorage();
  if (!storage) throw new CommercialDataUnavailableError();
  return { actor, storage, run };
}

export async function getCommercialResult(
  request: NextRequest,
  context: Params,
  dependencies: CommercialResultRouteDependencies = defaultDependencies,
): Promise<NextResponse> {
  const startedAt = performance.now();
  let actor: CommercialActor | undefined;
  let runId = "unknown";
  try {
    ({ runId } = await context.params);
    const requestId = readCommercialRequestId(request);
    emitCommercialOperationTelemetry(dependencies.telemetry ?? getCommercialTelemetrySink(), {
      operation: "result_read",
      resourceId: runId,
      requestId,
      stage: "result_read_started",
      status: "started",
      durationMs: 0,
    });
    const authorized = await authorize(request, runId, dependencies);
    actor = authorized.actor;
    const { storage } = authorized;
    const bytes = await storage.getResult({ workspaceId: authorized.actor.workspaceId, runId });
    emitCommercialOperationTelemetry(dependencies.telemetry ?? getCommercialTelemetrySink(), {
      operation: "result_read",
      workspaceId: authorized.actor.workspaceId,
      resourceId: runId,
      requestId,
      stage: "result_read_succeeded",
      status: "succeeded",
      durationMs: performance.now() - startedAt,
    });
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: { "Cache-Control": "private, no-store", "Content-Type": "application/octet-stream" },
    });
  } catch (error) {
    const code = commercialTelemetryErrorCode(error);
    const stage = code === "RESULT_NOT_READY" ? "result_read_not_ready" : "result_read_failed";
    emitCommercialOperationTelemetry(dependencies.telemetry ?? getCommercialTelemetrySink(), {
      operation: "result_read",
      workspaceId: actor?.workspaceId,
      resourceId: runId,
      requestId: readCommercialRequestId(request),
      stage,
      status: code === "RESULT_NOT_READY" ? "not_ready" : "failed",
      durationMs: performance.now() - startedAt,
      errorCode: code,
    });
    return errorResponse(error);
  }
}
