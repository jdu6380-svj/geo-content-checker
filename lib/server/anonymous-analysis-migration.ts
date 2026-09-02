import { NextResponse } from "next/server";

/**
 * Anonymous analysis is retained as a route-level compatibility surface only.
 * No request body is parsed before this response, so legacy handlers cannot
 * invoke a model, create an unowned result, or bypass commercial quota.
 */
export function anonymousAnalysisMigrationResponse(): NextResponse {
  return NextResponse.json(
    {
      error: "AUTHENTICATION_REQUIRED",
      message: "请登录后进入商业工作台开始分析。",
      next: "/sign-in?redirect_url=%2Fdashboard",
    },
    {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
        Deprecation: "true",
        "X-Analysis-Migration": "commercial-workspace",
      },
    },
  );
}

/** Kept as a runtime predicate so legacy handler code remains type-checkable. */
export function shouldMigrateAnonymousAnalysis(): boolean {
  return true;
}
