import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { resolveCommercialActor } from "@/lib/server/commercial/auth";
import {
  CommercialAuthUnavailableError,
  CommercialDataUnavailableError,
  CommercialExecutionFailedError,
  CommercialExecutionInvalidOutputError,
  CommercialExecutionRetryableError,
  CommercialExecutionUnavailableError,
  CommercialIdempotencyConflictError,
  CommercialNotFoundError,
  CommercialQuotaExceededError,
  CommercialRateLimitedError,
  CommercialRateLimitUnavailableError,
  CommercialUnauthenticatedError,
  CommercialValidationError,
  CommercialWorkspaceRequiredError,
  publicAnalysisRun,
} from "@/lib/server/commercial/domain";
import { CommercialAnalysisOrchestrator, getConfiguredCommercialExecutor } from "@/lib/server/commercial/execution";
import { getConfiguredBlobAdapter } from "@/lib/server/commercial/providers";
import { getConfiguredCommercialService, normalizeCommercialIdempotencyKey } from "@/lib/server/commercial/service";
import { readCommercialJsonBody, COMMERCIAL_ANALYZE_BODY_LIMIT_BYTES } from "@/lib/server/commercial/request-body";
import {
  getConfiguredCommercialAnalyzeRateLimiter,
  type CommercialAnalyzeRateLimiter,
} from "@/lib/server/commercial/rate-limit";
import type { CommercialActor } from "@/lib/server/commercial/domain";
import type { CommercialAnalysisExecutor } from "@/lib/server/commercial/execution";
import type { StorageAdapter } from "@/lib/server/commercial/providers";
import type { CommercialService } from "@/lib/server/commercial/service";

const launchSchema = z.object({
  title: z.string().trim().min(1).max(240),
  content: z.string().min(1).max(500_000),
  publishedAt: z.string().trim().max(80).optional(),
}).strict();

function errorResponse(error: unknown): NextResponse {
  if (
    error instanceof CommercialAuthUnavailableError ||
    error instanceof CommercialUnauthenticatedError ||
    error instanceof CommercialWorkspaceRequiredError ||
    error instanceof CommercialDataUnavailableError ||
    error instanceof CommercialExecutionUnavailableError ||
    error instanceof CommercialExecutionFailedError ||
    error instanceof CommercialExecutionInvalidOutputError ||
    error instanceof CommercialExecutionRetryableError ||
    error instanceof CommercialNotFoundError ||
    error instanceof CommercialIdempotencyConflictError ||
    error instanceof CommercialQuotaExceededError ||
    error instanceof CommercialRateLimitUnavailableError ||
    error instanceof CommercialRateLimitedError ||
    error instanceof CommercialValidationError
  ) {
    return NextResponse.json({ error: error.code, message: error.message }, {
      status: error.status,
      headers: {
        "Cache-Control": "no-store",
        ...(error instanceof CommercialRateLimitUnavailableError ? { "Retry-After": "60" } : {}),
        ...(error instanceof CommercialRateLimitedError ? { "Retry-After": String(error.retryAfter) } : {}),
      },
    });
  }
  return NextResponse.json({ error: "INTERNAL_ERROR", message: "商业分析暂时不可用。" }, { status: 500, headers: { "Cache-Control": "no-store" } });
}

export type CommercialAnalyzeRouteDependencies = {
  resolveActor(request: Request): Promise<CommercialActor>;
  getService(): CommercialService | null;
  getExecutor(): CommercialAnalysisExecutor | null;
  getStorage(): StorageAdapter | null;
  getRateLimiter(): CommercialAnalyzeRateLimiter | null;
};

const defaultDependencies: CommercialAnalyzeRouteDependencies = {
  resolveActor: resolveCommercialActor,
  getService: getConfiguredCommercialService,
  getExecutor: getConfiguredCommercialExecutor,
  getStorage: getConfiguredBlobAdapter,
  getRateLimiter: getConfiguredCommercialAnalyzeRateLimiter,
};

export async function postCommercialAnalyze(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
  dependencies: CommercialAnalyzeRouteDependencies = defaultDependencies,
): Promise<NextResponse> {
  try {
    const actor = await dependencies.resolveActor(request);
    const body = await readCommercialJsonBody(request, COMMERCIAL_ANALYZE_BODY_LIMIT_BYTES);
    const input = launchSchema.safeParse(body);
    if (!input.success) throw new CommercialValidationError();
    const idempotencyKey = normalizeCommercialIdempotencyKey(request.headers.get("idempotency-key"));
    if (!idempotencyKey) throw new CommercialValidationError("缺少幂等键。");
    const limiter = dependencies.getRateLimiter();
    if (!limiter) throw new CommercialRateLimitUnavailableError();
    const rateLimit = await limiter.check({ workspaceId: actor.workspaceId, subjectId: actor.subjectId });
    const service = dependencies.getService();
    if (!service) throw new CommercialDataUnavailableError();
    const executor = dependencies.getExecutor();
    if (!executor) throw new CommercialExecutionUnavailableError();
    const storage = dependencies.getStorage();
    if (!storage) throw new CommercialDataUnavailableError();
    const { projectId } = await context.params;
    const run = await new CommercialAnalysisOrchestrator(service, executor, storage).launch(
      actor,
      projectId,
      input.data,
      idempotencyKey,
    );
    return NextResponse.json({ run: publicAnalysisRun(run) }, {
      status: 201,
      headers: {
        "Cache-Control": "no-store",
        "X-GEO-RateLimit-Mode": rateLimit.mode,
        "X-GEO-RateLimit-Remaining": String(rateLimit.remaining),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
