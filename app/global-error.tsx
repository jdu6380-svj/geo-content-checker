"use client";

import * as Sentry from "@sentry/nextjs";
import { AlertTriangle, ArrowLeft, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect } from "react";

import { EvidraBrandMark } from "@/components/evidra-brand-mark";
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
      <body className="global-error-body">
        <main className="global-error-shell">
          <section className="global-error-panel" aria-labelledby="global-error-title">
            <header className="global-error-brand">
              <EvidraBrandMark className="brand-mark size-10 shrink-0" />
              <span>
                <span className="app-brand-name block">Evidra</span>
                <span className="app-brand-subtitle mt-1 block">AI 内容可信度审查</span>
              </span>
            </header>

            <div className="global-error-content">
              <span className="global-error-icon" aria-hidden="true">
                <AlertTriangle className="size-5" />
              </span>
              <p className="section-kicker">WORKSPACE INTERRUPTION</p>
              <h1 id="global-error-title" className="mt-2 text-2xl font-semibold text-[var(--geo-text)] sm:text-3xl">
                当前页面暂时无法继续
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-7 text-[var(--geo-text-muted)]">
                请先重试当前页面。若问题持续，可返回工作台重新开始；已完成的本地草稿不会因为本次错误自动上传。
              </p>

              <div className="global-error-privacy mt-5 flex items-start gap-3">
                <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <p>错误事件按隐私规则脱敏记录，不包含文章正文、Prompt 或模型输出内容。</p>
              </div>

              <div className="global-error-actions mt-6 flex flex-col gap-2 sm:flex-row">
                <button type="button" onClick={() => reset()} className="primary-button inline-flex h-10 items-center justify-center gap-2 px-4 text-sm font-semibold">
                  <RefreshCw aria-hidden="true" className="size-4" />
                  重试当前页面
                </button>
                <button type="button" onClick={() => window.location.assign("/")} className="secondary-button inline-flex h-10 items-center justify-center gap-2 px-4 text-sm font-semibold">
                  <ArrowLeft aria-hidden="true" className="size-4" />
                  返回审查工作台
                </button>
              </div>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
