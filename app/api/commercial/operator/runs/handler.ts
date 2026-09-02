import { NextResponse } from "next/server";

import { resolveVerifiedCommercialActor } from "@/lib/server/commercial/auth";
import type { CommercialActor } from "@/lib/server/commercial/domain";
import { NeonCommercialRunRecoveryRepository } from "@/lib/server/commercial/neon-run-recovery";
import { CommercialRunRecoveryService } from "@/lib/server/commercial/run-recovery";
import { readCommercialJsonBody } from "@/lib/server/commercial/request-body";
import { normalizeCommercialIdempotencyKey } from "@/lib/server/commercial/service";
import {
  commercialTelemetryErrorCode,
  emitCommercialOperationTelemetry,
  getCommercialTelemetrySink,
  readCommercialRequestId,
  type CommercialTelemetrySink,
} from "@/lib/server/commercial/observability";

type Dependencies = { resolveActor(request: Request): Promise<CommercialActor>; service: CommercialRunRecoveryService; telemetry?: CommercialTelemetrySink };
const defaults: Dependencies = { resolveActor: resolveVerifiedCommercialActor, service: new CommercialRunRecoveryService(new NeonCommercialRunRecoveryRepository()), telemetry: getCommercialTelemetrySink() };

function errorResponse(error: unknown): NextResponse {
  const known = error as { code?: string; status?: number };
  const status = typeof known.status === "number" && [400, 401, 403, 404, 409, 503].includes(known.status) ? known.status : 503;
  const code = typeof known.code === "string" ? known.code : "RUN_RECOVERY_UNAVAILABLE";
  const messages: Record<string, string> = {
    INVALID_REQUEST: "恢复请求格式不正确。",
    UNAUTHENTICATED: "请先登录。",
    WORKSPACE_REQUIRED: "当前账户未绑定可用工作区。",
    FORBIDDEN: "仅工作区所有者可使用运行恢复能力。",
    NOT_FOUND: "运行不存在或当前工作区无权访问。",
    IDEMPOTENCY_CONFLICT: "幂等键已用于不同恢复请求。",
    RUN_RECOVERY_CONFLICT: "运行状态已变化，恢复动作未执行。",
    DATA_UNAVAILABLE: "运行恢复数据暂不可用。",
  };
  return NextResponse.json({ error: code, message: messages[code] ?? "运行恢复能力暂不可用。" }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function createRunRecoveryGet(request: Request, dependencies = defaults): Promise<NextResponse> {
  const startedAt = performance.now();
  let actor: CommercialActor | undefined;
  try {
    actor = await dependencies.resolveActor(request);
    const result = await dependencies.service.list(actor);
    emitCommercialOperationTelemetry(dependencies.telemetry ?? getCommercialTelemetrySink(), {
      operation: "recovery",
      workspaceId: actor.workspaceId,
      resourceId: "list",
      requestId: readCommercialRequestId(request),
      stage: "recovery_succeeded",
      status: "succeeded",
      durationMs: performance.now() - startedAt,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    emitCommercialOperationTelemetry(dependencies.telemetry ?? getCommercialTelemetrySink(), {
      operation: "recovery",
      workspaceId: actor?.workspaceId,
      resourceId: "list",
      requestId: readCommercialRequestId(request),
      stage: "recovery_failed",
      status: "failed",
      durationMs: performance.now() - startedAt,
      errorCode: commercialTelemetryErrorCode(error),
    });
    return errorResponse(error);
  }
}

export async function createRunRecoveryPost(request: Request, dependencies = defaults): Promise<NextResponse> {
  const startedAt = performance.now();
  let actor: CommercialActor | undefined;
  let resourceId = "recover";
  try {
    actor = await dependencies.resolveActor(request);
    const body = await readCommercialJsonBody(request);
    if (body && typeof body === "object" && "runId" in body && typeof (body as { runId?: unknown }).runId === "string") resourceId = (body as { runId: string }).runId;
    const key = normalizeCommercialIdempotencyKey(request.headers.get("idempotency-key"));
    const action = await dependencies.service.recover(actor, body, key ?? null);
    emitCommercialOperationTelemetry(dependencies.telemetry ?? getCommercialTelemetrySink(), {
      operation: "quota",
      workspaceId: actor.workspaceId,
      resourceId: action.runId,
      requestId: readCommercialRequestId(request) ?? key,
      stage: "quota_released",
      status: "released",
      durationMs: performance.now() - startedAt,
    });
    emitCommercialOperationTelemetry(dependencies.telemetry ?? getCommercialTelemetrySink(), {
      operation: "recovery",
      workspaceId: actor.workspaceId,
      resourceId,
      requestId: key,
      stage: "recovery_succeeded",
      status: "succeeded",
      durationMs: performance.now() - startedAt,
    });
    return NextResponse.json({ action }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = commercialTelemetryErrorCode(error);
    emitCommercialOperationTelemetry(dependencies.telemetry ?? getCommercialTelemetrySink(), {
      operation: "recovery",
      workspaceId: actor?.workspaceId,
      resourceId,
      requestId: readCommercialRequestId(request),
      stage: code === "RUN_RECOVERY_CONFLICT" || code === "IDEMPOTENCY_CONFLICT" ? "recovery_conflict" : "recovery_failed",
      status: code === "RUN_RECOVERY_CONFLICT" || code === "IDEMPOTENCY_CONFLICT" ? "conflict" : "failed",
      durationMs: performance.now() - startedAt,
      errorCode: code,
    });
    return errorResponse(error);
  }
}
