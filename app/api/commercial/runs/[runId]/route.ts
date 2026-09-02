import { NextRequest, NextResponse } from "next/server";

import { resolveCommercialActor } from "@/lib/server/commercial/auth";
import {
  CommercialAuthUnavailableError,
  CommercialDataUnavailableError,
  CommercialNotFoundError,
  CommercialUnauthenticatedError,
  CommercialWorkspaceRequiredError,
  publicAnalysisRun,
} from "@/lib/server/commercial/domain";
import { getConfiguredCommercialService } from "@/lib/server/commercial/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> },
): Promise<NextResponse> {
  try {
    const actor = await resolveCommercialActor(request);
    const service = getConfiguredCommercialService();
    if (!service) throw new CommercialDataUnavailableError();
    const { runId } = await context.params;
    const run = await service.getRun(actor, runId);
    if (!run) throw new CommercialNotFoundError("运行记录不存在。");
    return NextResponse.json({ run: publicAnalysisRun(run) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (
      error instanceof CommercialAuthUnavailableError ||
      error instanceof CommercialUnauthenticatedError ||
      error instanceof CommercialWorkspaceRequiredError ||
      error instanceof CommercialDataUnavailableError ||
      error instanceof CommercialNotFoundError
    ) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "INTERNAL_ERROR", message: "运行记录暂时不可用。" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
