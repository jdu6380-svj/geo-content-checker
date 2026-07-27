"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

import {
  createSentryErrorContext,
  SENTRY_CONTROLLED_ERROR_NAME,
} from "@/lib/sentry-scrub";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    const context = createSentryErrorContext({
      route: window.location.pathname,
      stage: "client_global_error",
      latency: window.performance.now(),
      errorCategory:
        error.name === SENTRY_CONTROLLED_ERROR_NAME
          ? "controlled_error"
          : "application",
    });
    Sentry.captureException(error, {
      tags: {
        route: context.route,
        stage: context.stage,
        errorCategory: context.errorCategory,
      },
      extra: context,
    });
  }, [error]);

  return (
    <html lang="zh-CN">
      <body>
        <main style={{ margin: "4rem auto", maxWidth: 560, padding: "0 1.5rem" }}>
          <h1>页面暂时无法加载</h1>
          <p>请重试；如果问题持续，请通过反馈入口联系我们。</p>
          <button type="button" onClick={() => reset()}>
            重试
          </button>
        </main>
      </body>
    </html>
  );
}
