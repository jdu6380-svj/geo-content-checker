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
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
  sendDefaultPii: false,
  tracesSampleRate: sentryTraceSampleRate(),
  beforeSend: scrubSentryEvent,
  beforeBreadcrumb: sentryBeforeBreadcrumb,
});
