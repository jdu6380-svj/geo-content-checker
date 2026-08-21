import * as Sentry from "@sentry/nextjs";

import {
  sentryBeforeBreadcrumb,
  sentryDsn,
  sentryTraceSampleRate,
  scrubSentryEvent,
} from "@/lib/sentry-scrub";

Sentry.init({
  dsn: sentryDsn(),
  enabled: Boolean(sentryDsn()),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
  sendDefaultPii: false,
  tracesSampleRate: sentryTraceSampleRate(),
  beforeSend: scrubSentryEvent,
  beforeBreadcrumb: sentryBeforeBreadcrumb,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
