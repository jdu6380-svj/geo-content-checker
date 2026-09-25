import { cleanModelJson } from "./json.ts";

type JsonRecord = Record<string, unknown>;

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function aliasedField(record: JsonRecord, canonical: string, alias: string): unknown {
  return Object.hasOwn(record, canonical) ? record[canonical] : record[alias];
}

function normalizeAnswerability(
  value: unknown,
  context: { riskLevel: unknown; evidence: unknown; missingInfo: unknown },
): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  const normalized = trimmed.toLowerCase().replace(/[\s-]+/g, "_");
  if ([
    "answerable",
    "fully_answerable",
    "can_answer",
    "可以回答",
    "完全可回答",
    "可以完全回答",
    "能够回答",
    "可回答",
  ].includes(normalized)) return "可以完全回答";
  if ([
    "insufficient",
    "insufficient_information",
    "partially_answerable",
    "cannot_fully_answer",
    "cannot_answer",
    "unable_to_answer",
    "信息不足",
    "部分回答",
    "无法完全回答",
    "无法回答",
    "不能完全回答",
    "不能回答",
  ].includes(normalized)) return "信息不足";
  if (["risky", "risk", "有风险", "存在风险", "高风险"].includes(normalized)) return "有风险";

  // Some OpenAI-compatible providers paraphrase the requested enum even at
  // temperature 0. Accept only phrases with an unambiguous semantic signal;
  // unknown strings still flow into schema validation and are rejected.
  if (/风险|矛盾|不可靠|误导/.test(trimmed)) return "有风险";
  if (/信息不足|证据不足|依据不足|缺少|缺失|无法|不能|不可|未能|部分(?:可)?回答|回答不完整/.test(trimmed)) return "信息不足";
  if (/完全(?:可以|能够|可)?回答|(?:可以|能够|足以|充分)(?:直接)?回答|可完整回答/.test(trimmed)) return "可以完全回答";

  // If the provider paraphrases the enum beyond recognition, derive the
  // category only when the other structured fields make it unambiguous.
  // Ambiguous output is intentionally left untouched for schema rejection.
  if (context.riskLevel === "high") return "有风险";
  if (Array.isArray(context.missingInfo) && context.missingInfo.length > 0) return "信息不足";
  if (
    context.riskLevel === "low"
    && Array.isArray(context.evidence)
    && context.evidence.length > 0
    && Array.isArray(context.missingInfo)
    && context.missingInfo.length === 0
  ) return "可以完全回答";
  return value;
}

function normalizeMissingInfo(value: unknown): unknown {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (value == null) return [];
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
  const riskLevel = aliasedField(candidate, "riskLevel", "risk_level");
  const evidence = normalizeEvidence(candidate.evidence);
  const missingInfo = normalizeMissingInfo(aliasedField(candidate, "missingInfo", "missing_info"));

  return {
    question,
    answerability: normalizeAnswerability(candidate.answerability, { riskLevel, evidence, missingInfo }),
    riskLevel,
    evidence,
    missingInfo,
    recommendation: candidate.recommendation,
  };
}
