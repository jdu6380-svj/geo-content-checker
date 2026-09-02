import { afterEach, describe, expect, it, vi } from "vitest";

import {
  commercialTelemetryErrorCode,
  createCommercialOperationTelemetryEvent,
  emitCommercialOperationTelemetry,
  getCommercialTelemetrySink,
  readCommercialRequestId,
  type CommercialTelemetrySink,
} from "@/lib/server/commercial/observability";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("commercial operation observability", () => {
  it("emits allowlisted operation metadata with hashed references only", () => {
    const event = createCommercialOperationTelemetryEvent({
      operation: "result_read",
      workspaceId: "workspace_sensitive",
      resourceId: "run_sensitive",
      requestId: "request_sensitive",
      stage: "result_read_failed",
      status: "failed",
      durationMs: 999_999_999,
      errorCode: "PROVIDER_RAW_SECRET",
    });
    const serialized = JSON.stringify(event);
    expect(event).toMatchObject({
      event: "commercial_operation",
      operation: "result_read",
      stage: "result_read_failed",
      status: "failed",
      durationMs: 86_400_000,
      errorCode: "INTERNAL_ERROR",
    });
    expect(event.workspaceRef).toMatch(/^ws_[a-f0-9]{16}$/);
    expect(event.runRef).toMatch(/^run_[a-f0-9]{16}$/);
    expect(event.requestRef).toMatch(/^req_[a-f0-9]{16}$/);
    expect(Object.keys(event).sort()).toEqual(["durationMs", "errorCode", "event", "operation", "requestRef", "runRef", "stage", "status", "workspaceRef"]);
    expect(serialized).not.toContain("workspace_sensitive");
    expect(serialized).not.toContain("run_sensitive");
    expect(serialized).not.toContain("request_sensitive");
    expect(serialized).not.toContain("PROVIDER_RAW_SECRET");
  });

  it("maps known domain errors and never lets a sink failure escape", () => {
    expect(commercialTelemetryErrorCode({ code: "PAYMENT_UNAVAILABLE" })).toBe("PAYMENT_UNAVAILABLE");
    expect(commercialTelemetryErrorCode(new Error("provider secret"))).toBe("INTERNAL_ERROR");
    const emit = vi.fn(() => { throw new Error("sink unavailable"); });
    const sink: CommercialTelemetrySink = { emit };
    expect(() => emitCommercialOperationTelemetry(sink, {
      operation: "payment",
      workspaceId: "workspace_1",
      resourceId: "checkout",
      stage: "payment_unavailable",
      status: "unavailable",
      durationMs: 4,
      errorCode: "PAYMENT_UNAVAILABLE",
    })).not.toThrow();
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it("swallows asynchronous sink rejection", async () => {
    const sink: CommercialTelemetrySink = { emit: async () => { throw new Error("sink unavailable"); } };
    expect(() => emitCommercialOperationTelemetry(sink, {
      operation: "quota",
      workspaceId: "workspace_1",
      resourceId: "run_1",
      stage: "quota_released",
      status: "released",
      durationMs: 2,
    })).not.toThrow();
    await Promise.resolve();
  });

  it("supports missing workspace/request references without exposing a raw identifier", () => {
    const event = createCommercialOperationTelemetryEvent({
      operation: "onboarding",
      stage: "onboarding_failed",
      status: "failed",
      durationMs: -10,
      errorCode: "WORKSPACE_REQUIRED",
    });
    expect(event.workspaceRef).toMatch(/^ws_[a-f0-9]{16}$/);
    expect(event.runRef).toMatch(/^run_[a-f0-9]{16}$/);
    expect(event.durationMs).toBe(0);
    expect(event.errorCode).toBe("WORKSPACE_REQUIRED");
  });

  it("keeps the default sink no-op and only enables console explicitly", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.stubEnv("COMMERCIAL_TELEMETRY", "");
    getCommercialTelemetrySink().emit(createCommercialOperationTelemetryEvent({ operation: "quota", stage: "quota_reserved", status: "reserved", durationMs: 1 }));
    expect(info).not.toHaveBeenCalled();

    vi.stubEnv("COMMERCIAL_TELEMETRY", "console");
    getCommercialTelemetrySink().emit(createCommercialOperationTelemetryEvent({ operation: "quota", workspaceId: "workspace_secret", resourceId: "run_secret", stage: "quota_reserved", status: "reserved", durationMs: 1 }));
    expect(info).toHaveBeenCalledTimes(1);
    expect(String(info.mock.calls[0][0])).not.toMatch(/workspace_secret|run_secret/);
  });

  it("accepts a bounded correlation header and ignores malformed values", () => {
    expect(readCommercialRequestId(new Request("https://app.test", { headers: { "x-request-id": "req_123" } }))).toBe("req_123");
    expect(readCommercialRequestId(new Request("https://app.test", { headers: { "x-request-id": "raw secret value" } }))).toBeUndefined();
  });
});
