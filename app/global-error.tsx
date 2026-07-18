"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
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
