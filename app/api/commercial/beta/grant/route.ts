import { NextResponse } from "next/server";

import { resolveVerifiedCommercialActor } from "@/lib/server/commercial/auth";
import { BetaAccessService, getNeonBetaAccessRepository } from "@/lib/server/commercial/beta-access";
import { CommercialDataUnavailableError, CommercialValidationError } from "@/lib/server/commercial/domain";
import { readCommercialJsonBody } from "@/lib/server/commercial/request-body";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const repository = getNeonBetaAccessRepository();
    if (!repository) throw new CommercialDataUnavailableError();
    const actor = await resolveVerifiedCommercialActor(request);
    const body = await readCommercialJsonBody(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new CommercialValidationError();
    const value = body as Record<string, unknown>;
    if (Object.keys(value).some((key) => key !== "runLimit" && key !== "expiresAt")) throw new CommercialValidationError();
    if (typeof value.runLimit !== "number" || typeof value.expiresAt !== "string") throw new CommercialValidationError();
    const grant = await new BetaAccessService(repository).grant(actor, {
      workspaceId: actor.workspaceId,
      runLimit: value.runLimit,
      expiresAt: value.expiresAt,
      idempotencyKey: request.headers.get("idempotency-key")?.trim() ?? "",
    });
    return NextResponse.json({ grant }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "INTERNAL_ERROR";
    const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 500;
    const message = error instanceof CommercialValidationError ? error.message : code === "FORBIDDEN" ? "仅受信任的 Beta 运营账号可发放授权。" : "Beta 授权服务暂不可用。";
    return NextResponse.json({ error: code, message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
