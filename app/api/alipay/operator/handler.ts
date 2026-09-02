import { NextResponse } from "next/server";
import { resolveVerifiedCommercialActor } from "@/lib/server/commercial/auth";
import { AlipayOperatorService } from "@/lib/server/commercial/alipay-operator";
import { NeonAlipayPaymentRepository } from "@/lib/server/commercial/neon-alipay-repository";
import type { CommercialActor } from "@/lib/server/commercial/domain";
import { readCommercialJsonBody } from "@/lib/server/commercial/request-body";
import { normalizeCommercialIdempotencyKey } from "@/lib/server/commercial/service";

type Dependencies = { resolveActor(request: Request): Promise<CommercialActor>; service: AlipayOperatorService };
const defaults: Dependencies = { resolveActor: resolveVerifiedCommercialActor, service: new AlipayOperatorService(new NeonAlipayPaymentRepository()) };

function errorResponse(error: unknown): NextResponse {
  const known = error as { code?: string };
  const messages: Record<string, string> = {
    INVALID_REQUEST: "运营请求格式不正确。",
    UNAUTHENTICATED: "请先登录。",
    WORKSPACE_REQUIRED: "当前账户未绑定可用工作区。",
    FORBIDDEN: "仅工作区所有者可使用支付运营能力。",
    IDEMPOTENCY_CONFLICT: "幂等键已用于不同运营请求。",
    DATA_UNAVAILABLE: "运营能力暂不可用。",
  };
  const code = known.code && messages[known.code] ? known.code : "OPERATOR_UNAVAILABLE";
  const status = code === "INVALID_REQUEST" ? 400 : code === "UNAUTHENTICATED" ? 401 : code === "WORKSPACE_REQUIRED" || code === "FORBIDDEN" ? 403 : code === "IDEMPOTENCY_CONFLICT" ? 409 : 503;
  return NextResponse.json({ error: code, message: messages[code] ?? "运营能力暂不可用。" }, { status, headers: { "Cache-Control": "no-store" } });
}
export async function createOperatorGet(request: Request, dependencies = defaults): Promise<NextResponse> { try { const actor = await dependencies.resolveActor(request); return NextResponse.json({ requests: await dependencies.service.list(actor) }, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return errorResponse(error); } }
export async function createOperatorPost(request: Request, dependencies = defaults): Promise<NextResponse> { try { const actor = await dependencies.resolveActor(request); const body = await readCommercialJsonBody(request); const key = normalizeCommercialIdempotencyKey(request.headers.get("idempotency-key")); const result = await dependencies.service.create(actor, body, key ?? null); return NextResponse.json({ request: result }, { status: 201, headers: { "Cache-Control": "no-store" } }); } catch (error) { return errorResponse(error); } }
