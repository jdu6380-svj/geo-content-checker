type SentryEventLike = {
  event_id?: string;
  message?: string;
  logentry?: unknown;
  exception?: {
    values?: Array<{
      type?: string;
      value?: string;
    }>;
  };
  request?: {
    url?: string;
    method?: string;
    data?: unknown;
    headers?: Record<string, unknown>;
    cookies?: unknown;
    query_string?: unknown;
  };
  user?: unknown;
  extra?: Record<string, unknown>;
  breadcrumbs?: Array<{
    category?: string;
    message?: string;
    data?: unknown;
  }>;
};

export const SENTRY_CONTROLLED_ERROR_NAME = "A5SmokeError";

const SENTRY_ERROR_STAGES = [
  "request_started",
  "validation_completed",
  "adapter_called",
  "provider_request_sent",
  "provider_response_received",
  "parser_started",
  "parser_completed",
  "response_returned",
  "client_global_error",
  "unknown",
] as const;

const SENTRY_ERROR_CATEGORIES = [
  "application",
  "controlled_error",
  "configuration",
  "budget",
  "provider_http",
  "provider_timeout",
  "provider_network",
  "provider_response_parse",
  "provider_invalid_output",
  "unknown",
] as const;

type SentryErrorStage = (typeof SENTRY_ERROR_STAGES)[number];
type SentryErrorCategory = (typeof SENTRY_ERROR_CATEGORIES)[number];

export type SentryErrorContext = Record<string, string | number> & {
  requestId: string;
  route: string;
  stage: SentryErrorStage;
  latency: number;
  errorCategory: SentryErrorCategory;
};

const SAFE_EXTRA_KEYS = new Set([
  "route",
  "requestId",
  "stage",
  "latency",
  "errorCategory",
  "status",
  "durationMs",
  "source",
  "modelStatus",
  "rateLimitMode",
  "modelLatencyMs",
  "promptTokens",
  "completionTokens",
  "totalTokens",
  "estimatedCostUsd",
]);

function sanitizeSentryRequestId(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_:-]{1,128}$/.test(value)
    ? value
    : null;
}

function createSentryRequestId(): string {
  try {
    const generated = globalThis.crypto?.randomUUID?.();
    if (generated) return generated;
  } catch {
    // Use the non-sensitive timestamp fallback below.
  }
  return `sentry-${Date.now().toString(36)}`;
}

function sanitizeSentryRoute(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 512) return null;

  try {
    const pathname = value.startsWith("http://") || value.startsWith("https://")
      ? new URL(value).pathname
      : value.split(/[?#]/, 1)[0];
    return pathname.length <= 160 && /^\/[A-Za-z0-9/_-]*$/.test(pathname)
      ? pathname
      : null;
  } catch {
    return null;
  }
}

function sanitizeSentryLatency(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 86_400_000
    ? Math.round(value)
    : null;
}

function sanitizeSentryStage(value: unknown): SentryErrorStage | null {
  return SENTRY_ERROR_STAGES.includes(value as SentryErrorStage)
    ? (value as SentryErrorStage)
    : null;
}

function sanitizeSentryErrorCategory(value: unknown): SentryErrorCategory | null {
  return SENTRY_ERROR_CATEGORIES.includes(value as SentryErrorCategory)
    ? (value as SentryErrorCategory)
    : null;
}

function sanitizeSentryScalar(value: unknown): string | number | boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,128}$/.test(value)
    ? value
    : null;
}

function sanitizeSentryExtra(extra: Record<string, unknown> | undefined) {
  if (!extra) return undefined;

  const sanitized: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(extra)) {
    if (!SAFE_EXTRA_KEYS.has(key)) continue;

    const normalized = key === "requestId"
      ? sanitizeSentryRequestId(value)
      : key === "route"
        ? sanitizeSentryRoute(value)
        : key === "stage"
          ? sanitizeSentryStage(value)
          : key === "latency"
            ? sanitizeSentryLatency(value)
            : key === "errorCategory"
              ? sanitizeSentryErrorCategory(value)
              : sanitizeSentryScalar(value);
    if (normalized !== null) sanitized[key] = normalized;
  }
  return sanitized;
}

export function createSentryErrorContext(input: {
  requestId?: unknown;
  route?: unknown;
  stage?: unknown;
  latency?: unknown;
  errorCategory?: unknown;
}): SentryErrorContext {
  return {
    requestId: sanitizeSentryRequestId(input.requestId) ?? createSentryRequestId(),
    route: sanitizeSentryRoute(input.route) ?? "/",
    stage: sanitizeSentryStage(input.stage) ?? "unknown",
    latency: sanitizeSentryLatency(input.latency) ?? 0,
    errorCategory: sanitizeSentryErrorCategory(input.errorCategory) ?? "unknown",
  };
}

export function scrubSentryEvent<T extends SentryEventLike>(event: T): T {
  const controlledError = event.exception?.values?.some(
    (value) => value.type === SENTRY_CONTROLLED_ERROR_NAME,
  ) ?? false;
  const requestRoute = sanitizeSentryRoute(event.request?.url);

  if (controlledError) {
    event.extra = {
      ...event.extra,
      ...createSentryErrorContext({
        requestId: event.event_id,
        route: requestRoute,
        stage: "client_global_error",
        latency: 0,
        errorCategory: "controlled_error",
      }),
    };
  }

  event.message = undefined;
  event.logentry = undefined;
  if (event.exception?.values) {
    event.exception.values = event.exception.values.map((value) => ({
      ...value,
      type:
        typeof value.type === "string" && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value.type)
          ? value.type
          : "Error",
      value:
        typeof value.type === "string" && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value.type)
          ? value.type
          : "Error",
    }));
  }

  if (event.request) {
    event.request.url = requestRoute ?? undefined;
    event.request.data = undefined;
    event.request.headers = undefined;
    event.request.cookies = undefined;
    event.request.query_string = undefined;
  }

  event.user = undefined;
  event.extra = sanitizeSentryExtra(event.extra);
  event.breadcrumbs = [];

  return event;
}

export function sentryBeforeBreadcrumb(): null {
  return null;
}

export function sentryDsn(): string | undefined {
  return process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || process.env.SENTRY_DSN?.trim();
}

export function sentryTraceSampleRate(): number {
  const configured = Number(process.env.SENTRY_TRACES_SAMPLE_RATE);
  if (Number.isFinite(configured) && configured >= 0 && configured <= 1) return configured;
  return process.env.NODE_ENV === "production" ? 0.1 : 0;
}
