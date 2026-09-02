import { createHash } from "node:crypto";

import type { AnalysisRun } from "./domain";

export const COMMERCIAL_TELEMETRY_STAGES = [
  "launch_started",
  "run_reused",
  "execution_started",
  "result_persisting",
  "result_persisted",
  "succeeded",
  "failed",
  "quota_reservation_started",
  "quota_reserved",
  "quota_reused",
  "quota_rejected",
  "quota_charge_recorded",
  "quota_released",
  "quota_settlement_conflict",
  "quota_settlement_failed",
  "result_read_started",
  "result_read_succeeded",
  "result_read_not_ready",
  "result_read_failed",
  "payment_started",
  "payment_succeeded",
  "payment_unavailable",
  "payment_failed",
  "onboarding_started",
  "onboarding_succeeded",
  "onboarding_failed",
  "recovery_started",
  "recovery_succeeded",
  "recovery_conflict",
  "recovery_failed",
] as const;

export type CommercialTelemetryStage = (typeof COMMERCIAL_TELEMETRY_STAGES)[number];

type CommercialTelemetryStatus =
  | AnalysisRun["status"]
  | "started"
  | "reserved"
  | "reused"
  | "rejected"
  | "charged"
  | "released"
  | "conflict"
  | "not_ready"
  | "unavailable"
  | "succeeded";

export const COMMERCIAL_TELEMETRY_OPERATIONS = [
  "quota",
  "result_read",
  "payment",
  "onboarding",
  "recovery",
] as const;

export type CommercialTelemetryOperation = (typeof COMMERCIAL_TELEMETRY_OPERATIONS)[number];

const SAFE_ERROR_CODES = new Set([
  "DATA_UNAVAILABLE",
  "EXECUTION_FAILED",
  "EXECUTION_INVALID_OUTPUT",
  "EXECUTION_RETRYABLE",
  "EXECUTION_UNAVAILABLE",
  "INTERNAL_ERROR",
  "INVALID_REQUEST",
  "NOT_FOUND",
  "RESULT_NOT_READY",
  "IDEMPOTENCY_CONFLICT",
  "USAGE_QUOTA_EXCEEDED",
  "RATE_LIMITED",
  "RATE_LIMIT_UNAVAILABLE",
  "AUTH_UNAVAILABLE",
  "UNAUTHENTICATED",
  "WORKSPACE_REQUIRED",
  "PAYMENT_UNAVAILABLE",
  "SUBSCRIPTION_MANAGEMENT_UNAVAILABLE",
  "PAYMENT_RESPONSE_INVALID",
  "SIGNATURE_INVALID",
  "FORBIDDEN",
  "RUN_RECOVERY_CONFLICT",
  "WORKSPACE_ADMIN_REQUIRED",
  "ONBOARDING_UNAVAILABLE",
  "PAYMENT_EVENT_FAILED",
]);

export type CommercialTelemetryEvent = {
  event: "commercial_run" | "commercial_operation";
  stage: CommercialTelemetryStage;
  status: CommercialTelemetryStatus;
  workspaceRef: string;
  runRef: string;
  durationMs: number;
  operation?: CommercialTelemetryOperation;
  requestRef?: string;
  errorCode?: string;
};

export interface CommercialTelemetrySink {
  emit(event: CommercialTelemetryEvent): void | Promise<void>;
}

function reference(prefix: "ws" | "run" | "req", value: string): string {
  return `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}

function safeDuration(value: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.min(Math.round(value), 86_400_000) : 0;
}

function safeErrorCode(value: unknown): string | undefined {
  if (typeof value !== "string" || !SAFE_ERROR_CODES.has(value)) return value === undefined ? undefined : "INTERNAL_ERROR";
  return value;
}

export function commercialTelemetryErrorCode(error: unknown): string {
  const value = error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : undefined;
  return safeErrorCode(value) ?? "INTERNAL_ERROR";
}

export function readCommercialRequestId(request: Request): string | undefined {
  for (const name of ["x-request-id", "x-correlation-id", "x-vercel-id"]) {
    const value = request.headers.get(name)?.trim();
    if (value && value.length <= 128 && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) return value;
  }
  return undefined;
}

export function createCommercialTelemetryEvent(input: {
  workspaceId: string;
  runId: string;
  stage: CommercialTelemetryStage;
  status: CommercialTelemetryStatus;
  durationMs: number;
  errorCode?: unknown;
}): CommercialTelemetryEvent {
  const errorCode = safeErrorCode(input.errorCode);
  return {
    event: "commercial_run",
    stage: COMMERCIAL_TELEMETRY_STAGES.includes(input.stage) ? input.stage : "failed",
    status: input.status,
    workspaceRef: reference("ws", input.workspaceId),
    runRef: reference("run", input.runId),
    durationMs: safeDuration(input.durationMs),
    ...(errorCode ? { errorCode } : {}),
  };
}

export function createCommercialOperationTelemetryEvent(input: {
  operation: CommercialTelemetryOperation;
  workspaceId?: string;
  resourceId?: string;
  requestId?: string | null;
  stage: CommercialTelemetryStage;
  status: CommercialTelemetryStatus;
  durationMs: number;
  errorCode?: unknown;
}): CommercialTelemetryEvent {
  const errorCode = safeErrorCode(input.errorCode);
  const operation = COMMERCIAL_TELEMETRY_OPERATIONS.includes(input.operation) ? input.operation : "recovery";
  const stage = COMMERCIAL_TELEMETRY_STAGES.includes(input.stage) ? input.stage : "failed";
  const workspaceId = input.workspaceId?.trim() || "unknown_workspace";
  const resourceId = input.resourceId?.trim() || input.requestId?.trim() || operation;
  return {
    event: "commercial_operation",
    operation,
    stage,
    status: input.status,
    workspaceRef: reference("ws", workspaceId),
    runRef: reference("run", resourceId),
    durationMs: safeDuration(input.durationMs),
    ...(input.requestId?.trim() ? { requestRef: reference("req", input.requestId.trim()) } : {}),
    ...(errorCode ? { errorCode } : {}),
  };
}

class ConsoleCommercialTelemetrySink implements CommercialTelemetrySink {
  emit(event: CommercialTelemetryEvent): void {
    console.info(JSON.stringify(event));
  }
}

class NoopCommercialTelemetrySink implements CommercialTelemetrySink {
  emit(_event: CommercialTelemetryEvent): void {}
}

export function getCommercialTelemetrySink(): CommercialTelemetrySink {
  return process.env.COMMERCIAL_TELEMETRY === "console"
    ? new ConsoleCommercialTelemetrySink()
    : new NoopCommercialTelemetrySink();
}

export function emitCommercialTelemetry(
  sink: CommercialTelemetrySink,
  input: Parameters<typeof createCommercialTelemetryEvent>[0],
): void {
  try {
    const result = sink.emit(createCommercialTelemetryEvent(input));
    if (result && typeof (result as Promise<void>).catch === "function") {
      void (result as Promise<void>).catch(() => undefined);
    }
  } catch {
    // Observability must never change the commercial execution outcome.
  }
}

export function emitCommercialOperationTelemetry(
  sink: CommercialTelemetrySink,
  input: Parameters<typeof createCommercialOperationTelemetryEvent>[0],
): void {
  try {
    const result = sink.emit(createCommercialOperationTelemetryEvent(input));
    if (result && typeof (result as Promise<void>).catch === "function") {
      void (result as Promise<void>).catch(() => undefined);
    }
  } catch {
    // Observability must never change the commercial operation outcome.
  }
}
