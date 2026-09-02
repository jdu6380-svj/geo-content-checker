import { NextRequest, NextResponse } from "next/server";
import { getConfiguredAlipayAdapter } from "@/lib/server/commercial/alipay-runtime";
import type { PaymentAdapter } from "@/lib/server/commercial/providers";
import {
  commercialTelemetryErrorCode,
  emitCommercialOperationTelemetry,
  getCommercialTelemetrySink,
  type CommercialTelemetrySink,
} from "@/lib/server/commercial/observability";

type NotifyDependencies = { getAdapter(): PaymentAdapter | null; telemetry?: CommercialTelemetrySink };
const defaults: NotifyDependencies = { getAdapter: getConfiguredAlipayAdapter, telemetry: getCommercialTelemetrySink() };

const publicErrors: Record<string, { status: number; message: string }> = {
  PAYMENT_UNAVAILABLE: { status: 503, message: "支付服务尚未配置。" },
  PAYMENT_RESPONSE_INVALID: { status: 502, message: "支付服务返回了无法验证的数据。" },
  SIGNATURE_INVALID: { status: 400, message: "签名校验失败。" },
  DATA_UNAVAILABLE: { status: 503, message: "支付回调处理暂时不可用。" },
};

export async function createAlipayNotifyPost(request: NextRequest, dependencies: NotifyDependencies = defaults): Promise<NextResponse> {
  const startedAt = performance.now();
  const sink = dependencies.telemetry ?? getCommercialTelemetrySink();
  const adapter = dependencies.getAdapter(); if (!adapter) {
    emitCommercialOperationTelemetry(sink, { operation: "payment", resourceId: "notify", stage: "payment_unavailable", status: "unavailable", durationMs: performance.now() - startedAt, errorCode: "PAYMENT_UNAVAILABLE" });
    return NextResponse.json({ error: "PAYMENT_UNAVAILABLE", message: "支付服务尚未配置。" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const signature = request.headers.get("alipay-signature")?.trim() ?? new URL(request.url).searchParams.get("sign")?.trim() ?? "";
  try {
    const result = await adapter.handleWebhook(await request.text(), signature);
    emitCommercialOperationTelemetry(sink, { operation: "payment", resourceId: "notify", stage: "payment_succeeded", status: "succeeded", durationMs: performance.now() - startedAt });
    return NextResponse.json({ received: true, duplicate: result.duplicate }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = commercialTelemetryErrorCode(error);
    emitCommercialOperationTelemetry(sink, { operation: "payment", resourceId: "notify", stage: code === "PAYMENT_UNAVAILABLE" ? "payment_unavailable" : "payment_failed", status: code === "PAYMENT_UNAVAILABLE" ? "unavailable" : "failed", durationMs: performance.now() - startedAt, errorCode: code });
    const safe = code ? publicErrors[code] : undefined;
    return NextResponse.json(
      { error: safe ? code : "PAYMENT_EVENT_FAILED", message: safe?.message ?? "支付回调处理暂时不可用。" },
      { status: safe?.status ?? 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
