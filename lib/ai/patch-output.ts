import { cleanModelJson } from "./json.ts";

type JsonRecord = Record<string, unknown>;
type PatchOutputMode = "advice" | "content_draft";

const TYPE_ALIASES: Record<string, string> = {
  authorEvidence: "author_evidence",
  structureChange: "structure_change",
  factCard: "fact_card",
};

const ADVICE_TYPE_ALIASES: Record<string, string> = {
  author_evidence: "author_evidence",
  authorEvidence: "author_evidence",
  "author-evidence": "author_evidence",
  "author evidence": "author_evidence",
  structure_change: "structure_change",
  structureChange: "structure_change",
  "structure-change": "structure_change",
  "structure change": "structure_change",
};

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function aliasedField(record: JsonRecord, canonical: string, aliases: string[]): unknown {
  if (Object.hasOwn(record, canonical)) return record[canonical];
  const alias = aliases.find((name) => Object.hasOwn(record, name));
  return alias ? record[alias] : undefined;
}

function normalizeType(value: unknown): unknown {
  return typeof value === "string" ? TYPE_ALIASES[value] ?? value : value;
}

function normalizeAdviceType(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return ADVICE_TYPE_ALIASES[trimmed] ?? value;
}

function splitParagraphIds(value: string): string[] {
  return value.trim().split(/[\s,，、]+/).filter(Boolean);
}

function areValidParagraphIds(value: unknown[]): value is string[] {
  return value.length > 0 && value.every(
    (id) => typeof id === "string" && /^Para-\d+$/.test(id),
  );
}

function normalizeParagraphIds(value: unknown): unknown {
  if (Array.isArray(value)) {
    const ids = value.flatMap((item) => {
      if (typeof item !== "string") return [item];
      const parts = splitParagraphIds(item);
      return parts.length ? parts : [item];
    });
    return areValidParagraphIds(ids) ? ids : value;
  }
  if (typeof value !== "string") return value;

  const ids = splitParagraphIds(value);
  return areValidParagraphIds(ids) ? ids : value;
}

function normalizeEvidence(value: unknown): unknown {
  if (!isJsonRecord(value)) return value;
  return {
    paragraphId: aliasedField(value, "paragraphId", ["paragraph_id"]),
    quote: value.quote,
  };
}

function normalizeAdviceAction(value: unknown): unknown {
  if (!isJsonRecord(value)) return value;
  const type = normalizeAdviceType(aliasedField(value, "type", ["action_type", "actionType"]));

  if (type === "author_evidence") {
    const relatedQuestion = aliasedField(value, "relatedQuestion", ["related_question"]);
    const normalizedRelatedQuestion = typeof relatedQuestion === "string"
      ? relatedQuestion.trim() || undefined
      : relatedQuestion;
    return {
      type,
      field: value.field,
      reason: value.reason,
      ...(normalizedRelatedQuestion === null || normalizedRelatedQuestion === undefined
        ? {}
        : { relatedQuestion: normalizedRelatedQuestion }),
    };
  }

  if (type === "structure_change") {
    const paragraphIds = aliasedField(value, "targetParagraphIds", [
      "target_paragraph_ids",
      "targetParagraphId",
      "target_paragraph_id",
    ]);
    return {
      type,
      title: value.title,
      instruction: value.instruction,
      targetParagraphIds: normalizeParagraphIds(paragraphIds),
    };
  }

  return { type };
}

type ActionsResult = { found: boolean; value?: unknown };

function normalizeActionCollection(value: unknown): unknown {
  return isJsonRecord(value) ? [value] : value;
}

function findActions(value: unknown): ActionsResult {
  if (Array.isArray(value)) return { found: true, value };
  if (!isJsonRecord(value)) return { found: false };

  for (const key of ["actions", "patches", "action", "patch"]) {
    if (Object.hasOwn(value, key)) {
      return { found: true, value: normalizeActionCollection(value[key]) };
    }
  }

  for (const key of ["result", "data", "output"]) {
    if (!Object.hasOwn(value, key)) continue;
    const nested = findActions(value[key]);
    if (nested.found) return nested;
  }

  if (Object.hasOwn(value, "type") || Object.hasOwn(value, "action_type") || Object.hasOwn(value, "actionType")) {
    return { found: true, value: [value] };
  }

  return { found: false };
}

function parsePatchModelJson(raw: string): unknown {
  const cleaned = cleanModelJson(raw);
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const withoutFences = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
    const arrayStart = withoutFences.indexOf("[");
    const objectStart = withoutFences.indexOf("{");
    const arrayEnd = withoutFences.lastIndexOf("]");
    if (arrayStart >= 0 && arrayEnd > arrayStart && (objectStart === -1 || arrayStart < objectStart)) {
      return JSON.parse(withoutFences.slice(arrayStart, arrayEnd + 1));
    }
    throw error;
  }
}

function normalizeAdviceModelOutput(parsed: unknown) {
  const result = findActions(parsed);
  const actions = result.found ? result.value : undefined;

  if (!Array.isArray(actions)) return { actions };
  return { actions: actions.slice(0, 8).map(normalizeAdviceAction) };
}

function normalizeContentAction(value: unknown): unknown {
  if (!isJsonRecord(value)) return value;
  const type = normalizeType(aliasedField(value, "type", ["action_type"]));

  if (type === "faq") {
    return {
      type,
      question: value.question,
      answer: value.answer,
      evidence: normalizeEvidence(value.evidence),
    };
  }

  if (type === "fact_card") {
    return {
      type,
      label: value.label,
      value: value.value,
      evidence: normalizeEvidence(value.evidence),
    };
  }

  return { type };
}

export function normalizePatchModelOutput(raw: string, mode: PatchOutputMode) {
  const parsed = parsePatchModelJson(raw);
  if (mode === "advice") {
    return normalizeAdviceModelOutput(parsed);
  }

  const result = findActions(parsed);
  const actions = result.found ? result.value : undefined;

  if (!Array.isArray(actions)) return { actions };

  return { actions: actions.slice(0, 10).map(normalizeContentAction) };
}
