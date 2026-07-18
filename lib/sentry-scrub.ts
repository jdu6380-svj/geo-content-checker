type SentryEventLike = {
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

const SAFE_EXTRA_KEYS = new Set([
  "route",
  "requestId",
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

export function scrubSentryEvent<T extends SentryEventLike>(event: T): T {
  event.message = undefined;
  event.logentry = undefined;
  if (event.exception?.values) {
    event.exception.values = event.exception.values.map((value) => ({
      ...value,
      value: value.type || "Error",
    }));
  }

  if (event.request) {
    const pathname = event.request.url
      ? (() => {
          try {
            return new URL(event.request.url).pathname;
          } catch {
            return undefined;
          }
        })()
      : undefined;
    event.request.url = pathname;
    event.request.data = undefined;
    event.request.headers = undefined;
    event.request.cookies = undefined;
    event.request.query_string = undefined;
  }

  event.user = undefined;
  if (event.extra) {
    event.extra = Object.fromEntries(
      Object.entries(event.extra).filter(([key]) => SAFE_EXTRA_KEYS.has(key)),
    );
  }
  event.breadcrumbs = event.breadcrumbs
    ?.filter((breadcrumb) => !["console", "fetch", "xhr"].includes(breadcrumb.category || ""))
    .map((breadcrumb) => ({
      ...breadcrumb,
      data: undefined,
    }));

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
