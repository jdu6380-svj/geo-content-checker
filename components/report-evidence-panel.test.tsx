import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReportEvidencePanel } from "@/components/report-evidence-panel";

const paragraph = { id: "Para-1" as const, text: "可核对的正文段落。" };

function renderPanel(evidence: Array<{ paragraphId: "Para-1"; quote: string }>) {
  return render(
    <ReportEvidencePanel
      title="内容团队发布前审查"
      paragraphs={[paragraph]}
      diagnostics={{
        问题一: {
          question: "问题一",
          status: "success",
          errorCount: 0,
          data: {
            question: "问题一",
            answerability: "信息不足",
            riskLevel: "medium",
            evidence,
            missingInfo: evidence.length ? [] : ["缺少可核验来源"],
            recommendation: "补充可核验来源。",
            source: "fallback",
            evidenceStatus: evidence.length ? "valid" : "missing",
          },
        },
      }}
      questionOrder={["问题一"]}
      restoredFromCache={false}
      onOpenOverview={() => undefined}
      onOpenDiagnosis={() => undefined}
      onOpenPatch={() => undefined}
    />,
  );
}

describe("ReportEvidencePanel source controls", () => {
  it("does not render a no-op source button when evidence is unavailable", () => {
    renderPanel([]);
    expect(screen.queryByRole("button", { name: "当前原文未提供来源" })).toBeNull();
    expect(screen.getByText("当前原文未提供来源")).toBeTruthy();
  });

  it("keeps a source jump control when a real paragraph reference exists", () => {
    renderPanel([{ paragraphId: "Para-1", quote: "可核对的正文段落。" }]);
    expect(screen.getByRole("button", { name: "Para-1" })).toBeTruthy();
  });
});
