import { createHash } from "node:crypto";

import {
  serializeAdviceArtifactLineage,
  type AdviceArtifactLineage,
} from "./advice-artifact-lineage.ts";
import {
  serializeAdviceQualityArtifact,
  type AdviceQualityArtifact,
} from "./advice-quality-validation.ts";

export const CONTENT_DRAFT_VALIDATION_SCHEMA_VERSION =
  "content-draft-validation-v1";

const GENERIC_PATCH_TEXT = new Set([
  "优化内容",
  "优化文章",
  "提升可信度",
  "提高质量",
  "完善内容",
]);
const FORBIDDEN_DRAFT_KEYS = new Set([
  "answer",
  "apiKey",
  "authorization",
  "content",
  "cookie",
  "credentials",
  "environmentValue",
  "evidence",
  "label",
  "modelResponse",
  "prompt",
  "question",
  "quote",
  "response",
  "token",
  "userInput",
  "value",
]);

export type ContentDraftValidationResult =
  | "content_draft_valid"
  | "content_draft_invalid";
export type PatchValidationResult = "patch_valid" | "patch_invalid";
export type PatchValidationIssue =
  | "evidence_missing"
  | "advice_missing"
  | "problem_missing"
  | "unsupported_fact"
  | "patch_not_actionable"
  | "recheck_unavailable";

export interface ContentDraftSourceSession {
  articleId: string;
  round: 1 | 2;
  actions: readonly unknown[];
}

interface ParsedPatchAction {
  type: "faq" | "fact_card";
  displayText: string;
  patchText: string;
  evidence: {
    paragraphId: string;
    quote: string;
  };
  raw: unknown;
}

export interface ContentDraftPatchNode {
  patchId: string;
  sessionReference: string;
  patchIndex: number;
  patchType: "faq" | "fact_card";
  payloadDigest: string;
}

export interface ContentDraftRelation {
  patchId: string;
  evidenceIds: string[];
  problemIds: string[];
  adviceIds: string[];
  preservationStatus: "meaning_preserved" | "unsupported_fact";
  actionabilityStatus: "patch_actionable" | "patch_generic";
  recheckStatus: "recheck_ready" | "recheck_unavailable";
  recheckDigest: string | null;
  result: PatchValidationResult;
  issues: PatchValidationIssue[];
}

interface ContentDraftValidationPayload {
  validationSchemaVersion: typeof CONTENT_DRAFT_VALIDATION_SCHEMA_VERSION;
  sourceAdviceQuality: {
    schemaVersion: string;
    payloadSha256: string;
  };
  summary: {
    sessions: number;
    patches: number;
    validPatches: number;
    invalidPatches: number;
    recheckReady: number;
  };
  patchNodes: ContentDraftPatchNode[];
  relations: ContentDraftRelation[];
  result: ContentDraftValidationResult;
}

export interface ContentDraftValidationArtifact
  extends ContentDraftValidationPayload {
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

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= maxLength;
}

function parsePatchAction(value: unknown): ParsedPatchAction {
  if (!isRecord(value) || !isRecord(value.evidence)) {
    throw new Error("Content Draft patch is invalid.");
  }
  const evidence = value.evidence;
  if (
    typeof evidence.paragraphId !== "string" ||
    !/^Para-\d+$/.test(evidence.paragraphId) ||
    !isNonEmptyString(evidence.quote, 360)
  ) {
    throw new Error("Content Draft patch Evidence is invalid.");
  }
  if (
    value.type === "faq" &&
    isNonEmptyString(value.question, 160) &&
    value.question.trim().length >= 6 &&
    isNonEmptyString(value.answer, 400)
  ) {
    return {
      type: "faq",
      displayText: value.question,
      patchText: value.answer,
      evidence: {
        paragraphId: evidence.paragraphId,
        quote: evidence.quote,
      },
      raw: value,
    };
  }
  if (
    value.type === "fact_card" &&
    isNonEmptyString(value.label, 60) &&
    value.label.trim().length >= 2 &&
    isNonEmptyString(value.value, 400)
  ) {
    return {
      type: "fact_card",
      displayText: value.label,
      patchText: value.value,
      evidence: {
        paragraphId: evidence.paragraphId,
        quote: evidence.quote,
      },
      raw: value,
    };
  }
  throw new Error("Content Draft patch is invalid.");
}

function normalizedText(value: string): string {
  return value.trim().replace(/\s+/g, "").replace(/[。.!！?？]+$/g, "");
}

function patchIsActionable(action: ParsedPatchAction): boolean {
  const displayText = normalizedText(action.displayText);
  return !GENERIC_PATCH_TEXT.has(displayText) &&
    displayText.length >= 2 &&
    action.patchText === action.evidence.quote;
}

function numberedPatchId(index: number): string {
  return `D${String(index + 1).padStart(3, "0")}`;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function validationPayloadSha256(
  value: ContentDraftValidationPayload,
): string {
  return sha256(JSON.stringify(value));
}

function assertAllowedDraftShape(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertAllowedDraftShape(item);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_DRAFT_KEYS.has(key)) {
      throw new Error("Content Draft artifact contains a forbidden field.");
    }
    assertAllowedDraftShape(child);
  }
}

export function validateContentDraft(input: {
  lineage: AdviceArtifactLineage;
  adviceQuality: AdviceQualityArtifact;
  sessions: readonly ContentDraftSourceSession[];
}): ContentDraftValidationArtifact {
  serializeAdviceArtifactLineage(input.lineage);
  serializeAdviceQualityArtifact(input.adviceQuality);
  if (
    input.adviceQuality.sourceLineage.payloadSha256 !==
      input.lineage.integrity.payloadSha256
  ) {
    throw new Error("Content Draft source lineage does not match Advice quality.");
  }
  if (!input.sessions.length || input.sessions.length > 20) {
    throw new Error("Content Draft requires between 1 and 20 sessions.");
  }

  const validAdviceIds = new Set(
    input.adviceQuality.records.flatMap((record) =>
      record.result === "advice_valid" ? [record.adviceId] : []
    ),
  );
  const seenSessions = new Set<string>();
  const patchNodes: ContentDraftPatchNode[] = [];
  const relations: ContentDraftRelation[] = [];

  for (const session of input.sessions) {
    const sessionReference = `${session.articleId}:round-${session.round}`;
    if (
      !/^[A-Za-z0-9_.:-]{1,128}$/.test(session.articleId) ||
      seenSessions.has(sessionReference) ||
      !session.actions.length ||
      session.actions.length > 10
    ) {
      throw new Error("Content Draft session is invalid.");
    }
    seenSessions.add(sessionReference);
    const actions = session.actions.map(parsePatchAction);
    for (const [patchIndex, action] of actions.entries()) {
      const patchId = numberedPatchId(patchNodes.length);
      const payloadDigest = sha256(JSON.stringify(action.raw));
      patchNodes.push({
        patchId,
        sessionReference,
        patchIndex,
        patchType: action.type,
        payloadDigest,
      });

      const matchingSourceNodes = input.lineage.sourceNodes.filter(
        (source) =>
          source.sessionReference === sessionReference &&
          source.sourceType === "source_excerpt" &&
          source.paragraphId === action.evidence.paragraphId &&
          source.quoteDigest === sha256(action.evidence.quote),
      );
      const evidenceIds = unique(
        matchingSourceNodes.map((source) => source.evidenceId),
      );
      const matchingLineageRelations = input.lineage.relations.filter(
        (relation) =>
          relation.result === "lineage_valid" &&
          validAdviceIds.has(relation.adviceId) &&
          relation.evidenceIds.some((evidenceId) =>
            evidenceIds.includes(evidenceId)
          ),
      );
      const adviceIds = unique(
        matchingLineageRelations.map((relation) => relation.adviceId),
      );
      const problemIds = unique(
        matchingLineageRelations.flatMap((relation) => relation.problemIds),
      );
      const meaningPreserved = action.patchText === action.evidence.quote;
      const actionable = patchIsActionable(action);
      const issues: PatchValidationIssue[] = [];
      if (!evidenceIds.length) issues.push("evidence_missing");
      if (!adviceIds.length) issues.push("advice_missing");
      if (!problemIds.length) issues.push("problem_missing");
      if (!meaningPreserved) issues.push("unsupported_fact");
      if (!actionable) issues.push("patch_not_actionable");
      const recheckReady =
        evidenceIds.length > 0 &&
        adviceIds.length > 0 &&
        problemIds.length > 0 &&
        meaningPreserved &&
        actionable;
      if (!recheckReady) issues.push("recheck_unavailable");
      const recheckDigest = recheckReady
        ? sha256(JSON.stringify({
            sourceAdviceQuality: input.adviceQuality.integrity.payloadSha256,
            patch: payloadDigest,
            evidenceIds,
            problemIds,
            adviceIds,
          }))
        : null;
      relations.push({
        patchId,
        evidenceIds,
        problemIds,
        adviceIds,
        preservationStatus: meaningPreserved
          ? "meaning_preserved"
          : "unsupported_fact",
        actionabilityStatus: actionable
          ? "patch_actionable"
          : "patch_generic",
        recheckStatus: recheckReady
          ? "recheck_ready"
          : "recheck_unavailable",
        recheckDigest,
        result: issues.length ? "patch_invalid" : "patch_valid",
        issues,
      });
    }
  }

  const validPatches = relations.filter(
    (relation) => relation.result === "patch_valid",
  ).length;
  const payload: ContentDraftValidationPayload = {
    validationSchemaVersion: CONTENT_DRAFT_VALIDATION_SCHEMA_VERSION,
    sourceAdviceQuality: {
      schemaVersion: input.adviceQuality.qualitySchemaVersion,
      payloadSha256: input.adviceQuality.integrity.payloadSha256,
    },
    summary: {
      sessions: input.sessions.length,
      patches: patchNodes.length,
      validPatches,
      invalidPatches: patchNodes.length - validPatches,
      recheckReady: relations.filter(
        (relation) => relation.recheckStatus === "recheck_ready",
      ).length,
    },
    patchNodes,
    relations,
    result:
      validPatches === patchNodes.length
        ? "content_draft_valid"
        : "content_draft_invalid",
  };
  return {
    ...payload,
    integrity: {
      algorithm: "sha256",
      payloadSha256: validationPayloadSha256(payload),
    },
  };
}

export function serializeContentDraftValidationArtifact(
  artifact: ContentDraftValidationArtifact,
  sensitiveValues: readonly string[] = [],
): string {
  if (
    artifact.validationSchemaVersion !==
      CONTENT_DRAFT_VALIDATION_SCHEMA_VERSION ||
    artifact.integrity.algorithm !== "sha256"
  ) {
    throw new Error("Content Draft artifact schema is invalid.");
  }
  const { integrity, ...payload } = artifact;
  if (integrity.payloadSha256 !== validationPayloadSha256(payload)) {
    throw new Error("Content Draft artifact integrity mismatch.");
  }
  if (
    artifact.summary.patches !== artifact.patchNodes.length ||
    artifact.summary.patches !== artifact.relations.length ||
    artifact.summary.validPatches + artifact.summary.invalidPatches !==
      artifact.summary.patches
  ) {
    throw new Error("Content Draft artifact summary is invalid.");
  }
  assertAllowedDraftShape(artifact);
  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  for (const value of sensitiveValues) {
    if (value && serialized.includes(value)) {
      throw new Error("Content Draft artifact redaction failed.");
    }
  }
  return serialized;
}
