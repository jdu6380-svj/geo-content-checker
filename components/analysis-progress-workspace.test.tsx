import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AnalysisProgressWorkspace } from "@/components/analysis-progress-workspace";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AnalysisProgressWorkspace accessibility", () => {
  it("exposes the visual progress as a labelled progressbar", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(performance.now() + 2_000);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => undefined);

    render(
      <AnalysisProgressWorkspace
        sessionStatus="loading"
        scoring={{ status: "loading" }}
        questions={{ status: "loading" }}
        diagnostics={{}}
        diagnosticsSettled={false}
        diagnosticsPending={true}
        restoredFromCache={false}
        activeStep={0}
        animationKey={0}
        progressComplete={false}
        onReturnToEditor={() => undefined}
        onRestartAnalysis={() => undefined}
      />,
    );

    const progressbar = screen.getByRole("progressbar", { name: "内容分析进度" });
    expect(progressbar.getAttribute("aria-valuemin")).toBe("0");
    expect(progressbar.getAttribute("aria-valuemax")).toBe("100");
    expect(Number(progressbar.getAttribute("aria-valuenow"))).toBeGreaterThanOrEqual(0);
    expect(Number(progressbar.getAttribute("aria-valuenow"))).toBeLessThanOrEqual(100);
    expect(progressbar.getAttribute("aria-valuetext")).toMatch(/^\d+%$/);
  });
});
