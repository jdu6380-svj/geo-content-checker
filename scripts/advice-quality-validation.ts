import { createHash } from "node:crypto";

import {
  serializeAdviceArtifactLineage,
  type AdviceArtifactLineage,
  type AdviceLineageSourceSession,
} from "./advice-artifact-lineage.ts";

export const ADVICE_QUALITY_SCHEMA_VERSION = "advice-quality-v1";

const GENERIC_ADVICE_TEXT = new Set([
  "优化内容",
  "优化文章",
  "优化表达",
  "提高文章质量",
  "提升内容质量",
  "改进内容",
  "完善内容",
]);
const GENERIC_FIELD_TEXT = new Set([
  "内容",
  "文章",
  "质量",
  "表达",
  "结构",
  "其他",
]);
const ACTION_VERB_PATTERN =
  /补充|增加|添加|引用|标注|移动|调整|拆分|合并|重写|删除|前置|后置|说明|列出|注明|核验/;
const FORBIDDEN_QUALITY_KEYS = new Set([
  "apiKey",
  "authorization",
  "content",
  "cookie",
  "credentials",
  "environmentValue",
  "evidence",
  "field",
  "instruction",
  "modelResponse",
  "prompt",
  "question",
  "quote",
  "reason",
  "relatedQuestion",
  "response",
  "title",
  "token",
  "userInput",
]);

export type AdviceQualityResult = "advice_valid" | "advice_invalid";
export type AdvicePriority = "P0" | "P1" | "P2";
export type AdviceQualityIssue =
  | "evidence_missing"
  | "problem_missing"
  | "action_missing"
  | "action_not_specific"
  | "impact_missing"
  | "priority_missing";

export interface AdviceQualityRecord {
  adviceId: string;
  adviceType: "author_evidence" | "structure_change";
  evidenceIds: string[];
  problemIds: string[];
  actionCheck: "action_specific" | "action_generic" | "action_missing";
  impactType: "evidence_completeness" | "answerability_structure" | null;
  priority: AdvicePriority | null;
  result: AdviceQualityResult;
  issues: AdviceQualityIssue[];
}

interface AdviceQualityPayload {
  qualitySchemaVersion: typeof ADVICE_QUALITY_SCHEMA_VERSION;
  sourceLineage: {
    schemaVersion: string;
    payloadSha256: string;
  };
  summary: {
    advice: number;
    validAdvice: number;
    invalidAdvice: number;
    priorities: Record<AdvicePriority, number>;
  };
  priorityValidation: {
    sortable: boolean;
    distinctPriorities: number;
    result: "priority_valid" | "priority_invalid";
  };
  records: AdviceQualityRecord[];
  result: AdviceQualityResult;
}

export interface AdviceQualityArtifact extends AdviceQualityPayload {
  integrity: {
    algorithm: "sha256";
    payloadSha256: string;
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedText(value: string): string {
  return value.trim().replace(/\s+/g, "").replace(/[。.!！?？]+$/g, "");
}

function isGenericText(value: string): boolean {
  const normalized = normalizedText(value);
  return GENERIC_ADVICE_TEXT.has(normalized);
}

function actionIsSpecific(action: unknown): boolean {
  if (!isRecord(action)) return false;
  if (action.type === "author_evidence") {
    const field = typeof action.field === "string"
      ? normalizedText(action.field)
      : "";
    return field.length >= 2 &&
      !GENERIC_FIELD_TEXT.has(field) &&
      !GENERIC_ADVICE_TEXT.has(field) &&
      typeof action.reason === "string" &&
      normalizedText(action.reason).length >= 10 &&
      !isGenericText(action.reason) &&
      typeof action.relatedQuestion === "string" &&
      normalizedText(action.relatedQuestion).length >= 6;
  }
  if (action.type === "structure_change") {
    return typeof action.instruction === "string" &&
      normalizedText(action.instruction).length >= 8 &&
      !isGenericText(action.instruction) &&
      ACTION_VERB_PATTERN.test(action.instruction) &&
      Array.isArray(action.targetParagraphIds) &&
      action.targetParagraphIds.length > 0 &&
      action.targetParagraphIds.every(
        (paragraphId) =>
          typeof paragraphId === "string" && /^Para-\d+$/.test(paragraphId),
      );
  }
  return false;
}

function priorityForProblems(
  lineage: AdviceArtifactLineage,
  problemIds: readonly string[],
): AdvicePriority | null {
  const problemIdSet = new Set(problemIds);
  const problems = lineage.problemNodes.filter((problem) =>
    problemIdSet.has(problem.problemId)
  );
  if (!problems.length) return null;
  if (
    problems.some(
      (problem) =>
        problem.riskLevel === "high" ||
        problem.answerability === "有风险" ||
        problem.evidenceStatus === "missing" ||
        problem.evidenceStatus === "invalid",
    )
  ) {
    return "P0";
  }
  if (
    problems.some(
      (problem) =>
        problem.riskLevel === "medium" ||
        problem.answerability === "信息不足",
    )
  ) {
    return "P1";
  }
  return "P2";
}

function qualityPayloadSha256(value: AdviceQualityPayload): string {
  return sha256(JSON.stringify(value));
}

function assertAllowedQualityShape(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertAllowedQualityShape(item);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_QUALITY_KEYS.has(key)) {
      throw new Error("Advice quality artifact contains a forbidden field.");
    }
    assertAllowedQualityShape(child);
  }
}

export function validateAdviceQuality(input: {
  lineage: AdviceArtifactLineage;
  sessions: readonly AdviceLineageSourceSession[];
}): AdviceQualityArtifact {
  serializeAdviceArtifactLineage(input.lineage);
  const sessionsByReference = new Map(
    input.sessions.map((session) => [
      `${session.articleId}:round-${session.round}`,
      session,
    ]),
  );
  const relationsByAdviceId = new Map(
    input.lineage.relations.map((relation) => [relation.adviceId, relation]),
  );
  const records = input.lineage.adviceNodes.map((adviceNode) => {
    const session = sessionsByReference.get(adviceNode.sessionReference);
    const action = session?.actions[adviceNode.adviceIndex];
    const relation = relationsByAdviceId.get(adviceNode.adviceId);
    const payloadMatches =
      action !== undefined &&
      sha256(JSON.stringify(action)) === adviceNode.payloadDigest;
    const specific = payloadMatches && actionIsSpecific(action);
    const evidenceIds = relation?.evidenceIds ?? [];
    const problemIds = relation?.problemIds ?? [];
    const priority = priorityForProblems(input.lineage, problemIds);
    const impactType = relation?.expectedImpact.diagnosticIndexes.length
      ? relation.expectedImpact.impactType
      : null;
    const issues: AdviceQualityIssue[] = [];
    if (!evidenceIds.length) issues.push("evidence_missing");
    if (!problemIds.length) issues.push("problem_missing");
    if (!payloadMatches) {
      issues.push("action_missing");
    } else if (!specific) {
      issues.push("action_not_specific");
    }
    if (!impactType) issues.push("impact_missing");
    if (!priority) issues.push("priority_missing");
    return {
      adviceId: adviceNode.adviceId,
      adviceType: adviceNode.adviceType,
      evidenceIds,
      problemIds,
      actionCheck: !payloadMatches
        ? "action_missing"
        : specific
          ? "action_specific"
          : "action_generic",
      impactType,
      priority,
      result: issues.length ? "advice_invalid" : "advice_valid",
      issues,
    } satisfies AdviceQualityRecord;
  });

  const priorities = records.reduce<Record<AdvicePriority, number>>(
    (counts, record) => {
      if (record.priority) counts[record.priority] += 1;
      return counts;
    },
    { P0: 0, P1: 0, P2: 0 },
  );
  const distinctPriorities = Object.values(priorities).filter(
    (count) => count > 0,
  ).length;
  const sortable = records.every((record) => record.priority !== null);
  const priorityResult =
    sortable && (records.length <= 1 || distinctPriorities > 1)
      ? "priority_valid"
      : "priority_invalid";
  const validAdvice = records.filter(
    (record) => record.result === "advice_valid",
  ).length;
  const payload: AdviceQualityPayload = {
    qualitySchemaVersion: ADVICE_QUALITY_SCHEMA_VERSION,
    sourceLineage: {
      schemaVersion: input.lineage.lineageSchemaVersion,
      payloadSha256: input.lineage.integrity.payloadSha256,
    },
    summary: {
      advice: records.length,
      validAdvice,
      invalidAdvice: records.length - validAdvice,
      priorities,
    },
    priorityValidation: {
      sortable,
      distinctPriorities,
      result: priorityResult,
    },
    records,
    result:
      validAdvice === records.length && priorityResult === "priority_valid"
        ? "advice_valid"
        : "advice_invalid",
  };
  return {
    ...payload,
    integrity: {
      algorithm: "sha256",
      payloadSha256: qualityPayloadSha256(payload),
    },
  };
}

export function serializeAdviceQualityArtifact(
  artifact: AdviceQualityArtifact,
  sensitiveValues: readonly string[] = [],
): string {
  if (
    artifact.qualitySchemaVersion !== ADVICE_QUALITY_SCHEMA_VERSION ||
    artifact.integrity.algorithm !== "sha256"
  ) {
    throw new Error("Advice quality artifact schema is invalid.");
  }
  const { integrity, ...payload } = artifact;
  if (integrity.payloadSha256 !== qualityPayloadSha256(payload)) {
    throw new Error("Advice quality artifact integrity mismatch.");
  }
  if (
    artifact.summary.advice !== artifact.records.length ||
    artifact.summary.validAdvice + artifact.summary.invalidAdvice !==
      artifact.summary.advice
  ) {
    throw new Error("Advice quality artifact summary is invalid.");
  }
  assertAllowedQualityShape(artifact);
  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  for (const value of sensitiveValues) {
    if (value && serialized.includes(value)) {
      throw new Error("Advice quality artifact redaction failed.");
    }
  }
  return serialized;
}
