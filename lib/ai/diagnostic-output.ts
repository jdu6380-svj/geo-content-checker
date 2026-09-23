import { cleanModelJson } from "./json.ts";

type JsonRecord = Record<string, unknown>;

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function aliasedField(record: JsonRecord, canonical: string, alias: string): unknown {
  return Object.hasOwn(record, canonical) ? record[canonical] : record[alias];
}

function normalizeAnswerability(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["answerable", "fully_answerable", "can_answer", "可以回答", "完全可回答"].includes(normalized)) return "可以完全回答";
  if (["insufficient", "insufficient_information", "partially_answerable", "信息不足", "部分回答"].includes(normalized)) return "信息不足";
  if (["risky", "risk", "有风险"].includes(normalized)) return "有风险";
  return value;
}

function normalizeEvidence(value: unknown): unknown {
  if (!Array.isArray(value)) return value;

  return value.flatMap((item) => {
    if (!isJsonRecord(item)) return [];
    return {
      paragraphId: aliasedField(item, "paragraphId", "paragraph_id"),
      quote: aliasedField(item, "quote", "text"),
    };
  });
}

export function normalizeDiagnosticModelOutput(raw: string, question: string) {
  const parsed: unknown = JSON.parse(cleanModelJson(raw));
  const root = isJsonRecord(parsed) ? parsed : {};
  const candidate = isJsonRecord(root.diagnostic) ? root.diagnostic : root;

  return {
    question,
    answerability: normalizeAnswerability(candidate.answerability),
    riskLevel: aliasedField(candidate, "riskLevel", "risk_level"),
    evidence: normalizeEvidence(candidate.evidence),
    missingInfo: aliasedField(candidate, "missingInfo", "missing_info"),
    recommendation: candidate.recommendation,
  };
}
