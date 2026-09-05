import { afterEach, describe, expect, it, vi } from "vitest";

import { isInterviewMode } from "@/lib/server/commercial/interview-mode";

afterEach(() => vi.unstubAllEnvs());

describe("preview interview mode", () => {
  it("automatically enables the portfolio path on Preview", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("NODE_ENV", "production");
    expect(isInterviewMode()).toBe(true);
  });

  it("never bypasses authentication on Production", () => {
    vi.stubEnv("NEXT_PUBLIC_EVIDRA_INTERVIEW_MODE", "true");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NODE_ENV", "production");
    expect(isInterviewMode()).toBe(false);
  });
});
