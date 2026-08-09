import { createHash } from "node:crypto";

import type {
  DiagnosticResult,
  ModelAdviceAction,
} from "../lib/schemas/geo.ts";

export const ADVICE_ARTIFACT_LINEAGE_SCHEMA_VERSION =
  "advice-artifact-lineage-v1";

const SAFE_REFERENCE_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const FORBIDDEN_LINEAGE_KEYS = new Set([
  "apiKey",
  "authorization",
  "content",
  "cookie",
  "credentials",
  "environmentValue",
  "evidence",
  "instruction",
  "modelResponse",
  "prompt",
  "question",
  "quote",
  "reason",
  "response",
  "token",
  "userInput",
]);

export type AdviceLineageResult = "lineage_valid" | "lineage_missing";
export type AdviceLineageIssue =
  | "evidence_missing"
  | "evidence_mismatch"
  | "problem_missing"
  | "reason_missing"
  | "impact_missing";

export interface AdviceLineageSourceSession {
  articleId: string;
  round: 1 | 2;
  diagnostics: readonly unknown[];
  actions: readonly unknown[];
}

export interface AdviceLineageSourceNode {
  evidenceId: string;
  sourceType: "source_excerpt" | "evidence_gap";
  sessionReference: string;
  diagnosticIndex: number;
  evidenceStatus: DiagnosticResult["evidenceStatus"];
  paragraphId?: string;
  quoteDigest?: string;
}

export interface AdviceLineageProblemNode {
  problemId: string;
  sessionReference: string;
  diagnosticIndex: number;
  questionDigest: string;
  recommendationDigest: string;
  answerability: DiagnosticResult["answerability"];
  riskLevel: DiagnosticResult["riskLevel"];
  evidenceStatus: DiagnosticResult["evidenceStatus"];
}

export interface AdviceLineageAdviceNode {
  adviceId: string;
  sessionReference: string;
  adviceIndex: number;
  adviceType: ModelAdviceAction["type"];
  payloadDigest: string;
}

export interface AdviceLineageRelation {
  adviceId: string;
  evidenceIds: string[];
  problemIds: string[];
  reasonReferenceDigests: string[];
  expectedImpact: {
    impactType: "evidence_completeness" | "answerability_structure";
    diagnosticIndexes: number[];
    diagnosticResultFields: Array<
      "answerability" | "riskLevel" | "evidenceStatus"
    >;
  };
  result: AdviceLineageResult;
  issues: AdviceLineageIssue[];
}

interface AdviceArtifactLineagePayload {
  lineageSchemaVersion: typeof ADVICE_ARTIFACT_LINEAGE_SCHEMA_VERSION;
  sourceArtifact: {
    id: string;
    payloadSha256: string;
  };
  summary: {
    sessions: number;
    diagnostics: number;
    advice: number;
    validAdvice: number;
    missingAdvice: number;
  };
  sourceNodes: AdviceLineageSourceNode[];
  problemNodes: AdviceLineageProblemNode[];
  adviceNodes: AdviceLineageAdviceNode[];
  relations: AdviceLineageRelation[];
  result: AdviceLineageResult;
}

export interface AdviceArtifactLineage extends AdviceArtifactLineagePayload {
  integrity: {
    algorithm: "sha256";
    payloadSha256: string;
  };
}

interface ParsedLineageSession {
  articleId: string;
  round: 1 | 2;
  sessionReference: string;
  diagnostics: DiagnosticResult[];
  actions: ModelAdviceAction[];
  diagnosticIndexes: number[];
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function numberedReference(prefix: "E" | "P" | "A", index: number): string {
  return `${prefix}${String(index + 1).padStart(3, "0")}`;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= maxLength;
}

function parseDiagnostic(value: unknown): DiagnosticResult {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.question, 200) ||
    !["可以完全回答", "信息不足", "有风险"].includes(
      value.answerability as string,
    ) ||
    !["low", "medium", "high"].includes(value.riskLevel as string) ||
    !Array.isArray(value.evidence) ||
    value.evidence.length > 3 ||
    !value.evidence.every(
      (item) =>
        isRecord(item) &&
        typeof item.paragraphId === "string" &&
        /^Para-\d+$/.test(item.paragraphId) &&
        isNonEmptyString(item.quote, 360),
    ) ||
    !Array.isArray(value.missingInfo) ||
    value.missingInfo.length > 5 ||
    !value.missingInfo.every((item) => isNonEmptyString(item, 120)) ||
    !isNonEmptyString(value.recommendation, 500) ||
    value.source !== "model" ||
    !["valid", "missing", "invalid"].includes(value.evidenceStatus as string)
  ) {
    throw new Error("Advice lineage diagnostics are invalid.");
  }
  return value as DiagnosticResult;
}

function parseAdviceAction(value: unknown): ModelAdviceAction {
  if (!isRecord(value)) {
    throw new Error("Advice lineage actions are invalid.");
  }
  if (
    value.type === "author_evidence" &&
    isNonEmptyString(value.field, 120) &&
    isNonEmptyString(value.reason, 300) &&
    (
      value.relatedQuestion === undefined ||
      isNonEmptyString(value.relatedQuestion, 200)
    )
  ) {
    return value as ModelAdviceAction;
  }
  if (
    value.type === "structure_change" &&
    isNonEmptyString(value.title, 120) &&
    isNonEmptyString(value.instruction, 500) &&
    Array.isArray(value.targetParagraphIds) &&
    value.targetParagraphIds.length >= 1 &&
    value.targetParagraphIds.length <= 5 &&
    value.targetParagraphIds.every(
      (paragraphId) =>
        typeof paragraphId === "string" && /^Para-\d+$/.test(paragraphId),
    )
  ) {
    return value as ModelAdviceAction;
  }
  throw new Error("Advice lineage actions are invalid.");
}

function assertSafeReference(value: string, label: string): void {
  if (!SAFE_REFERENCE_PATTERN.test(value)) {
    throw new Error(`Advice lineage ${label} is invalid.`);
  }
}

function parseSessions(
  sessions: readonly AdviceLineageSourceSession[],
): ParsedLineageSession[] {
  if (!sessions.length || sessions.length > 20) {
    throw new Error("Advice lineage requires between 1 and 20 sessions.");
  }
  const seen = new Set<string>();
  let diagnosticIndex = 0;
  return sessions.map((session) => {
    assertSafeReference(session.articleId, "article ID");
    const sessionReference = `${session.articleId}:round-${session.round}`;
    if (seen.has(sessionReference)) {
      throw new Error("Advice lineage contains a duplicate session.");
    }
    seen.add(sessionReference);

    const diagnostics = session.diagnostics.map(parseDiagnostic);
    if (!diagnostics.length || diagnostics.length > 10) {
      throw new Error("Advice lineage diagnostic count is invalid.");
    }

    if (!session.actions.length || session.actions.length > 8) {
      throw new Error("Advice lineage action count is invalid.");
    }
    const actions = session.actions.map(parseAdviceAction);

    const diagnosticIndexes = diagnostics.map(() => diagnosticIndex++);
    return {
      articleId: session.articleId,
      round: session.round,
      sessionReference,
      diagnostics,
      actions,
      diagnosticIndexes,
    };
  });
}

function lineagePayloadSha256(value: AdviceArtifactLineagePayload): string {
  return sha256(JSON.stringify(value));
}

function assertAllowedLineageShape(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertAllowedLineageShape(item);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_LINEAGE_KEYS.has(key)) {
      throw new Error("Advice lineage artifact contains a forbidden field.");
    }
    assertAllowedLineageShape(child);
  }
}

export function validateAdviceArtifactLineage(input: {
  sourceArtifactId: string;
  sourceArtifactSha256: string;
  sessions: readonly AdviceLineageSourceSession[];
}): AdviceArtifactLineage {
  assertSafeReference(input.sourceArtifactId, "source artifact ID");
  if (!SHA256_PATTERN.test(input.sourceArtifactSha256)) {
    throw new Error("Advice lineage source artifact digest is invalid.");
  }

  const sessions = parseSessions(input.sessions);
  const sourceNodes: AdviceLineageSourceNode[] = [];
  const problemNodes: AdviceLineageProblemNode[] = [];
  const adviceNodes: AdviceLineageAdviceNode[] = [];
  const relations: AdviceLineageRelation[] = [];

  for (const session of sessions) {
    for (const [localIndex, diagnostic] of session.diagnostics.entries()) {
      const currentDiagnosticIndex = session.diagnosticIndexes[localIndex]!;
      problemNodes.push({
        problemId: numberedReference("P", problemNodes.length),
        sessionReference: session.sessionReference,
        diagnosticIndex: currentDiagnosticIndex,
        questionDigest: sha256(diagnostic.question),
        recommendationDigest: sha256(diagnostic.recommendation),
        answerability: diagnostic.answerability,
        riskLevel: diagnostic.riskLevel,
        evidenceStatus: diagnostic.evidenceStatus,
      });
      for (const evidence of diagnostic.evidence) {
        sourceNodes.push({
          evidenceId: numberedReference("E", sourceNodes.length),
          sourceType: "source_excerpt",
          sessionReference: session.sessionReference,
          diagnosticIndex: currentDiagnosticIndex,
          evidenceStatus: diagnostic.evidenceStatus,
          paragraphId: evidence.paragraphId,
          quoteDigest: sha256(evidence.quote),
        });
      }
      if (
        !diagnostic.evidence.length &&
        (diagnostic.evidenceStatus !== "valid" || diagnostic.missingInfo.length > 0)
      ) {
        sourceNodes.push({
          evidenceId: numberedReference("E", sourceNodes.length),
          sourceType: "evidence_gap",
          sessionReference: session.sessionReference,
          diagnosticIndex: currentDiagnosticIndex,
          evidenceStatus: diagnostic.evidenceStatus,
        });
      }
    }

    for (const [localAdviceIndex, action] of session.actions.entries()) {
      const adviceId = numberedReference("A", adviceNodes.length);
      adviceNodes.push({
        adviceId,
        sessionReference: session.sessionReference,
        adviceIndex: localAdviceIndex,
        adviceType: action.type,
        payloadDigest: sha256(JSON.stringify(action)),
      });

      const sessionProblems = problemNodes.filter(
        (problem) => problem.sessionReference === session.sessionReference,
      );
      const sessionSources = sourceNodes.filter(
        (source) => source.sessionReference === session.sessionReference,
      );
      let linkedProblems: AdviceLineageProblemNode[] = [];
      let linkedSources: AdviceLineageSourceNode[] = [];
      let reasonReferenceDigests: string[] = [];
      const issues: AdviceLineageIssue[] = [];
      const impactType = action.type === "author_evidence"
        ? "evidence_completeness"
        : "answerability_structure";

      if (action.type === "author_evidence") {
        const diagnosticLocalIndex = action.relatedQuestion
          ? session.diagnostics.findIndex(
              (diagnostic) => diagnostic.question === action.relatedQuestion,
            )
          : -1;
        if (diagnosticLocalIndex >= 0) {
          const linkedDiagnosticIndex =
            session.diagnosticIndexes[diagnosticLocalIndex]!;
          linkedProblems = sessionProblems.filter(
            (problem) => problem.diagnosticIndex === linkedDiagnosticIndex,
          );
          linkedSources = sessionSources.filter(
            (source) => source.diagnosticIndex === linkedDiagnosticIndex,
          );
        }
        reasonReferenceDigests = action.reason.trim()
          ? [sha256(action.reason)]
          : [];
      } else {
        const targetParagraphIds = new Set(action.targetParagraphIds);
        linkedSources = sessionSources.filter(
          (source) =>
            source.sourceType === "source_excerpt" &&
            source.paragraphId !== undefined &&
            targetParagraphIds.has(source.paragraphId),
        );
        const coveredParagraphIds = new Set(
          linkedSources.flatMap((source) =>
            source.paragraphId ? [source.paragraphId] : []
          ),
        );
        if (
          action.targetParagraphIds.some(
            (paragraphId) => !coveredParagraphIds.has(paragraphId),
          )
        ) {
          issues.push(
            sessionSources.some((source) => source.sourceType === "source_excerpt")
              ? "evidence_mismatch"
              : "evidence_missing",
          );
        }
        const linkedDiagnosticIndexes = new Set(
          linkedSources.map((source) => source.diagnosticIndex),
        );
        linkedProblems = sessionProblems.filter((problem) =>
          linkedDiagnosticIndexes.has(problem.diagnosticIndex)
        );
        reasonReferenceDigests = linkedProblems.map(
          (problem) => problem.recommendationDigest,
        );
      }

      if (
        !linkedSources.length &&
        !issues.includes("evidence_missing") &&
        !issues.includes("evidence_mismatch")
      ) {
        issues.push("evidence_missing");
      }
      if (!linkedProblems.length) issues.push("problem_missing");
      if (!reasonReferenceDigests.length) issues.push("reason_missing");
      if (!linkedProblems.length) issues.push("impact_missing");

      const problemIds = unique(
        linkedProblems.map((problem) => problem.problemId),
      );
      const diagnosticIndexes = unique(
        linkedProblems.map((problem) => problem.diagnosticIndex),
      );
      const relationIssues = unique(issues);
      relations.push({
        adviceId,
        evidenceIds: unique(
          linkedSources.map((source) => source.evidenceId),
        ),
        problemIds,
        reasonReferenceDigests: unique(reasonReferenceDigests),
        expectedImpact: {
          impactType,
          diagnosticIndexes,
          diagnosticResultFields: [
            "answerability",
            "riskLevel",
            "evidenceStatus",
          ],
        },
        result: relationIssues.length ? "lineage_missing" : "lineage_valid",
        issues: relationIssues,
      });
    }
  }

  const validAdvice = relations.filter(
    (relation) => relation.result === "lineage_valid",
  ).length;
  const payload: AdviceArtifactLineagePayload = {
    lineageSchemaVersion: ADVICE_ARTIFACT_LINEAGE_SCHEMA_VERSION,
    sourceArtifact: {
      id: input.sourceArtifactId,
      payloadSha256: input.sourceArtifactSha256,
    },
    summary: {
      sessions: sessions.length,
      diagnostics: problemNodes.length,
      advice: adviceNodes.length,
      validAdvice,
      missingAdvice: adviceNodes.length - validAdvice,
    },
    sourceNodes,
    problemNodes,
    adviceNodes,
    relations,
    result:
      validAdvice === adviceNodes.length
        ? "lineage_valid"
        : "lineage_missing",
  };
  return {
    ...payload,
    integrity: {
      algorithm: "sha256",
      payloadSha256: lineagePayloadSha256(payload),
    },
  };
}

export function serializeAdviceArtifactLineage(
  artifact: AdviceArtifactLineage,
  sensitiveValues: readonly string[] = [],
): string {
  if (
    artifact.lineageSchemaVersion !==
      ADVICE_ARTIFACT_LINEAGE_SCHEMA_VERSION ||
    artifact.integrity.algorithm !== "sha256"
  ) {
    throw new Error("Advice lineage artifact schema is invalid.");
  }
  const { integrity, ...payload } = artifact;
  if (integrity.payloadSha256 !== lineagePayloadSha256(payload)) {
    throw new Error("Advice lineage artifact integrity mismatch.");
  }
  if (
    artifact.summary.advice !== artifact.adviceNodes.length ||
    artifact.summary.advice !== artifact.relations.length ||
    artifact.summary.diagnostics !== artifact.problemNodes.length ||
    artifact.summary.validAdvice + artifact.summary.missingAdvice !==
      artifact.summary.advice
  ) {
    throw new Error("Advice lineage artifact summary is invalid.");
  }
  assertAllowedLineageShape(artifact);
  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  for (const value of sensitiveValues) {
    if (value && serialized.includes(value)) {
      throw new Error("Advice lineage artifact redaction failed.");
    }
  }
  return serialized;
}
