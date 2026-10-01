import type {
  DiagnosticResult,
  Paragraph,
} from "@/lib/schemas/geo";

export type ContentDraftEvidenceCandidate = {
  paragraphId: string;
  quote: string;
  relatedQuestions: string[];
};

export function buildContentDraftEvidenceCandidates(
  diagnostics: DiagnosticResult[],
  paragraphs: Paragraph[],
): ContentDraftEvidenceCandidate[] {
  const paragraphMap = new Map(
    paragraphs.map((paragraph) => [paragraph.id, paragraph.text]),
  );
  const candidates = new Map<string, ContentDraftEvidenceCandidate>();

  for (const diagnostic of diagnostics) {
    if (diagnostic.evidenceStatus !== "valid") continue;

    for (const evidence of diagnostic.evidence) {
      const paragraph = paragraphMap.get(evidence.paragraphId);
      if (!paragraph?.includes(evidence.quote)) continue;

      const key = JSON.stringify([evidence.paragraphId, evidence.quote]);
      const existing = candidates.get(key);
      if (existing) {
        if (!existing.relatedQuestions.includes(diagnostic.question)) {
          existing.relatedQuestions.push(diagnostic.question);
        }
        continue;
      }

      candidates.set(key, {
        paragraphId: evidence.paragraphId,
        quote: evidence.quote,
        relatedQuestions: [diagnostic.question],
      });
    }
  }

  return Array.from(candidates.values());
}
