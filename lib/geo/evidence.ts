import type { DiagnosticResult, Paragraph } from "@/lib/schemas/geo";

export type DiagnosticEvidenceCandidate = Omit<DiagnosticResult, "evidenceStatus">;
export type DiagnosticEvidenceValidationTelemetry = {
  evidenceStatus: DiagnosticResult["evidenceStatus"];
  evidenceCount: number;
  paragraphIdMatchCount: number;
  validEvidenceCount: number;
  invalidEvidenceCount: number;
};

export function validateDiagnosticEvidenceWithTelemetry(
  result: DiagnosticEvidenceCandidate,
  paragraphs: Paragraph[],
): {
  result: DiagnosticResult;
  telemetry: DiagnosticEvidenceValidationTelemetry;
} {
  const paragraphMap = new Map(paragraphs.map((paragraph) => [paragraph.id, paragraph.text]));
  const evidenceCount = result.evidence.length;
  const paragraphIdMatchCount = result.evidence.filter((item) =>
    paragraphMap.has(item.paragraphId),
  ).length;
  const evidence = result.evidence.filter((item) =>
    paragraphMap.get(item.paragraphId)?.includes(item.quote),
  );
  const validEvidenceCount = evidence.length;
  const invalidEvidenceCount = evidenceCount - validEvidenceCount;
  const evidenceStatus = invalidEvidenceCount > 0
    ? "invalid"
    : evidence.length > 0
      ? "valid"
      : "missing";
  const mustDowngrade = result.answerability === "可以完全回答" && evidenceStatus !== "valid";

  return {
    result: {
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
    },
    telemetry: {
      evidenceStatus,
      evidenceCount,
      paragraphIdMatchCount,
      validEvidenceCount,
      invalidEvidenceCount,
    },
  };
}

export function validateDiagnosticEvidence(
  result: DiagnosticEvidenceCandidate,
  paragraphs: Paragraph[],
): DiagnosticResult {
  return validateDiagnosticEvidenceWithTelemetry(result, paragraphs).result;
}
