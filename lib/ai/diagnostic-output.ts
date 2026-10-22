import { cleanModelJson } from "./json.ts";

type JsonRecord = Record<string, unknown>;

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function aliasedField(record: JsonRecord, canonical: string, alias: string): unknown {
  return Object.hasOwn(record, canonical) ? record[canonical] : record[alias];
}

function normalizeEvidence(value: unknown): unknown {
  if (!Array.isArray(value)) return value;

  return value.map((item) => {
    if (!isJsonRecord(item)) return item;
    return {
      paragraphId: aliasedField(item, "paragraphId", "paragraph_id"),
      quote: item.quote,
    };
  });
}

export function normalizeDiagnosticModelOutput(raw: string, question: string) {
  const parsed: unknown = JSON.parse(cleanModelJson(raw));
  const root = isJsonRecord(parsed) ? parsed : {};
  const candidate = isJsonRecord(root.diagnostic) ? root.diagnostic : root;

  return {
    question,
    answerability: candidate.answerability,
    riskLevel: aliasedField(candidate, "riskLevel", "risk_level"),
    evidence: normalizeEvidence(candidate.evidence),
    missingInfo: aliasedField(candidate, "missingInfo", "missing_info"),
    recommendation: candidate.recommendation,
  };
}
