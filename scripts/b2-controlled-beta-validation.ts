import { createHash } from "node:crypto";

import {
  serializeStage1ValidationArtifact,
  type Stage1ValidationArtifact,
} from "./stage1-validation.ts";

export const B2_CONTROLLED_BETA_SCHEMA_VERSION =
  "b2-controlled-beta-observation-v1";
export const B2_TARGET_PROFILE = "independent_content_consultant";

export const B2_COMMERCIAL_SUCCESS_TARGETS = {
  windowDays: 90,
  realReviewUsers: 30,
  payingUsers: 10,
  repeatPayingUsers: 5,
  grossReceiptsCny: 2_000,
  paymentValidation: "deferred",
} as const;

export const B2_EXISTING_TELEMETRY_COVERAGE = {
  articleSubmission: "analysis_completed",
  evidenceTrust: "diagnosis_feedback_proxy",
  patchAdoption: "patch_copied_proxy",
  recheckValue: "controlled_observation_required",
  nextArticleDemand: "controlled_observation_required",
} as const;

const SAFE_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const CONTENT_TYPES = [
  "public_account",
  "blog_longform",
  "professional_article",
] as const;
const MONTHLY_VOLUME_BANDS = ["4_7", "8_12", "13_20"] as const;
const EVIDENCE_RECOGNITION_STATUSES = [
  "recognized",
  "rejected",
  "not_recorded",
] as const;
const EVIDENCE_USEFULNESS_STATUSES = [
  "valuable",
  "not_valuable",
  "not_recorded",
] as const;
const PATCH_ADOPTION_STATUSES = [
  "adopted",
  "partially_adopted",
  "not_adopted",
  "not_recorded",
] as const;
const PATCH_ADOPTION_CODES = [
  "evidence_supported",
  "actionable_change",
  "client_requirement",
  "meaning_risk",
  "effort_too_high",
  "not_relevant",
] as const;
const RECHECK_STATUSES = [
  "completed",
  "not_completed",
  "not_recorded",
] as const;
const RECHECK_OUTCOMES = [
  "improved",
  "unchanged",
  "regressed",
  "not_assessed",
] as const;
const RECHECK_HELPFULNESS_STATUSES = [
  "helpful",
  "not_helpful",
  "not_recorded",
] as const;
const NEXT_ARTICLE_DEMAND_STATUSES = [
  "confirmed",
  "interested",
  "none",
  "not_recorded",
] as const;
const FORBIDDEN_B2_KEYS = new Set([
  "apiKey",
  "authorization",
  "body",
  "clientName",
  "companyName",
  "content",
  "cookie",
  "credentials",
  "email",
  "environmentValue",
  "evidence",
  "modelResponse",
  "name",
  "prompt",
  "question",
  "quote",
  "reason",
  "response",
  "title",
  "token",
  "userInput",
]);

export type B2ContentType = (typeof CONTENT_TYPES)[number];
export type B2MonthlyVolumeBand = (typeof MONTHLY_VOLUME_BANDS)[number];
export type B2EvidenceRecognition =
  (typeof EVIDENCE_RECOGNITION_STATUSES)[number];
export type B2EvidenceUsefulness =
  (typeof EVIDENCE_USEFULNESS_STATUSES)[number];
export type B2PatchAdoptionStatus =
  (typeof PATCH_ADOPTION_STATUSES)[number];
export type B2PatchAdoptionCode = (typeof PATCH_ADOPTION_CODES)[number];
export type B2RecheckStatus = (typeof RECHECK_STATUSES)[number];
export type B2RecheckOutcome = (typeof RECHECK_OUTCOMES)[number];
export type B2RecheckHelpfulness =
  (typeof RECHECK_HELPFULNESS_STATUSES)[number];
export type B2NextArticleDemand =
  (typeof NEXT_ARTICLE_DEMAND_STATUSES)[number];
export type B2ObservationResult =
  | "beta_observation_valid"
  | "beta_observation_invalid";
export type B2ObservationIssue =
  | "stage1_invalid"
  | "target_profile_mismatch"
  | "not_real_delivery"
  | "article_reference_invalid"
  | "evidence_reference_invalid"
  | "evidence_decision_missing"
  | "evidence_usefulness_missing"
  | "patch_reference_invalid"
  | "patch_decision_missing"
  | "patch_adoption_inconsistent"
  | "problem_reference_invalid"
  | "recheck_reference_invalid"
  | "recheck_decision_missing"
  | "recheck_inconsistent"
  | "recheck_without_patch"
  | "next_article_decision_missing";

export interface B2ControlledBetaObservationInput {
  observationId: string;
  participant: {
    anonymousId: string;
    profile: typeof B2_TARGET_PROFILE;
    monthlyArticleVolume: B2MonthlyVolumeBand;
  };
  article: {
    artifactId: string;
    contentType: B2ContentType;
    useCase: "client_delivery_prepublication";
    realDelivery: boolean;
  };
  evidenceTrust: {
    reviewedEvidenceIds: string[];
    recognition: B2EvidenceRecognition;
    usefulness: B2EvidenceUsefulness;
  };
  patchAdoption: {
    reviewedPatchIds: string[];
    adoptedPatchIds: string[];
    adoptedProblemIds: string[];
    status: B2PatchAdoptionStatus;
    adoptionCodes: B2PatchAdoptionCode[];
  };
  recheck: {
    recheckIds: string[];
    status: B2RecheckStatus;
    outcome: B2RecheckOutcome;
    helpfulness: B2RecheckHelpfulness;
  };
  nextArticle: {
    demand: B2NextArticleDemand;
  };
}

interface B2ControlledBetaPayload {
  observationSchemaVersion: typeof B2_CONTROLLED_BETA_SCHEMA_VERSION;
  sourceStage1: {
    schemaVersion: string;
    payloadSha256: string;
  };
  observationId: string;
  participant: {
    anonymousId: string;
    profileStatus: "target_profile" | "outside_target_profile";
    monthlyArticleVolume: B2MonthlyVolumeBand;
  };
  article: {
    artifactId: string;
    contentType: B2ContentType;
    useCase: "client_delivery_prepublication";
    realDelivery: boolean;
  };
  artifactRelations: {
    analysisArtifactId: string;
    reviewedEvidenceIds: string[];
    adoptedProblemIds: string[];
    adviceIds: string[];
    reviewedPatchIds: string[];
    adoptedPatchIds: string[];
    recheckIds: string[];
  };
  decisions: {
    evidenceRecognition: B2EvidenceRecognition;
    evidenceUsefulness: B2EvidenceUsefulness;
    patchAdoption: B2PatchAdoptionStatus;
    patchAdoptionCodes: B2PatchAdoptionCode[];
    recheckStatus: B2RecheckStatus;
    recheckOutcome: B2RecheckOutcome;
    recheckHelpfulness: B2RecheckHelpfulness;
    nextArticleDemand: B2NextArticleDemand;
  };
  flowStatus: {
    submission: "submission_recorded" | "submission_invalid";
    firstReview: "review_recorded" | "review_incomplete";
    patchDecision: "patch_decision_recorded" | "patch_decision_incomplete";
    recheckDecision:
      | "recheck_decision_recorded"
      | "recheck_decision_incomplete";
    nextArticleDecision:
      | "next_article_decision_recorded"
      | "next_article_decision_incomplete";
  };
  signals: {
    evidenceTrust: "signal_confirmed" | "signal_not_confirmed";
    patchAdoption: "signal_confirmed" | "signal_not_confirmed";
    recheckValue: "signal_confirmed" | "signal_not_confirmed";
    nextArticleDemand:
      | "signal_confirmed"
      | "signal_directional"
      | "signal_not_confirmed";
    valueLoop: "value_loop_complete" | "value_loop_incomplete";
  };
  issues: B2ObservationIssue[];
  result: B2ObservationResult;
}

export interface B2ControlledBetaArtifact extends B2ControlledBetaPayload {
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

function hasUniqueSafeIds(values: readonly string[], allowEmpty = false): boolean {
  return (allowEmpty || values.length > 0) &&
    values.every((value) => SAFE_ID_PATTERN.test(value)) &&
    new Set(values).size === values.length;
}

function includesValue<T extends string>(
  values: readonly T[],
  value: unknown,
): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function assertAllowedB2Shape(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertAllowedB2Shape(item);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_B2_KEYS.has(key)) {
      throw new Error("B.2 observation contains a forbidden field.");
    }
    assertAllowedB2Shape(child);
  }
}

function payloadSha256(value: B2ControlledBetaPayload): string {
  return sha256(JSON.stringify(value));
}

export function validateB2ControlledBetaObservation(input: {
  stage1: Stage1ValidationArtifact;
  observation: B2ControlledBetaObservationInput;
}): B2ControlledBetaArtifact {
  serializeStage1ValidationArtifact(input.stage1);
  assertAllowedB2Shape(input.observation);

  const { observation } = input;
  if (
    !SAFE_ID_PATTERN.test(observation.observationId) ||
    !SAFE_ID_PATTERN.test(observation.participant.anonymousId)
  ) {
    throw new Error("B.2 observation identifiers are invalid.");
  }
  if (
    !includesValue(
      MONTHLY_VOLUME_BANDS,
      observation.participant.monthlyArticleVolume,
    ) ||
    !includesValue(CONTENT_TYPES, observation.article.contentType) ||
    observation.article.useCase !== "client_delivery_prepublication" ||
    typeof observation.article.realDelivery !== "boolean" ||
    !includesValue(
      EVIDENCE_RECOGNITION_STATUSES,
      observation.evidenceTrust.recognition,
    ) ||
    !includesValue(
      EVIDENCE_USEFULNESS_STATUSES,
      observation.evidenceTrust.usefulness,
    ) ||
    !includesValue(
      PATCH_ADOPTION_STATUSES,
      observation.patchAdoption.status,
    ) ||
    !observation.patchAdoption.adoptionCodes.every((code) =>
      includesValue(PATCH_ADOPTION_CODES, code)
    ) ||
    !includesValue(RECHECK_STATUSES, observation.recheck.status) ||
    !includesValue(RECHECK_OUTCOMES, observation.recheck.outcome) ||
    !includesValue(
      RECHECK_HELPFULNESS_STATUSES,
      observation.recheck.helpfulness,
    ) ||
    !includesValue(
      NEXT_ARTICLE_DEMAND_STATUSES,
      observation.nextArticle.demand,
    )
  ) {
    throw new Error("B.2 observation status is invalid.");
  }

  const issues: B2ObservationIssue[] = [];
  if (input.stage1.result !== "stage1_valid") {
    issues.push("stage1_invalid");
  }
  const targetProfile =
    observation.participant.profile === B2_TARGET_PROFILE;
  if (!targetProfile) {
    issues.push("target_profile_mismatch");
  }
  if (!observation.article.realDelivery) {
    issues.push("not_real_delivery");
  }
  const articleReferenceValid =
    SAFE_ID_PATTERN.test(observation.article.artifactId) &&
    observation.article.artifactId ===
      input.stage1.sourceArtifacts.inputArtifact.artifactId;
  if (!articleReferenceValid) {
    issues.push("article_reference_invalid");
  }

  const stageEvidenceIds = new Set(
    input.stage1.flowRelations.flatMap((flow) => flow.evidenceIds),
  );
  const stageProblemIds = new Set(
    input.stage1.flowRelations.flatMap((flow) => flow.problemIds),
  );
  const stagePatchIds = new Set(
    input.stage1.flowRelations.map((flow) => flow.patchId),
  );
  const stageRecheckIds = new Set(
    input.stage1.flowRelations.flatMap((flow) =>
      flow.recheckId ? [flow.recheckId] : []
    ),
  );
  const evidenceReferencesValid =
    hasUniqueSafeIds(observation.evidenceTrust.reviewedEvidenceIds) &&
    observation.evidenceTrust.reviewedEvidenceIds.every((evidenceId) =>
      stageEvidenceIds.has(evidenceId)
    );
  if (!evidenceReferencesValid) {
    issues.push("evidence_reference_invalid");
  }
  if (observation.evidenceTrust.recognition === "not_recorded") {
    issues.push("evidence_decision_missing");
  }
  if (observation.evidenceTrust.usefulness === "not_recorded") {
    issues.push("evidence_usefulness_missing");
  }

  const reviewedPatchIds = observation.patchAdoption.reviewedPatchIds;
  const adoptedPatchIds = observation.patchAdoption.adoptedPatchIds;
  const adoptedProblemIds = observation.patchAdoption.adoptedProblemIds;
  const patchReferencesValid =
    hasUniqueSafeIds(reviewedPatchIds) &&
    hasUniqueSafeIds(adoptedPatchIds, true) &&
    reviewedPatchIds.every((patchId) => stagePatchIds.has(patchId)) &&
    adoptedPatchIds.every(
      (patchId) =>
        stagePatchIds.has(patchId) && reviewedPatchIds.includes(patchId),
    );
  if (!patchReferencesValid) {
    issues.push("patch_reference_invalid");
  }
  if (observation.patchAdoption.status === "not_recorded") {
    issues.push("patch_decision_missing");
  }
  const adoptionCountConsistent =
    (
      observation.patchAdoption.status === "adopted" &&
      adoptedPatchIds.length > 0 &&
      adoptedPatchIds.length === reviewedPatchIds.length
    ) ||
    (
      observation.patchAdoption.status === "partially_adopted" &&
      adoptedPatchIds.length > 0 &&
      adoptedPatchIds.length < reviewedPatchIds.length
    ) ||
    (
      observation.patchAdoption.status === "not_adopted" &&
      adoptedPatchIds.length === 0
    ) ||
    observation.patchAdoption.status === "not_recorded";
  if (
    !adoptionCountConsistent ||
    (
      observation.patchAdoption.status !== "not_recorded" &&
      observation.patchAdoption.adoptionCodes.length === 0
    )
  ) {
    issues.push("patch_adoption_inconsistent");
  }

  const adoptedPatchIdSet = new Set(adoptedPatchIds);
  const allowedAdoptedProblemIds = new Set(
    input.stage1.flowRelations.flatMap((flow) =>
      adoptedPatchIdSet.has(flow.patchId) ? flow.problemIds : []
    ),
  );
  const adoptedProblemsValid =
    hasUniqueSafeIds(adoptedProblemIds, adoptedPatchIds.length === 0) &&
    adoptedProblemIds.every(
      (problemId) =>
        stageProblemIds.has(problemId) &&
        allowedAdoptedProblemIds.has(problemId),
    ) &&
    (
      adoptedPatchIds.length === 0
        ? adoptedProblemIds.length === 0
        : adoptedProblemIds.length > 0
    );
  if (!adoptedProblemsValid) {
    issues.push("problem_reference_invalid");
  }

  const allowedRecheckIds = new Set(
    input.stage1.flowRelations.flatMap((flow) =>
      adoptedPatchIdSet.has(flow.patchId) && flow.recheckId
        ? [flow.recheckId]
        : []
    ),
  );
  const recheckReferencesValid =
    hasUniqueSafeIds(
      observation.recheck.recheckIds,
      observation.recheck.status !== "completed",
    ) &&
    observation.recheck.recheckIds.every(
      (recheckId) =>
        stageRecheckIds.has(recheckId) && allowedRecheckIds.has(recheckId),
    );
  if (!recheckReferencesValid) {
    issues.push("recheck_reference_invalid");
  }
  if (observation.recheck.status === "not_recorded") {
    issues.push("recheck_decision_missing");
  }
  if (
    observation.recheck.status === "completed" &&
    adoptedPatchIds.length === 0
  ) {
    issues.push("recheck_without_patch");
  }
  const recheckConsistent =
    (
      observation.recheck.status === "completed" &&
      observation.recheck.recheckIds.length > 0 &&
      observation.recheck.outcome !== "not_assessed" &&
      observation.recheck.helpfulness !== "not_recorded"
    ) ||
    (
      observation.recheck.status === "not_completed" &&
      observation.recheck.recheckIds.length === 0 &&
      observation.recheck.outcome === "not_assessed" &&
      observation.recheck.helpfulness === "not_recorded"
    ) ||
    observation.recheck.status === "not_recorded";
  if (!recheckConsistent) {
    issues.push("recheck_inconsistent");
  }
  if (observation.nextArticle.demand === "not_recorded") {
    issues.push("next_article_decision_missing");
  }

  const evidenceTrustConfirmed =
    observation.evidenceTrust.recognition === "recognized" &&
    observation.evidenceTrust.usefulness === "valuable";
  const patchAdoptionConfirmed =
    observation.patchAdoption.status === "adopted" ||
    observation.patchAdoption.status === "partially_adopted";
  const recheckValueConfirmed =
    observation.recheck.status === "completed" &&
    observation.recheck.outcome === "improved" &&
    observation.recheck.helpfulness === "helpful";
  const nextArticleDemand = observation.nextArticle.demand === "confirmed"
    ? "signal_confirmed"
    : observation.nextArticle.demand === "interested"
      ? "signal_directional"
      : "signal_not_confirmed";
  const valueLoopComplete =
    evidenceTrustConfirmed &&
    patchAdoptionConfirmed &&
    recheckValueConfirmed &&
    nextArticleDemand === "signal_confirmed";
  const reviewRecorded =
    evidenceReferencesValid &&
    observation.evidenceTrust.recognition !== "not_recorded" &&
    observation.evidenceTrust.usefulness !== "not_recorded";
  const patchDecisionRecorded =
    patchReferencesValid &&
    adoptedProblemsValid &&
    adoptionCountConsistent &&
    observation.patchAdoption.status !== "not_recorded" &&
    observation.patchAdoption.adoptionCodes.length > 0;
  const recheckDecisionRecorded =
    recheckReferencesValid &&
    recheckConsistent &&
    observation.recheck.status !== "not_recorded";
  const uniqueIssues = unique(issues);
  const payload: B2ControlledBetaPayload = {
    observationSchemaVersion: B2_CONTROLLED_BETA_SCHEMA_VERSION,
    sourceStage1: {
      schemaVersion: input.stage1.validationSchemaVersion,
      payloadSha256: input.stage1.integrity.payloadSha256,
    },
    observationId: observation.observationId,
    participant: {
      anonymousId: observation.participant.anonymousId,
      profileStatus: targetProfile
        ? "target_profile"
        : "outside_target_profile",
      monthlyArticleVolume: observation.participant.monthlyArticleVolume,
    },
    article: observation.article,
    artifactRelations: {
      analysisArtifactId:
        input.stage1.sourceArtifacts.analysisArtifact.artifactId,
      reviewedEvidenceIds: observation.evidenceTrust.reviewedEvidenceIds,
      adoptedProblemIds,
      adviceIds: unique(
        input.stage1.flowRelations.flatMap((flow) =>
          reviewedPatchIds.includes(flow.patchId) ? flow.adviceIds : []
        ),
      ),
      reviewedPatchIds,
      adoptedPatchIds,
      recheckIds: observation.recheck.recheckIds,
    },
    decisions: {
      evidenceRecognition: observation.evidenceTrust.recognition,
      evidenceUsefulness: observation.evidenceTrust.usefulness,
      patchAdoption: observation.patchAdoption.status,
      patchAdoptionCodes: observation.patchAdoption.adoptionCodes,
      recheckStatus: observation.recheck.status,
      recheckOutcome: observation.recheck.outcome,
      recheckHelpfulness: observation.recheck.helpfulness,
      nextArticleDemand: observation.nextArticle.demand,
    },
    flowStatus: {
      submission:
        articleReferenceValid && observation.article.realDelivery
          ? "submission_recorded"
          : "submission_invalid",
      firstReview: reviewRecorded ? "review_recorded" : "review_incomplete",
      patchDecision: patchDecisionRecorded
        ? "patch_decision_recorded"
        : "patch_decision_incomplete",
      recheckDecision: recheckDecisionRecorded
        ? "recheck_decision_recorded"
        : "recheck_decision_incomplete",
      nextArticleDecision:
        observation.nextArticle.demand !== "not_recorded"
          ? "next_article_decision_recorded"
          : "next_article_decision_incomplete",
    },
    signals: {
      evidenceTrust: evidenceTrustConfirmed
        ? "signal_confirmed"
        : "signal_not_confirmed",
      patchAdoption: patchAdoptionConfirmed
        ? "signal_confirmed"
        : "signal_not_confirmed",
      recheckValue: recheckValueConfirmed
        ? "signal_confirmed"
        : "signal_not_confirmed",
      nextArticleDemand,
      valueLoop: valueLoopComplete
        ? "value_loop_complete"
        : "value_loop_incomplete",
    },
    issues: uniqueIssues,
    result: uniqueIssues.length
      ? "beta_observation_invalid"
      : "beta_observation_valid",
  };
  return {
    ...payload,
    integrity: {
      algorithm: "sha256",
      payloadSha256: payloadSha256(payload),
    },
  };
}

export function serializeB2ControlledBetaArtifact(
  artifact: B2ControlledBetaArtifact,
  sensitiveValues: readonly string[] = [],
): string {
  if (
    artifact.observationSchemaVersion !==
      B2_CONTROLLED_BETA_SCHEMA_VERSION ||
    artifact.integrity.algorithm !== "sha256" ||
    !SHA256_PATTERN.test(artifact.integrity.payloadSha256)
  ) {
    throw new Error("B.2 observation schema is invalid.");
  }
  const { integrity, ...payload } = artifact;
  if (integrity.payloadSha256 !== payloadSha256(payload)) {
    throw new Error("B.2 observation integrity mismatch.");
  }
  const allFlowDecisionsRecorded =
    artifact.flowStatus.submission === "submission_recorded" &&
    artifact.flowStatus.firstReview === "review_recorded" &&
    artifact.flowStatus.patchDecision === "patch_decision_recorded" &&
    artifact.flowStatus.recheckDecision === "recheck_decision_recorded" &&
    artifact.flowStatus.nextArticleDecision ===
      "next_article_decision_recorded";
  if (
    (
      artifact.result === "beta_observation_valid" &&
      (!allFlowDecisionsRecorded || artifact.issues.length > 0)
    ) ||
    (
      artifact.signals.valueLoop === "value_loop_complete" &&
      (
        artifact.signals.evidenceTrust !== "signal_confirmed" ||
        artifact.signals.patchAdoption !== "signal_confirmed" ||
        artifact.signals.recheckValue !== "signal_confirmed" ||
        artifact.signals.nextArticleDemand !== "signal_confirmed"
      )
    )
  ) {
    throw new Error("B.2 observation state is invalid.");
  }
  assertAllowedB2Shape(artifact);
  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  for (const value of sensitiveValues) {
    if (value && serialized.includes(value)) {
      throw new Error("B.2 observation redaction failed.");
    }
  }
  return serialized;
}
