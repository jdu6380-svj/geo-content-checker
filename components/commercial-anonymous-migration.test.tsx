import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST as analysisSession } from "@/app/api/analysis-session/route";
import { POST as evaluateScoring } from "@/app/api/evaluate-scoring/route";
import { POST as predictQuestions } from "@/app/api/predict-questions/route";
import { POST as qaDiagnostic } from "@/app/api/qa-diagnostic/route";
import { POST as generatePatches } from "@/app/api/generate-patches/route";
import { POST as warmup } from "@/app/api/warmup/route";
import * as openAi from "@/lib/ai/openai-compatible";

const legacyRoutes = [
  ["/api/analysis-session", analysisSession],
  ["/api/evaluate-scoring", evaluateScoring],
  ["/api/predict-questions", predictQuestions],
  ["/api/qa-diagnostic", qaDiagnostic],
  ["/api/generate-patches", generatePatches],
  ["/api/warmup", warmup],
] as const;

describe("anonymous analysis migration boundary", () => {
  it("rejects every legacy execution route before parsing input or invoking a provider", async () => {
    const provider = vi.spyOn(openAi, "callOpenAICompatibleModel");
    const secretContent = "do not persist or expose this legacy article";

    for (const [path, route] of legacyRoutes) {
      const request = new NextRequest(`https://app.test${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: secretContent, content: secretContent }),
      });
      const response = await route(request);
      expect(response.status, path).toBe(401);
      expect(response.headers.get("cache-control"), path).toBe("no-store");
      expect(response.headers.get("x-analysis-migration"), path).toBe("commercial-workspace");

      const body = await response.json();
      expect(body, path).toEqual({
        error: "AUTHENTICATION_REQUIRED",
        message: "请登录后进入商业工作台开始分析。",
        next: "/sign-in?redirect_url=%2Fdashboard",
      });
      expect(JSON.stringify(body), path).not.toContain(secretContent);
    }

    expect(provider).not.toHaveBeenCalled();
  });

  it("keeps the migration response stable and free of tenant or provider identifiers", async () => {
    const request = new NextRequest("https://app.test/api/evaluate-scoring", {
      method: "POST",
      body: "not-json",
    });
    const response = await evaluateScoring(request);
    const serialized = await response.text();
    expect(serialized).not.toMatch(/workspace|run|blob|secret|provider|stack/i);
    expect(response.status).toBe(401);
  });
});
