import { NextRequest, NextResponse } from "next/server";

import { resolveCommercialActor } from "@/lib/server/commercial/auth";
import {
  CommercialAuthUnavailableError,
  CommercialUnauthenticatedError,
  CommercialWorkspaceRequiredError,
  CommercialDataUnavailableError,
  CommercialIdempotencyConflictError,
  CommercialNotFoundError,
  CommercialQuotaExceededError,
  CommercialValidationError,
  publicAnalysisRunHistory,
} from "@/lib/server/commercial/domain";
import { getConfiguredCommercialService, type CommercialService } from "@/lib/server/commercial/service";
import { readCommercialJsonBody } from "@/lib/server/commercial/request-body";

function errorResponse(error: unknown): NextResponse {
  if (error instanceof CommercialAuthUnavailableError || error instanceof CommercialUnauthenticatedError || error instanceof CommercialWorkspaceRequiredError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  }
  if (error instanceof CommercialDataUnavailableError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  }
  if (
    error instanceof CommercialValidationError ||
    error instanceof CommercialNotFoundError ||
    error instanceof CommercialIdempotencyConflictError ||
    error instanceof CommercialQuotaExceededError
  ) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ error: "INTERNAL_ERROR", message: "商业请求暂时不可用。" }, { status: 500, headers: { "Cache-Control": "no-store" } });
}

function serviceOrThrow(getService = getConfiguredCommercialService) {
  const service = getService();
  if (!service) throw new CommercialDataUnavailableError();
  return service;
}

export type CommercialProjectsRouteDependencies = {
  resolveActor(request: Request): ReturnType<typeof resolveCommercialActor>;
  getService(): CommercialService | null;
};

const defaultDependencies: CommercialProjectsRouteDependencies = {
  resolveActor: resolveCommercialActor,
  getService: getConfiguredCommercialService,
};

export async function getCommercialProjects(
  request: NextRequest,
  dependencies: CommercialProjectsRouteDependencies = defaultDependencies,
): Promise<NextResponse> {
  try {
    const actor = await dependencies.resolveActor(request);
    const service = serviceOrThrow(dependencies.getService);
    const projects = await service.listProjects(actor);
    const history = await Promise.all(projects.map(async (project) => ({
      projectId: project.id,
      runs: (await service.listRuns(actor, project.id)).map(publicAnalysisRunHistory),
    })));
    return NextResponse.json({ projects, usage: await service.usage(actor), history }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function createCommercialProject(
  request: NextRequest,
  dependencies: CommercialProjectsRouteDependencies = defaultDependencies,
): Promise<NextResponse> {
  try {
    const actor = await dependencies.resolveActor(request);
    const input = await readCommercialJsonBody(request);
    const service = serviceOrThrow(dependencies.getService);
    const project = await service.createProject(actor, input, request.headers.get("idempotency-key") ?? undefined);
    return NextResponse.json({ project }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
