import { NextResponse } from "next/server";
import { resolveVerifiedCommercialActor } from "@/lib/server/commercial/auth";

type Dependencies = {
  resolveActor(request: Request): Promise<unknown>;
  provider(): string | undefined;
  amounts(): string | undefined;
  limits(): string | undefined;
};

const safeErrorMessages: Record<string, string> = {
  AUTH_UNAVAILABLE: "商业身份服务尚未配置。",
  UNAUTHENTICATED: "请先登录后访问工作台。",
  WORKSPACE_REQUIRED: "当前账户未绑定可用工作区。",
  PAYMENT_UNAVAILABLE: "支付服务尚未配置。",
};

function mapping(value: string | undefined): Map<string, string> {
  return new Map((value?.split(",") ?? []).map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const separator = entry.indexOf("=");
    return [entry.slice(0, separator), entry.slice(separator + 1)];
  }));
}

export async function createAlipayPlansGet(request: Request, dependencies: Dependencies = {
  resolveActor: resolveVerifiedCommercialActor,
  provider: () => process.env.COMMERCIAL_PAYMENT_PROVIDER,
  amounts: () => process.env.ALIPAY_PLAN_AMOUNT_MAP,
  limits: () => process.env.ALIPAY_PLAN_RUN_LIMIT_MAP,
}): Promise<NextResponse> {
  try {
    await dependencies.resolveActor(request);
    if (dependencies.provider() !== "alipay") return NextResponse.json({ error: "PAYMENT_UNAVAILABLE", message: "支付服务尚未配置。" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    const amounts = mapping(dependencies.amounts());
    const limits = mapping(dependencies.limits());
    const plans = [...amounts].flatMap(([key, amount]) => {
      const limit = Number(limits.get(key));
      return /^[A-Za-z0-9_-]+$/.test(key) && /^(?:0|[1-9]\d*)\.\d{2}$/.test(amount) && Number.isSafeInteger(limit) && limit > 0 ? [{ key, amount, runLimit: limit }] : [];
    });
    if (!plans.length || plans.length !== amounts.size || plans.length !== limits.size) return NextResponse.json({ error: "PAYMENT_UNAVAILABLE", message: "支付服务尚未配置。" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ plans }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const known = error as { code?: string; status?: number };
    const code = known.code && safeErrorMessages[known.code] ? known.code : "UNAUTHENTICATED";
    const status = code === "PAYMENT_UNAVAILABLE" ? 503 : code === "AUTH_UNAVAILABLE" ? 503 : code === "WORKSPACE_REQUIRED" ? 403 : 401;
    return NextResponse.json({ error: code, message: safeErrorMessages[code] }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
