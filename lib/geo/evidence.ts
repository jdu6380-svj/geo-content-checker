import type { DiagnosticResult, Paragraph } from "@/lib/schemas/geo";

export type DiagnosticEvidenceCandidate = Omit<DiagnosticResult, "evidenceStatus">;

export function validateDiagnosticEvidence(
  result: DiagnosticEvidenceCandidate,
  paragraphs: Paragraph[],
): DiagnosticResult {
  const paragraphMap = new Map(paragraphs.map((paragraph) => [paragraph.id, paragraph.text]));
  const evidence = result.evidence.filter((item) =>
    paragraphMap.get(item.paragraphId)?.includes(item.quote),
  );
  const invalidEvidenceCount = result.evidence.length - evidence.length;
  const evidenceStatus = invalidEvidenceCount > 0
    ? "invalid"
    : evidence.length > 0
      ? "valid"
      : "missing";
  const mustDowngrade = result.answerability === "可以完全回答" && evidenceStatus !== "valid";

  return {
    ...result,
    answerability: mustDowngrade ? "信息不足" : result.answerability,
    riskLevel: mustDowngrade ? "medium" : result.answerability === "有风险" ? "high" : result.riskLevel,
    evidence,
    evidenceStatus,
    missingInfo: mustDowngrade
      ? ["没有找到能够逐字验证该回答的原文证据。"]
      : result.missingInfo,
    recommendation: mustDowngrade
      ? "请在原文中增加对该问题的直接回答与可核验证据。"
      : result.recommendation,
  };
}
