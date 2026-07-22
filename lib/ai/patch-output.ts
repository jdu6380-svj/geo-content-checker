import { cleanModelJson } from "./json.ts";

type JsonRecord = Record<string, unknown>;
type PatchOutputMode = "advice" | "content_draft";

const TYPE_ALIASES: Record<string, string> = {
  authorEvidence: "author_evidence",
  structureChange: "structure_change",
  factCard: "fact_card",
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

function normalizeParagraphIds(value: unknown): unknown {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return value;

  const ids = value.trim().split(/[\s,，]+/).filter(Boolean);
  return ids.length > 0 && ids.every((id) => /^Para-\d+$/.test(id)) ? ids : value;
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
  const type = normalizeType(aliasedField(value, "type", ["action_type"]));

  if (type === "author_evidence") {
    const relatedQuestion = aliasedField(value, "relatedQuestion", ["related_question"]);
    return {
      type,
      field: value.field,
      reason: value.reason,
      ...(relatedQuestion === null ? {} : { relatedQuestion }),
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

function actionContainer(root: JsonRecord): JsonRecord {
  if (Object.hasOwn(root, "actions") || Object.hasOwn(root, "patches")) return root;
  for (const key of ["result", "data"]) {
    if (isJsonRecord(root[key])) return root[key];
  }
  return root;
}

export function normalizePatchModelOutput(raw: string, mode: PatchOutputMode) {
  const parsed: unknown = JSON.parse(cleanModelJson(raw));
  const root = isJsonRecord(parsed) ? parsed : {};
  const container = actionContainer(root);
  const actions = aliasedField(container, "actions", ["patches"]);

  if (!Array.isArray(actions)) return { actions };

  const limit = mode === "advice" ? 8 : 10;
  const normalizeAction = mode === "advice" ? normalizeAdviceAction : normalizeContentAction;
  return { actions: actions.slice(0, limit).map(normalizeAction) };
}
