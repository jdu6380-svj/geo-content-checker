import { createHash } from "node:crypto";

import {
  serializeAdviceArtifactLineage,
  type AdviceArtifactLineage,
} from "./advice-artifact-lineage.ts";
import {
  serializeAdviceQualityArtifact,
  type AdviceQualityArtifact,
} from "./advice-quality-validation.ts";
import {
  serializeContentDraftValidationArtifact,
  type ContentDraftValidationArtifact,
} from "./content-draft-validation.ts";

export const STAGE1_VALIDATION_SCHEMA_VERSION = "stage1-validation-v1";

const SAFE_ARTIFACT_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const FORBIDDEN_STAGE1_KEYS = new Set([
  "answer",
  "apiKey",
  "authorization",
  "body",
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
  "value",
]);

export type Stage1ValidationResult = "stage1_valid" | "stage1_invalid";
export type Stage1FlowResult = "flow_valid" | "flow_invalid";
export type Stage1ValidationIssue =
  | "input_analysis_mismatch"
  | "analysis_lineage_mismatch"
  | "lineage_quality_mismatch"
  | "quality_patch_mismatch"
  | "evidence_missing"
  | "problem_missing"
  | "advice_missing"
  | "advice_invalid"
  | "patch_invalid"
  | "recheck_unavailable"
  | "advice_patch_missing";

export interface Stage1ArtifactReference {
  artifactId: string;
  payloadSha256: string;
}

export interface Stage1AnalysisArtifactReference
  extends Stage1ArtifactReference {
  sourceInputSha256: string;
}

export interface Stage1FlowRelation {
  flowId: string;
  inputArtifactId: string;
  analysisArtifactId: string;
  evidenceIds: string[];
  problemIds: string[];
  adviceIds: string[];
  patchId: string;
  recheckId: string | null;
  recheckSha256: string | null;
  result: Stage1FlowResult;
  issues: Stage1ValidationIssue[];
}

export interface Stage1AdvicePatchRelation {
  adviceId: string;
  patchIds: string[];
  status: "patch_linked" | "patch_missing";
}

interface Stage1ValidationPayload {
  validationSchemaVersion: typeof STAGE1_VALIDATION_SCHEMA_VERSION;
  sourceArtifacts: {
    inputArtifact: Stage1ArtifactReference;
    analysisArtifact: Stage1AnalysisArtifactReference;
    lineageArtifact: {
      schemaVersion: string;
      payloadSha256: string;
    };
    adviceArtifact: {
      schemaVersion: string;
      payloadSha256: string;
    };
    patchArtifact: {
      schemaVersion: string;
      payloadSha256: string;
    };
  };
  summary: {
    evidenceNodes: number;
    problems: number;
    advice: number;
    patches: number;
    flows: number;
    validFlows: number;
    invalidFlows: number;
    linkedAdvice: number;
    missingAdvicePatches: number;
    recheckReady: number;
  };
  flowRelations: Stage1FlowRelation[];
  advicePatchRelations: Stage1AdvicePatchRelation[];
  readiness: {
    problemLocation:
      | "problem_location_ready"
      | "problem_location_unavailable";
    rationale: "reason_ready" | "reason_unavailable";
    modification: "modification_ready" | "modification_unavailable";
    recheck: "recheck_ready" | "recheck_unavailable";
    nextContent: "next_content_ready" | "next_content_unavailable";
  };
  issues: Stage1ValidationIssue[];
  result: Stage1ValidationResult;
}

export interface Stage1ValidationArtifact extends Stage1ValidationPayload {
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

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function assertArtifactReference(
  reference: Stage1ArtifactReference,
  label: string,
): void {
  if (
    !SAFE_ARTIFACT_ID_PATTERN.test(reference.artifactId) ||
    !SHA256_PATTERN.test(reference.payloadSha256)
  ) {
    throw new Error(`Stage 1 ${label} artifact reference is invalid.`);
  }
}

function validationPayloadSha256(value: Stage1ValidationPayload): string {
  return sha256(JSON.stringify(value));
}

function assertAllowedStage1Shape(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertAllowedStage1Shape(item);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_STAGE1_KEYS.has(key)) {
      throw new Error("Stage 1 artifact contains a forbidden field.");
    }
    assertAllowedStage1Shape(child);
  }
}

function numberedId(prefix: "F" | "R", index: number): string {
  return `${prefix}${String(index + 1).padStart(3, "0")}`;
}

export function validateStage1(input: {
  inputArtifact: Stage1ArtifactReference;
  analysisArtifact: Stage1AnalysisArtifactReference;
  lineage: AdviceArtifactLineage;
  adviceQuality: AdviceQualityArtifact;
  contentDraft: ContentDraftValidationArtifact;
}): Stage1ValidationArtifact {
  assertArtifactReference(input.inputArtifact, "input");
  assertArtifactReference(input.analysisArtifact, "analysis");
  if (!SHA256_PATTERN.test(input.analysisArtifact.sourceInputSha256)) {
    throw new Error("Stage 1 analysis source input digest is invalid.");
  }
  serializeAdviceArtifactLineage(input.lineage);
  serializeAdviceQualityArtifact(input.adviceQuality);
  serializeContentDraftValidationArtifact(input.contentDraft);

  const issues: Stage1ValidationIssue[] = [];
  if (
    input.analysisArtifact.sourceInputSha256 !==
      input.inputArtifact.payloadSha256
  ) {
    issues.push("input_analysis_mismatch");
  }
  if (
    input.analysisArtifact.artifactId !== input.lineage.sourceArtifact.id ||
    input.analysisArtifact.payloadSha256 !==
      input.lineage.sourceArtifact.payloadSha256
  ) {
    issues.push("analysis_lineage_mismatch");
  }
  if (
    input.adviceQuality.sourceLineage.payloadSha256 !==
      input.lineage.integrity.payloadSha256
  ) {
    issues.push("lineage_quality_mismatch");
  }
  if (
    input.contentDraft.sourceAdviceQuality.payloadSha256 !==
      input.adviceQuality.integrity.payloadSha256
  ) {
    issues.push("quality_patch_mismatch");
  }

  const evidenceIds = new Set(
    input.lineage.sourceNodes.map((node) => node.evidenceId),
  );
  const problemIds = new Set(
    input.lineage.problemNodes.map((node) => node.problemId),
  );
  const adviceIds = new Set(
    input.lineage.adviceNodes.map((node) => node.adviceId),
  );
  const lineageRelations = new Map(
    input.lineage.relations.map((relation) => [relation.adviceId, relation]),
  );
  const qualityRecords = new Map(
    input.adviceQuality.records.map((record) => [record.adviceId, record]),
  );
  const draftRelations = new Map(
    input.contentDraft.relations.map((relation) => [
      relation.patchId,
      relation,
    ]),
  );

  const flowRelations = input.contentDraft.patchNodes.map(
    (patchNode, patchIndex) => {
      const relation = draftRelations.get(patchNode.patchId);
      const flowIssues: Stage1ValidationIssue[] = [];
      const linkedEvidenceIds = relation?.evidenceIds ?? [];
      const linkedProblemIds = relation?.problemIds ?? [];
      const linkedAdviceIds = relation?.adviceIds ?? [];
      const evidenceLinked =
        linkedEvidenceIds.length > 0 &&
        linkedEvidenceIds.every((evidenceId) => evidenceIds.has(evidenceId));
      const problemsLinked =
        linkedProblemIds.length > 0 &&
        linkedProblemIds.every((problemId) => problemIds.has(problemId));
      const adviceLinked =
        linkedAdviceIds.length > 0 &&
        linkedAdviceIds.every((adviceId) => {
          const lineageRelation = lineageRelations.get(adviceId);
          const qualityRecord = qualityRecords.get(adviceId);
          return adviceIds.has(adviceId) &&
            lineageRelation?.result === "lineage_valid" &&
            qualityRecord?.result === "advice_valid" &&
            lineageRelation.evidenceIds.some((evidenceId) =>
              linkedEvidenceIds.includes(evidenceId)
            ) &&
            lineageRelation.problemIds.some((problemId) =>
              linkedProblemIds.includes(problemId)
            );
        });
      const patchValid =
        SHA256_PATTERN.test(patchNode.payloadDigest) &&
        relation?.result === "patch_valid";
      const recheckReady =
        relation?.recheckStatus === "recheck_ready" &&
        relation.recheckDigest !== null &&
        SHA256_PATTERN.test(relation.recheckDigest);

      if (!evidenceLinked) flowIssues.push("evidence_missing");
      if (!problemsLinked) flowIssues.push("problem_missing");
      if (!linkedAdviceIds.length) {
        flowIssues.push("advice_missing");
      } else if (!adviceLinked) {
        flowIssues.push("advice_invalid");
      }
      if (!patchValid) flowIssues.push("patch_invalid");
      if (!recheckReady) flowIssues.push("recheck_unavailable");

      const result = flowIssues.length ? "flow_invalid" : "flow_valid";
      return {
        flowId: numberedId("F", patchIndex),
        inputArtifactId: input.inputArtifact.artifactId,
        analysisArtifactId: input.analysisArtifact.artifactId,
        evidenceIds: linkedEvidenceIds,
        problemIds: linkedProblemIds,
        adviceIds: linkedAdviceIds,
        patchId: patchNode.patchId,
        recheckId: recheckReady ? numberedId("R", patchIndex) : null,
        recheckSha256: recheckReady ? relation.recheckDigest : null,
        result,
        issues: unique(flowIssues),
      } satisfies Stage1FlowRelation;
    },
  );

  const advicePatchRelations = input.lineage.adviceNodes.map((adviceNode) => {
    const patchIds = flowRelations.flatMap((flow) =>
      flow.result === "flow_valid" &&
        flow.adviceIds.includes(adviceNode.adviceId)
        ? [flow.patchId]
        : []
    );
    return {
      adviceId: adviceNode.adviceId,
      patchIds,
      status: patchIds.length ? "patch_linked" : "patch_missing",
    } satisfies Stage1AdvicePatchRelation;
  });
  if (
    input.lineage.result !== "lineage_valid" ||
    input.adviceQuality.result !== "advice_valid"
  ) {
    issues.push("advice_invalid");
  }
  issues.push(
    ...flowRelations.flatMap((flow) => flow.issues),
  );
  if (
    advicePatchRelations.some((relation) => relation.status === "patch_missing")
  ) {
    issues.push("advice_patch_missing");
  }

  const problemLocationReady =
    flowRelations.length > 0 &&
    flowRelations.every(
      (flow) => flow.evidenceIds.length > 0 && flow.problemIds.length > 0,
    );
  const reasonReady =
    input.lineage.result === "lineage_valid" &&
    input.adviceQuality.result === "advice_valid" &&
    input.lineage.relations.every(
      (relation) =>
        relation.result === "lineage_valid" &&
        relation.reasonReferenceDigests.length > 0,
    );
  const modificationReady =
    flowRelations.length > 0 &&
    flowRelations.every((flow) => flow.result === "flow_valid") &&
    advicePatchRelations.every(
      (relation) => relation.status === "patch_linked",
    );
  const recheckReady =
    flowRelations.length > 0 &&
    flowRelations.every(
      (flow) =>
        flow.result === "flow_valid" &&
        flow.recheckId !== null &&
        flow.recheckSha256 !== null,
    );
  const uniqueIssues = unique(issues);
  const sourceReady = !uniqueIssues.some((issue) =>
    [
      "input_analysis_mismatch",
      "analysis_lineage_mismatch",
      "lineage_quality_mismatch",
      "quality_patch_mismatch",
    ].includes(issue)
  );
  const nextContentReady =
    sourceReady &&
    problemLocationReady &&
    reasonReady &&
    modificationReady &&
    recheckReady &&
    uniqueIssues.length === 0;
  const validFlows = flowRelations.filter(
    (flow) => flow.result === "flow_valid",
  ).length;
  const linkedAdvice = advicePatchRelations.filter(
    (relation) => relation.status === "patch_linked",
  ).length;
  const payload: Stage1ValidationPayload = {
    validationSchemaVersion: STAGE1_VALIDATION_SCHEMA_VERSION,
    sourceArtifacts: {
      inputArtifact: input.inputArtifact,
      analysisArtifact: input.analysisArtifact,
      lineageArtifact: {
        schemaVersion: input.lineage.lineageSchemaVersion,
        payloadSha256: input.lineage.integrity.payloadSha256,
      },
      adviceArtifact: {
        schemaVersion: input.adviceQuality.qualitySchemaVersion,
        payloadSha256: input.adviceQuality.integrity.payloadSha256,
      },
      patchArtifact: {
        schemaVersion: input.contentDraft.validationSchemaVersion,
        payloadSha256: input.contentDraft.integrity.payloadSha256,
      },
    },
    summary: {
      evidenceNodes: input.lineage.sourceNodes.length,
      problems: input.lineage.problemNodes.length,
      advice: input.lineage.adviceNodes.length,
      patches: input.contentDraft.patchNodes.length,
      flows: flowRelations.length,
      validFlows,
      invalidFlows: flowRelations.length - validFlows,
      linkedAdvice,
      missingAdvicePatches: advicePatchRelations.length - linkedAdvice,
      recheckReady: flowRelations.filter(
        (flow) => flow.recheckId !== null,
      ).length,
    },
    flowRelations,
    advicePatchRelations,
    readiness: {
      problemLocation: problemLocationReady
        ? "problem_location_ready"
        : "problem_location_unavailable",
      rationale: reasonReady ? "reason_ready" : "reason_unavailable",
      modification: modificationReady
        ? "modification_ready"
        : "modification_unavailable",
      recheck: recheckReady ? "recheck_ready" : "recheck_unavailable",
      nextContent: nextContentReady
        ? "next_content_ready"
        : "next_content_unavailable",
    },
    issues: uniqueIssues,
    result: nextContentReady ? "stage1_valid" : "stage1_invalid",
  };
  return {
    ...payload,
    integrity: {
      algorithm: "sha256",
      payloadSha256: validationPayloadSha256(payload),
    },
  };
}

export function serializeStage1ValidationArtifact(
  artifact: Stage1ValidationArtifact,
  sensitiveValues: readonly string[] = [],
): string {
  if (
    artifact.validationSchemaVersion !== STAGE1_VALIDATION_SCHEMA_VERSION ||
    artifact.integrity.algorithm !== "sha256"
  ) {
    throw new Error("Stage 1 artifact schema is invalid.");
  }
  const { integrity, ...payload } = artifact;
  if (integrity.payloadSha256 !== validationPayloadSha256(payload)) {
    throw new Error("Stage 1 artifact integrity mismatch.");
  }
  if (
    artifact.summary.flows !== artifact.flowRelations.length ||
    artifact.summary.patches !== artifact.flowRelations.length ||
    artifact.summary.advice !== artifact.advicePatchRelations.length ||
    artifact.summary.validFlows + artifact.summary.invalidFlows !==
      artifact.summary.flows ||
    artifact.summary.linkedAdvice +
        artifact.summary.missingAdvicePatches !==
      artifact.summary.advice ||
    artifact.summary.recheckReady !==
      artifact.flowRelations.filter((flow) => flow.recheckId !== null).length
  ) {
    throw new Error("Stage 1 artifact summary is invalid.");
  }
  assertAllowedStage1Shape(artifact);
  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  for (const value of sensitiveValues) {
    if (value && serialized.includes(value)) {
      throw new Error("Stage 1 artifact redaction failed.");
    }
  }
  return serialized;
}
