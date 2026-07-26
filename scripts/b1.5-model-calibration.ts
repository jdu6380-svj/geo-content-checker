import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";

import type {
  JsonBoundaryCharacterType,
  JsonErrorCategory,
  JsonParserErrorName,
} from "../lib/ai/json.ts";
import type { DiagnosticResult } from "../lib/schemas/geo.ts";
import {
  createNumberedParagraphs,
  requireB1RuntimeLogCollectorReady,
  startB1RuntimeLogCollector,
  validateB1Corpus,
  type B1CallRecord,
  type B1CorpusArticle,
  type B1Paragraph,
  type B1RuntimeLogCollectionResult,
  type B1RuntimeLogCollector,
  type B1RuntimeLogConfig,
  type B1RuntimeLogCollectorState,
  type B1RuntimeLogStatus,
} from "./b1-technical-validation.ts";
import {
  isVercelDeploymentProtectionRedirect,
  normalizePreviewUrl,
  resolveAutomationBypassSecret,
  validatePreviewDeploymentMetadata,
  withAutomationBypassRequestInit,
} from "./preview-automation.mjs";

export const B15_CALIBRATION_SCHEMA_VERSION = "b1.5-v11";
export const B15_ADVICE_DIAGNOSTICS_SCHEMA_VERSION =
  "b1.5-advice-diagnostics-v1";
export const B15_REQUIRED_NODE_VERSION = "v22.23.1";
export const B15_REQUIRED_CORPUS_SHA256 =
  "6d3115d362c762f9f6ba1235ca897230405f07834235173b940181d5765d72f3";
export const B15_EXPECTED_BRANCH = "feature/public-beta-hardening";
export const B15_EXPECTED_MODEL_REQUESTS = 120;

const CALIBRATION_ROOT_SEGMENTS = ["outputs", "b1", "calibration"] as const;
const HEALTH_CHECK_KEYS = [
  "modelConfigured",
  "redisConfigured",
  "securityConfigured",
  "feedbackConfigured",
  "sentryConfigured",
] as const;
const CALIBRATION_ROUTES = [
  "/api/evaluate-scoring",
  "/api/qa-diagnostic",
  "/api/generate-patches",
] as const;
const CALIBRATION_MODULES = [
  "diagnose",
  "scoring",
  "advice",
  "content_draft",
] as const;
const RUNTIME_LOG_STATUSES = [
  "matched",
  "delayed-ingestion",
  "true-missing",
  "collector-unavailable",
  "not-applicable",
] as const;
const MODEL_STATUSES = [
  "not-requested",
  "requested",
  "success",
  "disabled",
  "failed",
  "invalid-output",
  "rate-limited",
  "timeout",
] as const;
const FINISH_REASONS = [
  "stop",
  "length",
  "content_filter",
  "tool_calls",
  "function_call",
  "unknown",
] as const;
const VALIDATION_STAGES = [
  "json_parse",
  "schema_validation",
  "semantic_validation",
  "reference_validation",
  "evidence_validation",
] as const;
const HTTP_ERROR_BOUNDARY_CATEGORIES = [
  "A. route handler error",
  "B. upstream provider error",
  "C. platform gateway error",
  "D. client/network error",
  "E. unknown",
] as const;
const ARTIFACT_RECORD_KEYS = [
  "requestId",
  "route",
  "httpStatus",
  "responseContentType",
  "xRequestId",
  "serverTiming",
  "errorBoundaryCategory",
  "modelStatus",
  "latencyMs",
  "timeout",
  "validationStage",
  "validationFieldPaths",
  "responseLength",
  "trimmedLength",
  "firstCharType",
  "lastCharType",
  "startsWithCodeFence",
  "endsWithCodeFence",
  "parserErrorName",
  "parserErrorPosition",
  "jsonErrorCategory",
  "containsMultipleTopLevelValues",
  "hasLeadingNonWhitespaceText",
  "hasTrailingNonWhitespaceText",
  "providerRequestStartAt",
  "firstByteAt",
  "firstTokenAt",
  "responseCompletedAt",
  "abortedAt",
  "streamDurationMs",
  "contentPresent",
  "contentLength",
  "finishReason",
  "promptTokens",
  "completionTokens",
  "reasoningTokens",
  "totalTokens",
] as const;
const FORBIDDEN_ARTIFACT_KEYS = new Set([
  "article",
  "articleContent",
  "content",
  "evidence",
  "fullResponse",
  "modelPayload",
  "payload",
  "prompt",
  "question",
  "rawLog",
  "response",
  "secret",
  "title",
  "token",
]);
const QUESTION_PREDICTION_BASELINE_PER_ROUND = 10;
const ADVICE_DIAGNOSTICS_EXPECTED_SESSIONS = 20;
const ADVICE_DIAGNOSTICS_EXPECTED_RECORDS = 60;
const ADVICE_DIAGNOSTIC_REFERENCE_PREFIX = "{{B15_REF_";
const ADVICE_DIAGNOSTIC_EXCERPT_LENGTH = 24;
const ADVICE_DIAGNOSTIC_REFERENCE_PATTERN_SOURCE =
  String.raw`\{\{B15_REF_(TITLE|QUESTION_[0-2]|EVIDENCE_[0-2])\}\}`;
const ADVICE_ANSWERABILITY_VALUES = ["可以完全回答", "信息不足", "有风险"] as const;
const ADVICE_RISK_LEVEL_VALUES = ["low", "medium", "high"] as const;
const ADVICE_EVIDENCE_STATUS_VALUES = ["valid", "missing", "invalid"] as const;
const B15_ADVICE_DIAGNOSTIC_SCHEMA: z.ZodType<DiagnosticResult> = z.object({
  question: z.string().trim().min(1).max(200),
  answerability: z.enum(ADVICE_ANSWERABILITY_VALUES),
  riskLevel: z.enum(ADVICE_RISK_LEVEL_VALUES),
  evidence: z.array(
    z.object({
      paragraphId: z.string().regex(/^Para-\d+$/),
      quote: z.string().trim().min(1).max(400),
    }),
  ).max(3),
  missingInfo: z.array(z.string().trim().min(1).max(120)).max(5),
  recommendation: z.string().trim().min(1).max(500),
  source: z.enum(["model", "fallback"]),
  evidenceStatus: z.enum(ADVICE_EVIDENCE_STATUS_VALUES),
});
const CALL_DELAY_MS = 1_500;
const RUNTIME_LOG_READINESS_TIMEOUT_MS = 15_000;
const RUNTIME_LOG_RECORD_TIMEOUT_MS = 60_000;
const INFRASTRUCTURE_ISSUE_CODES = [
  "analysis-session-unavailable",
  "artifact-integrity-failure",
  "client-timeout",
  "http-error",
  "invalid-response",
  "network-error",
  "preview-drift-or-health-failure",
  "protection-blocked",
  "rate-limited",
  "runtime-log-disconnected",
  "runtime-log-not-ready",
  "runtime-log-timeout",
  "runner-interrupted",
  "transport-route-mismatch",
  "unknown-infrastructure-failure",
] as const;

type JsonRecord = Record<string, unknown>;
type B15Round = 1 | 2;
type B15Module = (typeof CALIBRATION_MODULES)[number];
type B15Route = (typeof CALIBRATION_ROUTES)[number];
type B15Source = "model" | "fallback";
type B15ModelStatus = (typeof MODEL_STATUSES)[number];
type B15FinishReason = (typeof FINISH_REASONS)[number];
type B15ValidationStage = (typeof VALIDATION_STAGES)[number];
type B15HttpErrorBoundaryCategory =
  (typeof HTTP_ERROR_BOUNDARY_CATEGORIES)[number];
type B15TransportOutcome =
  | "success"
  | "rate-limited"
  | "http-error"
  | "network-error"
  | "client-timeout"
  | "invalid-response"
  | "protection-blocked";
type B15StopReason = "complete" | "module-gate" | "infrastructure";
type B15InfrastructureIssueCode = (typeof INFRASTRUCTURE_ISSUE_CODES)[number];

class B15RuntimeTelemetryFailure extends Error {
  readonly issue: B15InfrastructureIssueCode;

  constructor(issue: B15InfrastructureIssueCode) {
    super(issue);
    this.name = "B15RuntimeTelemetryFailure";
    this.issue = issue;
  }
}

export type B15ResultClassification = "PASS" | "BLOCKED" | "INCONCLUSIVE";

export interface B15Arguments {
  corpusPath: string;
}

export interface B15Environment {
  baseUrl: string;
  projectId: string;
  teamId: string;
  expectedBranch: string;
  expectedSha: string;
  bypassSecret: string;
  vercelToken: string;
}

export interface B15TransportRequest {
  route: "/api/analysis-session" | B15Route;
  method: "GET" | "POST";
  body?: unknown;
  clientId?: string;
  analysisToken?: string;
  expectModelSource: boolean;
}

export interface B15TransportResult {
  route: B15TransportRequest["route"];
  outcome: B15TransportOutcome;
  httpStatus: number | null;
  requestId: string | null;
  source: B15Source | null;
  latencyMs: number;
  payload: unknown;
  responseContentType?: string | null;
  responseLength?: number | null;
  xRequestId?: string | null;
  serverTiming?: string | null;
  errorBoundaryCategory?: B15HttpErrorBoundaryCategory | null;
}

export interface B15CalibrationTransport {
  request(input: B15TransportRequest): Promise<B15TransportResult>;
}

export interface B15InternalCall {
  round: B15Round;
  module: B15Module;
  route: B15Route;
  outcome: B15TransportOutcome;
  httpStatus: number | null;
  requestId: string | null;
  source: B15Source | null;
  requestLatencyMs: number;
  responseContentType: string | null;
  xRequestId: string | null;
  serverTiming: string | null;
  errorBoundaryCategory: B15HttpErrorBoundaryCategory | null;
  evidenceChecks: number;
  evidencePasses: number;
  runtimeLogStatus: B1RuntimeLogStatus;
  runtimeHttpStatus: number | null;
  runtimeSource: B15Source | null;
  modelStatus: B15ModelStatus | null;
  modelLatencyMs: number | null;
  providerRequestStartAt: number | null;
  firstByteAt: number | null;
  firstTokenAt: number | null;
  responseCompletedAt: number | null;
  abortedAt: number | null;
  streamDurationMs: number | null;
  contentPresent: boolean | null;
  contentLength: number | null;
  validationStage: B15ValidationStage | null;
  validationFieldPaths: string[];
  validationFailureClassification: string | null;
  responseLength: number | null;
  trimmedLength: number | null;
  firstCharType: JsonBoundaryCharacterType | null;
  lastCharType: JsonBoundaryCharacterType | null;
  startsWithCodeFence: boolean | null;
  endsWithCodeFence: boolean | null;
  parserErrorName: JsonParserErrorName | null;
  parserErrorPosition: number | null;
  jsonErrorCategory: JsonErrorCategory | null;
  containsMultipleTopLevelValues: boolean | null;
  hasLeadingNonWhitespaceText: boolean | null;
  hasTrailingNonWhitespaceText: boolean | null;
  finishReason: B15FinishReason | null;
  promptTokens: number | null;
  completionTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
}

interface B15Session {
  article: B1CorpusArticle;
  round: B15Round;
  clientId: string;
  token: string;
  diagnostics: unknown[];
}

export interface B15AdviceEvidenceReference {
  paragraphId: string;
  quoteStart: number;
  quoteLength: number;
  quoteDigest: string;
}

export interface B15AdviceDiagnosticRecord {
  questionReference: {
    index: number;
    digest: string;
  };
  answerability: DiagnosticResult["answerability"];
  riskLevel: DiagnosticResult["riskLevel"];
  evidenceReferences: B15AdviceEvidenceReference[];
  missingInfo: string[];
  recommendation: string;
  source: "model";
  evidenceStatus: DiagnosticResult["evidenceStatus"];
}

export interface B15AdviceDiagnosticsSession {
  articleId: string;
  round: B15Round;
  diagnostics: B15AdviceDiagnosticRecord[];
}

export interface B15AdviceDiagnosticsArtifact {
  adviceDiagnosticsSchemaVersion: typeof B15_ADVICE_DIAGNOSTICS_SCHEMA_VERSION;
  corpusSha256: typeof B15_REQUIRED_CORPUS_SHA256;
  metrics: {
    sessions: number;
    diagnostics: number;
    evidenceReferences: number;
    missingInfoItems: number;
    recommendationCharacters: number;
    answerability: Record<DiagnosticResult["answerability"], number>;
    riskLevel: Record<DiagnosticResult["riskLevel"], number>;
    evidenceStatus: Record<DiagnosticResult["evidenceStatus"], number>;
  };
  sessions: B15AdviceDiagnosticsSession[];
}

export interface B15AdviceDiagnosticsSourceSession {
  article: B1CorpusArticle;
  round: B15Round;
  diagnostics: unknown[];
}

export interface B15RehydratedAdviceSession {
  article: B1CorpusArticle;
  round: B15Round;
  diagnostics: DiagnosticResult[];
}

interface B15AdviceDiagnosticContext {
  article: B1CorpusArticle;
  questionIndex: number;
  questions: string[];
  paragraphs: B1Paragraph[];
  evidenceReferences: B15AdviceEvidenceReference[];
}

const B15_ADVICE_EVIDENCE_REFERENCE_SCHEMA: z.ZodType<B15AdviceEvidenceReference> =
  z.object({
    paragraphId: z.string().regex(/^Para-\d+$/),
    quoteStart: z.number().int().nonnegative(),
    quoteLength: z.number().int().positive(),
    quoteDigest: z.string().regex(/^[0-9a-f]{64}$/),
  }).strict();

const B15_ADVICE_DIAGNOSTIC_RECORD_SCHEMA: z.ZodType<B15AdviceDiagnosticRecord> =
  z.object({
    questionReference: z.object({
      index: z.number().int().min(0).max(2),
      digest: z.string().regex(/^[0-9a-f]{64}$/),
    }).strict(),
    answerability: z.enum(ADVICE_ANSWERABILITY_VALUES),
    riskLevel: z.enum(ADVICE_RISK_LEVEL_VALUES),
    evidenceReferences: z.array(B15_ADVICE_EVIDENCE_REFERENCE_SCHEMA).max(3),
    missingInfo: z.array(z.string()),
    recommendation: z.string(),
    source: z.literal("model"),
    evidenceStatus: z.enum(ADVICE_EVIDENCE_STATUS_VALUES),
  }).strict();

const B15_ADVICE_DIAGNOSTICS_ARTIFACT_SCHEMA: z.ZodType<B15AdviceDiagnosticsArtifact> =
  z.object({
    adviceDiagnosticsSchemaVersion: z.literal(B15_ADVICE_DIAGNOSTICS_SCHEMA_VERSION),
    corpusSha256: z.literal(B15_REQUIRED_CORPUS_SHA256),
    metrics: z.object({
      sessions: z.number().int().nonnegative(),
      diagnostics: z.number().int().nonnegative(),
      evidenceReferences: z.number().int().nonnegative(),
      missingInfoItems: z.number().int().nonnegative(),
      recommendationCharacters: z.number().int().nonnegative(),
      answerability: z.object({
        "可以完全回答": z.number().int().nonnegative(),
        "信息不足": z.number().int().nonnegative(),
        "有风险": z.number().int().nonnegative(),
      }).strict(),
      riskLevel: z.object({
        low: z.number().int().nonnegative(),
        medium: z.number().int().nonnegative(),
        high: z.number().int().nonnegative(),
      }).strict(),
      evidenceStatus: z.object({
        valid: z.number().int().nonnegative(),
        missing: z.number().int().nonnegative(),
        invalid: z.number().int().nonnegative(),
      }).strict(),
    }).strict(),
    sessions: z.array(
      z.object({
        articleId: z.string().min(1),
        round: z.union([z.literal(1), z.literal(2)]),
        diagnostics: z.array(B15_ADVICE_DIAGNOSTIC_RECORD_SCHEMA).length(3),
      }).strict(),
    ).length(ADVICE_DIAGNOSTICS_EXPECTED_SESSIONS),
  }).strict();

export interface B15FlowResult {
  calls: B15InternalCall[];
  stopReason: B15StopReason;
  infrastructureIssues: string[];
}

export interface B15ModuleGateResult {
  evaluated: boolean;
  pass: boolean;
  expected: number;
  completed: number;
  sourceModel: number;
  schemaValid: number | null;
  invalidOutput: number;
  timeout: number;
  requiredFieldMissing: number;
  recommendationMissing: number;
  quoteMismatch: number;
  evidenceLiteral: boolean;
}

export interface B15RoundGateResult {
  round: B15Round;
  pass: boolean;
  expected: 70;
  sourceModel: number;
  invalidOutput: number;
  timeout: number;
  evidenceLiteral: boolean;
}

export interface B15GateEvaluationInput {
  executionComplete: boolean;
  runtimeTelemetryComplete: boolean;
  infrastructureFailure: boolean;
  artifactIntegrityValid: boolean;
  confirmedGateFailure: boolean;
  moduleGatePass: boolean;
  overallGatePass: boolean;
}

export interface B15ArtifactRecord {
  requestId: string | null;
  route: B15Route;
  httpStatus: number | null;
  responseContentType: string | null;
  xRequestId: string | null;
  serverTiming: string | null;
  errorBoundaryCategory: B15HttpErrorBoundaryCategory | null;
  modelStatus: B15ModelStatus | null;
  latencyMs: number | null;
  timeout: boolean;
  validationStage: B15ValidationStage | null;
  validationFieldPaths: string[];
  responseLength: number | null;
  trimmedLength: number | null;
  firstCharType: JsonBoundaryCharacterType | null;
  lastCharType: JsonBoundaryCharacterType | null;
  startsWithCodeFence: boolean | null;
  endsWithCodeFence: boolean | null;
  parserErrorName: JsonParserErrorName | null;
  parserErrorPosition: number | null;
  jsonErrorCategory: JsonErrorCategory | null;
  containsMultipleTopLevelValues: boolean | null;
  hasLeadingNonWhitespaceText: boolean | null;
  hasTrailingNonWhitespaceText: boolean | null;
  providerRequestStartAt: number | null;
  firstByteAt: number | null;
  firstTokenAt: number | null;
  responseCompletedAt: number | null;
  abortedAt: number | null;
  streamDurationMs: number | null;
  contentPresent: boolean | null;
  contentLength: number | null;
  finishReason: B15FinishReason | null;
  promptTokens: number | null;
  completionTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
}

export interface B15CalibrationArtifact {
  calibrationSchemaVersion: typeof B15_CALIBRATION_SCHEMA_VERSION;
  result: B15ResultClassification;
  resultMessage: string;
  execution: {
    expectedModelRequests: number;
    completedModelRequests: number;
    stopReason: B15StopReason;
    infrastructureIssues: string[];
  };
  modules: {
    diagnose: { round1: B15ModuleGateResult; round2: B15ModuleGateResult };
    scoring: { round1: B15ModuleGateResult; round2: B15ModuleGateResult };
    advice: B15ModuleGateResult;
    contentDraft: B15ModuleGateResult;
  };
  overall: { round1: B15RoundGateResult; round2: B15RoundGateResult };
  runtimeLogStatus: Record<B1RuntimeLogStatus, number>;
  runtimeLogCollectorState: B1RuntimeLogCollectorState;
  evidenceLiteralAccuracy: { checks: number; passes: number; rate: number | null };
  records: B15ArtifactRecord[];
}

interface B15FlowOptions {
  articles: B1CorpusArticle[];
  transport: B15CalibrationTransport;
  runtimeLogCollector: B1RuntimeLogCollector;
  wait?: (milliseconds: number) => Promise<void>;
  onAdviceDiagnosticsArtifact?: (
    artifact: B15AdviceDiagnosticsArtifact,
  ) => Promise<void>;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOneOf<T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === "string" && values.includes(value as T[number]);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function requiredEnvironmentValue(
  environment: NodeJS.ProcessEnv,
  name: string,
): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required for B.1.5 Calibration.`);
  return value;
}

function requiredHeaderSecret(
  environment: NodeJS.ProcessEnv,
  name: string,
): string {
  const value = requiredEnvironmentValue(environment, name);
  if (!/^[\x21-\x7e]+$/.test(value)) {
    throw new Error(`${name} must be a non-empty ASCII header value.`);
  }
  return value;
}

export function assertB15NodeVersion(version = process.version): void {
  if (version !== B15_REQUIRED_NODE_VERSION) {
    throw new Error(`B.1.5 Calibration requires Node ${B15_REQUIRED_NODE_VERSION}.`);
  }
}

export function parseB15Arguments(argv: string[]): B15Arguments {
  if (argv.length !== 1 || !argv[0].startsWith("--corpus=")) {
    throw new Error("B.1.5 Calibration accepts exactly one --corpus argument.");
  }
  const corpusPath = argv[0].slice("--corpus=".length).trim();
  if (!corpusPath) throw new Error("--corpus must not be empty.");
  return { corpusPath };
}

export function resolveB15Environment(
  environment: NodeJS.ProcessEnv = process.env,
): B15Environment {
  const baseUrlValue = requiredEnvironmentValue(environment, "GEO_BASE_URL");
  const baseUrl = normalizePreviewUrl(baseUrlValue);
  const projectId = requiredEnvironmentValue(environment, "VERCEL_PROJECT_ID");
  const teamId = requiredEnvironmentValue(environment, "VERCEL_ORG_ID");
  const expectedBranch = requiredEnvironmentValue(environment, "EXPECTED_BRANCH");
  const expectedSha = requiredEnvironmentValue(environment, "EXPECTED_SHA").toLowerCase();
  const bypassSecret = resolveAutomationBypassSecret(baseUrl, environment);
  const vercelToken = requiredHeaderSecret(environment, "VERCEL_TOKEN");

  if (!bypassSecret || !/^[\x21-\x7e]+$/.test(bypassSecret)) {
    throw new Error(
      "VERCEL_AUTOMATION_BYPASS_SECRET is required as an ASCII header value.",
    );
  }
  if (expectedBranch !== B15_EXPECTED_BRANCH) {
    throw new Error("EXPECTED_BRANCH does not match the B.1.5 calibration branch.");
  }
  if (!/^[0-9a-f]{40}$/.test(expectedSha)) {
    throw new Error("EXPECTED_SHA must be a full 40-character Git commit SHA.");
  }
  if (!/^prj_[A-Za-z0-9]+$/.test(projectId)) {
    throw new Error("VERCEL_PROJECT_ID is invalid.");
  }
  if (!/^team_[A-Za-z0-9]+$/.test(teamId)) {
    throw new Error("VERCEL_ORG_ID is invalid.");
  }

  return {
    baseUrl,
    projectId,
    teamId,
    expectedBranch,
    expectedSha,
    bypassSecret,
    vercelToken,
  };
}

export function createB15RunId(
  now = new Date(),
  randomId = randomBytes(6).toString("hex"),
): string {
  if (!/^[0-9a-f]{12}$/.test(randomId)) {
    throw new Error("B.1.5 run ID entropy must be 12 lowercase hexadecimal characters.");
  }
  return `${now.toISOString().replace(/[:.]/g, "-")}-${randomId}`;
}

export function resolveB15CalibrationDirectory(cwd: string, runId: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[0-9a-f]{12}$/.test(runId)) {
    throw new Error("B.1.5 run ID is invalid.");
  }
  const root = resolve(cwd, ...CALIBRATION_ROOT_SEGMENTS);
  const directory = resolve(root, runId);
  const pathFromRoot = relative(root, directory);
  if (!pathFromRoot || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot)) {
    throw new Error("B.1.5 output must remain inside outputs/b1/calibration.");
  }
  const stageOneRoot = resolve(cwd, "outputs", "b1", "stage1");
  const stageOneRelative = relative(stageOneRoot, directory);
  if (!stageOneRelative || (!stageOneRelative.startsWith(`..${sep}`) && !isAbsolute(stageOneRelative))) {
    throw new Error("B.1.5 output must not target outputs/b1/stage1.");
  }
  return directory;
}

export async function createB15CalibrationDirectory(
  cwd: string,
  runId: string,
): Promise<string> {
  const root = resolve(cwd, ...CALIBRATION_ROOT_SEGMENTS);
  const directory = resolveB15CalibrationDirectory(cwd, runId);
  await mkdir(root, { recursive: true });
  await mkdir(directory, { recursive: false });
  return directory;
}

export function b15QuestionTemplates(title: string): string[] {
  return [
    `${title}主要解决什么问题？`,
    `文章针对${title}给出了哪些具体方法或步骤？`,
    `这些建议适合哪些读者或使用场景？`,
    `文章中的关键结论有哪些事实、案例或来源支持？`,
    `文章是否说明了限制条件、风险和时效范围？`,
  ];
}

export function selectB15DiagnosticQuestions(
  title: string,
  articleIndex: number,
): string[] {
  const questions = b15QuestionTemplates(title);
  return [0, 1, 2].map(
    (offset) => questions[(articleIndex + offset) % questions.length],
  );
}

function adviceReferenceValues(
  context: B15AdviceDiagnosticContext,
): Array<{ token: string; value: string }> {
  const paragraphMap = new Map(context.paragraphs.map((paragraph) => [paragraph.id, paragraph.text]));
  const references = [
    { token: `${ADVICE_DIAGNOSTIC_REFERENCE_PREFIX}TITLE}}`, value: context.article.title },
    ...context.questions.map((question, index) => ({
      token: `${ADVICE_DIAGNOSTIC_REFERENCE_PREFIX}QUESTION_${index}}}`,
      value: question,
    })),
    ...context.evidenceReferences.map((reference, index) => {
      const paragraph = paragraphMap.get(reference.paragraphId);
      const value = paragraph?.slice(
        reference.quoteStart,
        reference.quoteStart + reference.quoteLength,
      ) ?? "";
      if (!value || sha256(value) !== reference.quoteDigest) {
        throw new Error("B.1.5 Advice diagnostic evidence reference is invalid.");
      }
      return {
        token: `${ADVICE_DIAGNOSTIC_REFERENCE_PREFIX}EVIDENCE_${index}}}`,
        value,
      };
    }),
  ];
  if (
    references.some(
      (reference) =>
        !reference.value ||
        reference.value.includes(ADVICE_DIAGNOSTIC_REFERENCE_PREFIX),
    )
  ) {
    throw new Error("B.1.5 Advice diagnostic reference source is invalid.");
  }
  return references.sort((left, right) => right.value.length - left.value.length);
}

function redactAdviceDiagnosticText(
  value: string,
  context: B15AdviceDiagnosticContext,
): string {
  if (value.includes(ADVICE_DIAGNOSTIC_REFERENCE_PREFIX)) {
    throw new Error("B.1.5 Advice diagnostic text contains a reserved reference token.");
  }
  const references = adviceReferenceValues(context);
  let cursor = 0;
  let redacted = "";
  while (cursor < value.length) {
    const match = references.find((reference) => value.startsWith(reference.value, cursor));
    if (!match) {
      redacted += value[cursor];
      cursor += 1;
      continue;
    }
    redacted += match.token;
    cursor += match.value.length;
  }
  return redacted;
}

function rehydrateAdviceDiagnosticText(
  value: string,
  context: B15AdviceDiagnosticContext,
): string {
  const references = new Map(
    adviceReferenceValues(context).map((reference) => [reference.token, reference.value]),
  );
  const pattern = new RegExp(ADVICE_DIAGNOSTIC_REFERENCE_PATTERN_SOURCE, "g");
  const rehydrated = value.replace(pattern, (token) => {
    const resolved = references.get(token);
    if (!resolved) {
      throw new Error("B.1.5 Advice diagnostic text reference is invalid.");
    }
    return resolved;
  });
  if (rehydrated.includes(ADVICE_DIAGNOSTIC_REFERENCE_PREFIX)) {
    throw new Error("B.1.5 Advice diagnostic text contains an invalid reference token.");
  }
  return rehydrated;
}

function buildAdviceEvidenceReferences(
  diagnostic: DiagnosticResult,
  paragraphs: B1Paragraph[],
): B15AdviceEvidenceReference[] {
  const paragraphMap = new Map(paragraphs.map((paragraph) => [paragraph.id, paragraph.text]));
  return diagnostic.evidence.map((evidence) => {
    const paragraph = paragraphMap.get(evidence.paragraphId);
    const quoteStart = paragraph?.indexOf(evidence.quote) ?? -1;
    if (!paragraph || quoteStart < 0) {
      throw new Error("B.1.5 Advice diagnostic evidence reference is invalid.");
    }
    return {
      paragraphId: evidence.paragraphId,
      quoteStart,
      quoteLength: evidence.quote.length,
      quoteDigest: sha256(evidence.quote),
    };
  });
}

function emptyAdviceDiagnosticsMetrics(): B15AdviceDiagnosticsArtifact["metrics"] {
  return {
    sessions: 0,
    diagnostics: 0,
    evidenceReferences: 0,
    missingInfoItems: 0,
    recommendationCharacters: 0,
    answerability: {
      "可以完全回答": 0,
      "信息不足": 0,
      "有风险": 0,
    },
    riskLevel: { low: 0, medium: 0, high: 0 },
    evidenceStatus: { valid: 0, missing: 0, invalid: 0 },
  };
}

function incrementAdviceDiagnosticsMetrics(
  metrics: B15AdviceDiagnosticsArtifact["metrics"],
  diagnostic: DiagnosticResult,
): void {
  metrics.diagnostics += 1;
  metrics.evidenceReferences += diagnostic.evidence.length;
  metrics.missingInfoItems += diagnostic.missingInfo.length;
  metrics.recommendationCharacters += diagnostic.recommendation.length;
  metrics.answerability[diagnostic.answerability] += 1;
  metrics.riskLevel[diagnostic.riskLevel] += 1;
  metrics.evidenceStatus[diagnostic.evidenceStatus] += 1;
}

function sameB15CorpusArticle(left: B1CorpusArticle, right: B1CorpusArticle): boolean {
  return (
    left.id === right.id &&
    left.sourceIndex === right.sourceIndex &&
    left.category === right.category &&
    left.quality === right.quality &&
    left.length === right.length &&
    left.permission === right.permission &&
    left.title === right.title &&
    left.content === right.content &&
    left.publishedAt === right.publishedAt
  );
}

function orderedAdviceSourceSessions(
  sourceSessions: readonly B15AdviceDiagnosticsSourceSession[],
): B15AdviceDiagnosticsSourceSession[] {
  if (sourceSessions.length !== ADVICE_DIAGNOSTICS_EXPECTED_SESSIONS) {
    throw new Error("B.1.5 Advice diagnostics require exactly 20 sessions.");
  }
  const articlesById = new Map<string, B1CorpusArticle>();
  const sessionsByKey = new Map<string, B15AdviceDiagnosticsSourceSession>();
  for (const session of sourceSessions) {
    const previousArticle = articlesById.get(session.article.id);
    if (previousArticle && !sameB15CorpusArticle(previousArticle, session.article)) {
      throw new Error("B.1.5 Advice diagnostics contain inconsistent corpus metadata.");
    }
    articlesById.set(session.article.id, session.article);
    const key = `${session.article.id}\n${session.round}`;
    if (sessionsByKey.has(key)) {
      throw new Error("B.1.5 Advice diagnostics contain a duplicate session.");
    }
    sessionsByKey.set(key, session);
  }
  const articles = [...articlesById.values()].sort(
    (left, right) => left.sourceIndex - right.sourceIndex,
  );
  if (
    articles.length !== 10 ||
    articles.some((article, index) => article.sourceIndex !== index)
  ) {
    throw new Error("B.1.5 Advice diagnostics corpus ordering is invalid.");
  }
  const ordered: B15AdviceDiagnosticsSourceSession[] = [];
  for (const round of [1, 2] as const) {
    for (const article of articles) {
      const session = sessionsByKey.get(`${article.id}\n${round}`);
      if (!session) {
        throw new Error("B.1.5 Advice diagnostics are missing a corpus session.");
      }
      ordered.push(session);
    }
  }
  return ordered;
}

export function buildB15AdviceDiagnosticsArtifact(
  sourceSessions: readonly B15AdviceDiagnosticsSourceSession[],
): B15AdviceDiagnosticsArtifact {
  const orderedSessions = orderedAdviceSourceSessions(sourceSessions);
  const metrics = emptyAdviceDiagnosticsMetrics();
  const sessions = orderedSessions.map((session) => {
    if (session.diagnostics.length !== 3) {
      throw new Error("B.1.5 Advice diagnostics require three records per session.");
    }
    const questions = selectB15DiagnosticQuestions(
      session.article.title,
      session.article.sourceIndex,
    );
    const paragraphs = createNumberedParagraphs(session.article.content);
    const diagnostics = session.diagnostics.map((value, questionIndex) => {
      const parsed = B15_ADVICE_DIAGNOSTIC_SCHEMA.safeParse(value);
      if (!parsed.success || parsed.data.source !== "model") {
        throw new Error("B.1.5 Advice diagnostics contain an invalid model record.");
      }
      const diagnostic = parsed.data;
      const expectedQuestion = questions[questionIndex];
      if (!expectedQuestion || diagnostic.question !== expectedQuestion) {
        throw new Error("B.1.5 Advice diagnostic question lineage is invalid.");
      }
      const evidenceReferences = buildAdviceEvidenceReferences(diagnostic, paragraphs);
      const context: B15AdviceDiagnosticContext = {
        article: session.article,
        questionIndex,
        questions,
        paragraphs,
        evidenceReferences,
      };
      incrementAdviceDiagnosticsMetrics(metrics, diagnostic);
      return {
        questionReference: {
          index: questionIndex,
          digest: sha256(expectedQuestion),
        },
        answerability: diagnostic.answerability,
        riskLevel: diagnostic.riskLevel,
        evidenceReferences,
        missingInfo: diagnostic.missingInfo.map((item) =>
          redactAdviceDiagnosticText(item, context)
        ),
        recommendation: redactAdviceDiagnosticText(diagnostic.recommendation, context),
        source: "model" as const,
        evidenceStatus: diagnostic.evidenceStatus,
      };
    });
    return { articleId: session.article.id, round: session.round, diagnostics };
  });
  metrics.sessions = sessions.length;
  if (metrics.diagnostics !== ADVICE_DIAGNOSTICS_EXPECTED_RECORDS) {
    throw new Error("B.1.5 Advice diagnostics require exactly 60 records.");
  }
  return {
    adviceDiagnosticsSchemaVersion: B15_ADVICE_DIAGNOSTICS_SCHEMA_VERSION,
    corpusSha256: B15_REQUIRED_CORPUS_SHA256,
    metrics,
    sessions,
  };
}

function parseB15AdviceDiagnosticsArtifact(
  value: unknown,
): B15AdviceDiagnosticsArtifact {
  const parsed = B15_ADVICE_DIAGNOSTICS_ARTIFACT_SCHEMA.safeParse(value);
  if (!parsed.success) {
    throw new Error("B.1.5 Advice diagnostics artifact is invalid.");
  }
  assertAllowedArtifactShape(parsed.data);
  return parsed.data;
}

function rehydrateAdviceEvidence(
  references: B15AdviceEvidenceReference[],
  paragraphs: B1Paragraph[],
): DiagnosticResult["evidence"] {
  const paragraphMap = new Map(paragraphs.map((paragraph) => [paragraph.id, paragraph.text]));
  return references.map((reference) => {
    const paragraph = paragraphMap.get(reference.paragraphId);
    if (
      !paragraph ||
      reference.quoteStart + reference.quoteLength > paragraph.length
    ) {
      throw new Error("B.1.5 Advice evidence reference is out of bounds.");
    }
    const quote = paragraph.slice(
      reference.quoteStart,
      reference.quoteStart + reference.quoteLength,
    );
    if (sha256(quote) !== reference.quoteDigest) {
      throw new Error("B.1.5 Advice evidence reference digest mismatch.");
    }
    return { paragraphId: reference.paragraphId, quote };
  });
}

export function rehydrateB15AdviceDiagnosticsArtifact(
  artifact: unknown,
  articles: readonly B1CorpusArticle[],
): B15RehydratedAdviceSession[] {
  const parsedArtifact = parseB15AdviceDiagnosticsArtifact(artifact);
  const articlesById = new Map(articles.map((article) => [article.id, article]));
  const orderedArticles = [...articles].sort(
    (left, right) => left.sourceIndex - right.sourceIndex,
  );
  if (
    articlesById.size !== 10 ||
    orderedArticles.length !== 10 ||
    orderedArticles.some((article, index) => article.sourceIndex !== index)
  ) {
    throw new Error("B.1.5 Advice diagnostics corpus is invalid.");
  }
  const metrics = emptyAdviceDiagnosticsMetrics();
  const rehydrated: B15RehydratedAdviceSession[] = [];
  let sessionIndex = 0;
  for (const round of [1, 2] as const) {
    for (const expectedArticle of orderedArticles) {
      const session = parsedArtifact.sessions[sessionIndex];
      sessionIndex += 1;
      if (
        !session ||
        session.articleId !== expectedArticle.id ||
        session.round !== round
      ) {
        throw new Error("B.1.5 Advice diagnostics session lineage is invalid.");
      }
      const article = articlesById.get(session.articleId);
      if (!article) {
        throw new Error("B.1.5 Advice diagnostics article reference is invalid.");
      }
      const questions = selectB15DiagnosticQuestions(article.title, article.sourceIndex);
      const paragraphs = createNumberedParagraphs(article.content);
      const diagnostics = session.diagnostics.map((record, diagnosticIndex) => {
        if (record.questionReference.index !== diagnosticIndex) {
          throw new Error("B.1.5 Advice diagnostic question ordering is invalid.");
        }
        const question = questions[record.questionReference.index];
        if (!question || sha256(question) !== record.questionReference.digest) {
          throw new Error("B.1.5 Advice diagnostic question digest mismatch.");
        }
        const context: B15AdviceDiagnosticContext = {
          article,
          questionIndex: record.questionReference.index,
          questions,
          paragraphs,
          evidenceReferences: record.evidenceReferences,
        };
        const missingInfo = record.missingInfo.map((item) => {
          const restored = rehydrateAdviceDiagnosticText(item, context);
          if (redactAdviceDiagnosticText(restored, context) !== item) {
            throw new Error("B.1.5 Advice diagnostic text reference is not canonical.");
          }
          return restored;
        });
        const recommendation = rehydrateAdviceDiagnosticText(record.recommendation, context);
        if (redactAdviceDiagnosticText(recommendation, context) !== record.recommendation) {
          throw new Error("B.1.5 Advice diagnostic recommendation is not canonical.");
        }
        const parsed = B15_ADVICE_DIAGNOSTIC_SCHEMA.safeParse({
          question,
          answerability: record.answerability,
          riskLevel: record.riskLevel,
          evidence: rehydrateAdviceEvidence(record.evidenceReferences, paragraphs),
          missingInfo,
          recommendation,
          source: record.source,
          evidenceStatus: record.evidenceStatus,
        });
        if (!parsed.success || parsed.data.source !== "model") {
          throw new Error("B.1.5 Advice diagnostic rehydration failed.");
        }
        incrementAdviceDiagnosticsMetrics(metrics, parsed.data);
        return parsed.data;
      });
      rehydrated.push({ article, round, diagnostics });
    }
  }
  metrics.sessions = rehydrated.length;
  if (JSON.stringify(metrics) !== JSON.stringify(parsedArtifact.metrics)) {
    throw new Error("B.1.5 Advice diagnostics metrics mismatch.");
  }
  return rehydrated;
}

function assertNoAdviceCorpusExcerpt(
  serialized: string,
  articles: readonly B1CorpusArticle[],
): void {
  const excerptSet = new Set<string>();
  for (const article of articles) {
    const questions = selectB15DiagnosticQuestions(article.title, article.sourceIndex);
    for (const exactValue of [article.title, ...questions]) {
      if (exactValue && serialized.includes(exactValue)) {
        throw new Error("B.1.5 Advice diagnostics artifact contains source text.");
      }
    }
    for (const paragraph of createNumberedParagraphs(article.content)) {
      for (
        let index = 0;
        index + ADVICE_DIAGNOSTIC_EXCERPT_LENGTH <= paragraph.text.length;
        index += 1
      ) {
        excerptSet.add(
          paragraph.text.slice(index, index + ADVICE_DIAGNOSTIC_EXCERPT_LENGTH),
        );
      }
    }
  }
  for (
    let index = 0;
    index + ADVICE_DIAGNOSTIC_EXCERPT_LENGTH <= serialized.length;
    index += 1
  ) {
    if (
      excerptSet.has(
        serialized.slice(index, index + ADVICE_DIAGNOSTIC_EXCERPT_LENGTH),
      )
    ) {
      throw new Error("B.1.5 Advice diagnostics artifact contains a corpus excerpt.");
    }
  }
}

export function serializeB15AdviceDiagnosticsArtifact(
  artifact: B15AdviceDiagnosticsArtifact,
  articles: readonly B1CorpusArticle[],
  sensitiveValues: readonly string[] = [],
): string {
  rehydrateB15AdviceDiagnosticsArtifact(artifact, articles);
  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  assertNoAdviceCorpusExcerpt(serialized, articles);
  for (const value of sensitiveValues) {
    if (value && serialized.includes(value)) {
      throw new Error("B.1.5 Advice diagnostics artifact redaction failed.");
    }
  }
  return serialized;
}

export async function writeB15AdviceDiagnosticsArtifactAtomic(
  directory: string,
  serialized: string,
): Promise<string> {
  const target = join(directory, "advice-diagnostics.json");
  const temporary = join(directory, `.advice-diagnostics.${randomUUID()}.tmp`);
  await writeFile(temporary, serialized, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  await rename(temporary, target);
  return target;
}

function evidenceSummary(
  payload: unknown,
  paragraphs: B1Paragraph[],
): { checks: number; passes: number } {
  if (!isRecord(payload) || !Array.isArray(payload.evidence)) {
    return { checks: 0, passes: 0 };
  }
  const paragraphMap = new Map(paragraphs.map((paragraph) => [paragraph.id, paragraph.text]));
  const checks = payload.evidence.length;
  const passes = payload.evidence.filter((item) => {
    if (!isRecord(item)) return false;
    return (
      typeof item.paragraphId === "string" &&
      typeof item.quote === "string" &&
      Boolean(paragraphMap.get(item.paragraphId)?.includes(item.quote))
    );
  }).length;
  return { checks, passes };
}

function contentDraftEvidenceSummary(
  payload: unknown,
  paragraphs: B1Paragraph[],
): { checks: number; passes: number } {
  if (!isRecord(payload) || !Array.isArray(payload.actions)) {
    return { checks: 0, passes: 0 };
  }
  const paragraphMap = new Map(paragraphs.map((paragraph) => [paragraph.id, paragraph.text]));
  let checks = 0;
  let passes = 0;
  for (const action of payload.actions) {
    if (!isRecord(action) || !isRecord(action.evidence)) continue;
    checks += 1;
    const paragraphId = action.evidence.paragraphId;
    const quote = action.evidence.quote;
    const valueMatches = action.type === "faq"
      ? action.answer === quote
      : action.type === "fact_card"
        ? action.value === quote
        : false;
    if (
      typeof paragraphId === "string" &&
      typeof quote === "string" &&
      paragraphMap.get(paragraphId)?.includes(quote) &&
      valueMatches
    ) {
      passes += 1;
    }
  }
  return { checks, passes };
}

function transportFailureIsInfrastructure(result: B15TransportResult): boolean {
  return result.outcome !== "success";
}

function b1CollectorRecord(call: B15InternalCall): B1CallRecord {
  const operation = call.module === "scoring"
    ? "scoring"
    : call.module === "diagnose"
      ? "diagnose_1"
      : call.module;
  return {
    operation,
    route: call.route,
    outcome: call.source ?? (call.outcome === "client-timeout" ? "timeout" : "network-error"),
    status: call.httpStatus,
    source: call.source,
    modelStatus: null,
    modelLatencyMs: null,
    durationMs: call.requestLatencyMs,
    requestId: call.requestId,
  };
}

function callFromTransport(
  result: B15TransportResult,
  round: B15Round,
  module: B15Module,
  evidence: { checks: number; passes: number } = { checks: 0, passes: 0 },
): B15InternalCall {
  if (!isOneOf(result.route, CALIBRATION_ROUTES)) {
    throw new Error("Calibration transport returned an unexpected route.");
  }
  return {
    round,
    module,
    route: result.route,
    outcome: result.outcome,
    httpStatus: result.httpStatus,
    requestId: result.requestId,
    source: result.source,
    requestLatencyMs: result.latencyMs,
    responseContentType:
      module === "diagnose" && result.outcome !== "success"
        ? result.responseContentType ?? null
        : null,
    xRequestId:
      module === "diagnose" && result.outcome !== "success"
        ? sanitizedXRequestId(result.xRequestId ?? result.requestId)
        : null,
    serverTiming:
      module === "diagnose" && result.outcome !== "success"
        ? result.serverTiming ?? null
        : null,
    errorBoundaryCategory:
      module === "diagnose" && result.outcome !== "success"
        ? result.errorBoundaryCategory ?? "E. unknown"
        : null,
    evidenceChecks: evidence.checks,
    evidencePasses: evidence.passes,
    runtimeLogStatus: result.requestId ? "collector-unavailable" : "not-applicable",
    runtimeHttpStatus: null,
    runtimeSource: null,
    modelStatus: null,
    modelLatencyMs: null,
    providerRequestStartAt: null,
    firstByteAt: null,
    firstTokenAt: null,
    responseCompletedAt: null,
    abortedAt: null,
    streamDurationMs: null,
    contentPresent: null,
    contentLength: null,
    validationStage: null,
    validationFieldPaths: [],
    validationFailureClassification: null,
    responseLength:
      module === "diagnose" && result.outcome !== "success"
        ? result.responseLength ?? null
        : null,
    trimmedLength: null,
    firstCharType: null,
    lastCharType: null,
    startsWithCodeFence: null,
    endsWithCodeFence: null,
    parserErrorName: null,
    parserErrorPosition: null,
    jsonErrorCategory: null,
    containsMultipleTopLevelValues: null,
    hasLeadingNonWhitespaceText: null,
    hasTrailingNonWhitespaceText: null,
    finishReason: null,
    promptTokens: null,
    completionTokens: null,
    reasoningTokens: null,
    totalTokens: null,
  };
}

function sourceModelCount(calls: B15InternalCall[]): number {
  return calls.filter((call) => call.source === "model").length;
}

export async function runB15CalibrationFlow({
  articles,
  transport,
  runtimeLogCollector,
  wait = (milliseconds) =>
    new Promise<void>((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
  onAdviceDiagnosticsArtifact,
}: B15FlowOptions): Promise<B15FlowResult> {
  if (articles.length !== 10) {
    throw new Error("B.1.5 Calibration requires exactly 10 corpus articles.");
  }

  const calls: B15InternalCall[] = [];
  const sessions: B15Session[] = [];
  const infrastructureIssues: string[] = [];

  const requireCollectorConnection = async (timeoutMs: number): Promise<void> => {
    const readiness = await runtimeLogCollector.waitForLiveConnection(timeoutMs);
    if (readiness === "connected") return;
    throw new B15RuntimeTelemetryFailure(
      readiness === "timeout" ? "runtime-log-not-ready" : "runtime-log-disconnected",
    );
  };
  const requireRuntimeRecord = async (call: B15InternalCall): Promise<void> => {
    const result = await runtimeLogCollector.waitForRecord(
      b1CollectorRecord(call),
      RUNTIME_LOG_RECORD_TIMEOUT_MS,
    );
    if (result === "matched") return;
    throw new B15RuntimeTelemetryFailure(
      result === "collector-unavailable"
        ? "runtime-log-disconnected"
        : "runtime-log-timeout",
    );
  };
  const invoke = async (
    session: B15Session,
    module: B15Module,
    body: unknown,
  ): Promise<B15TransportResult> => {
    const route: B15Route = module === "diagnose"
      ? "/api/qa-diagnostic"
      : module === "scoring"
      ? "/api/evaluate-scoring"
        : "/api/generate-patches";
    await wait(CALL_DELAY_MS);
    await requireCollectorConnection(0);
    const result = await transport.request({
      route,
      method: "POST",
      body,
      clientId: session.clientId,
      analysisToken: session.token,
      expectModelSource: true,
    });
    if (result.route !== route) {
      infrastructureIssues.push("transport-route-mismatch");
    }
    return result;
  };

  try {
    await requireCollectorConnection(RUNTIME_LOG_READINESS_TIMEOUT_MS);
  for (const round of [1, 2] as const) {
    const roundCalls: B15InternalCall[] = [];
    for (const article of articles) {
      const clientId = randomUUID();
      const sessionResult = await transport.request({
        route: "/api/analysis-session",
        method: "POST",
        body: {},
        clientId,
        expectModelSource: false,
      });
      if (
        transportFailureIsInfrastructure(sessionResult) ||
        !isRecord(sessionResult.payload) ||
        typeof sessionResult.payload.token !== "string" ||
        !sessionResult.payload.token
      ) {
        infrastructureIssues.push("analysis-session-unavailable");
        return { calls, stopReason: "infrastructure", infrastructureIssues };
      }
      const session: B15Session = {
        article,
        round,
        clientId,
        token: sessionResult.payload.token,
        diagnostics: [],
      };
      sessions.push(session);
      const paragraphs = createNumberedParagraphs(article.content);
      const questions = selectB15DiagnosticQuestions(article.title, article.sourceIndex);
      for (const question of questions) {
        const result = await invoke(session, "diagnose", {
          title: article.title,
          numbered_paragraphs: paragraphs,
          question,
        });
        const evidence = result.source === "model"
          ? evidenceSummary(result.payload, paragraphs)
          : { checks: 0, passes: 0 };
        const call = callFromTransport(result, round, "diagnose", evidence);
        calls.push(call);
        roundCalls.push(call);
        runtimeLogCollector.register(b1CollectorRecord(call));
        if (transportFailureIsInfrastructure(result)) {
          infrastructureIssues.push(result.outcome);
          return { calls, stopReason: "infrastructure", infrastructureIssues };
        }
        await requireRuntimeRecord(call);
        if (result.source === "model") session.diagnostics.push(result.payload);
      }
    }

    const evidenceLiteral = roundCalls.every(
      (call) => call.evidenceChecks === call.evidencePasses,
    );
    if (roundCalls.length !== 30 || sourceModelCount(roundCalls) !== 30 || !evidenceLiteral) {
      return { calls, stopReason: "module-gate", infrastructureIssues };
    }
  }

  if (onAdviceDiagnosticsArtifact) {
    try {
      await onAdviceDiagnosticsArtifact(
        buildB15AdviceDiagnosticsArtifact(
          sessions.map((session) => ({
            article: session.article,
            round: session.round,
            diagnostics: session.diagnostics,
          })),
        ),
      );
    } catch {
      infrastructureIssues.push("artifact-integrity-failure");
      return { calls, stopReason: "infrastructure", infrastructureIssues };
    }
  }

  for (const round of [1, 2] as const) {
    const roundSessions = sessions.filter((session) => session.round === round);
    const roundCalls: B15InternalCall[] = [];
    for (const session of roundSessions) {
      const article = session.article;
      const result = await invoke(session, "scoring", {
        title: article.title,
        content: article.content,
        publishedAt: article.publishedAt,
      });
      const call = callFromTransport(result, round, "scoring");
      calls.push(call);
      roundCalls.push(call);
      runtimeLogCollector.register(b1CollectorRecord(call));
      if (transportFailureIsInfrastructure(result)) {
        infrastructureIssues.push(result.outcome);
        return { calls, stopReason: "infrastructure", infrastructureIssues };
      }
      await requireRuntimeRecord(call);
    }
    if (roundCalls.length !== 10 || sourceModelCount(roundCalls) < 9) {
      return { calls, stopReason: "module-gate", infrastructureIssues };
    }
  }

  for (const session of sessions) {
    const clientId = randomUUID();
    const sessionResult = await transport.request({
      route: "/api/analysis-session",
      method: "POST",
      body: {},
      clientId,
      expectModelSource: false,
    });
    if (
      transportFailureIsInfrastructure(sessionResult) ||
      !isRecord(sessionResult.payload) ||
      typeof sessionResult.payload.token !== "string" ||
      !sessionResult.payload.token
    ) {
      infrastructureIssues.push("analysis-session-unavailable");
      return { calls, stopReason: "infrastructure", infrastructureIssues };
    }
    session.clientId = clientId;
    session.token = sessionResult.payload.token;
  }

  const adviceCalls: B15InternalCall[] = [];
  for (const session of sessions) {
    const article = session.article;
    const result = await invoke(session, "advice", {
      title: article.title,
      numbered_paragraphs: createNumberedParagraphs(article.content),
      diagnostics: session.diagnostics,
      mode: "advice",
    });
    const call = callFromTransport(result, session.round, "advice");
    calls.push(call);
    adviceCalls.push(call);
    runtimeLogCollector.register(b1CollectorRecord(call));
    if (transportFailureIsInfrastructure(result)) {
      infrastructureIssues.push(result.outcome);
      return { calls, stopReason: "infrastructure", infrastructureIssues };
    }
    await requireRuntimeRecord(call);
  }
  if (adviceCalls.length !== 20 || sourceModelCount(adviceCalls) < 18) {
    return { calls, stopReason: "module-gate", infrastructureIssues };
  }

  for (const session of sessions) {
    const article = session.article;
    const paragraphs = createNumberedParagraphs(article.content);
    const result = await invoke(session, "content_draft", {
      title: article.title,
      numbered_paragraphs: paragraphs,
      diagnostics: session.diagnostics,
      mode: "content_draft",
    });
    const evidence = result.source === "model"
      ? contentDraftEvidenceSummary(result.payload, paragraphs)
      : { checks: 0, passes: 0 };
    const call = callFromTransport(result, session.round, "content_draft", evidence);
    calls.push(call);
    runtimeLogCollector.register(b1CollectorRecord(call));
    if (transportFailureIsInfrastructure(result)) {
      infrastructureIssues.push(result.outcome);
      return { calls, stopReason: "infrastructure", infrastructureIssues };
    }
    await requireRuntimeRecord(call);
  }

  return { calls, stopReason: "complete", infrastructureIssues };
  } catch (error) {
    if (!(error instanceof B15RuntimeTelemetryFailure)) throw error;
    infrastructureIssues.push(error.issue);
    runtimeLogCollector.close();
    return { calls, stopReason: "infrastructure", infrastructureIssues };
  }
}

function runtimeLogKey(requestId: string, route: string): string {
  return `${requestId}\n${route}`;
}

function mergeRuntimeLogs(
  calls: B15InternalCall[],
  collection: B1RuntimeLogCollectionResult,
): B15InternalCall[] {
  return calls.map((call) => {
    if (!call.requestId) return call;
    const key = runtimeLogKey(call.requestId, call.route);
    const runtime = collection.records.get(key);
    const runtimeLogStatus = collection.statuses.get(key) ?? "collector-unavailable";
    if (!runtime || runtime.route !== call.route) {
      return { ...call, runtimeLogStatus };
    }
    return {
      ...call,
      runtimeLogStatus,
      runtimeHttpStatus: runtime.status,
      runtimeSource: runtime.source === "none" ? null : runtime.source,
      modelStatus: runtime.modelStatus,
      modelLatencyMs: runtime.modelLatencyMs,
      providerRequestStartAt: runtime.providerRequestStartAt ?? null,
      firstByteAt: runtime.firstByteAt ?? null,
      firstTokenAt: runtime.firstTokenAt ?? null,
      responseCompletedAt: runtime.responseCompletedAt ?? null,
      abortedAt: runtime.abortedAt ?? null,
      streamDurationMs: runtime.streamDurationMs ?? null,
      contentPresent: runtime.contentPresent ?? null,
      contentLength: runtime.contentLength ?? null,
      validationStage: runtime.validationStage,
      validationFieldPaths: runtime.validationFieldPaths,
      validationFailureClassification: runtime.validationFailureClassification,
      responseLength: runtime.responseLength ?? call.responseLength,
      trimmedLength: runtime.trimmedLength ?? null,
      firstCharType: runtime.firstCharType ?? null,
      lastCharType: runtime.lastCharType ?? null,
      startsWithCodeFence: runtime.startsWithCodeFence ?? null,
      endsWithCodeFence: runtime.endsWithCodeFence ?? null,
      parserErrorName: runtime.parserErrorName ?? null,
      parserErrorPosition: runtime.parserErrorPosition ?? null,
      jsonErrorCategory: runtime.jsonErrorCategory ?? null,
      containsMultipleTopLevelValues:
        runtime.containsMultipleTopLevelValues ?? null,
      hasLeadingNonWhitespaceText:
        runtime.hasLeadingNonWhitespaceText ?? null,
      hasTrailingNonWhitespaceText:
        runtime.hasTrailingNonWhitespaceText ?? null,
      finishReason: runtime.finishReason,
      promptTokens: runtime.promptTokens ?? null,
      completionTokens: runtime.completionTokens,
      reasoningTokens: runtime.reasoningTokens ?? null,
      totalTokens: runtime.totalTokens ?? null,
    };
  });
}

function callIsInvalidOutput(call: B15InternalCall): boolean {
  return (
    call.modelStatus === "invalid-output" ||
    (call.source === "fallback" && call.validationStage !== null)
  );
}

function callIsTimeout(call: B15InternalCall): boolean {
  return call.modelStatus === "timeout" || call.outcome === "client-timeout";
}

function moduleSummary(
  calls: B15InternalCall[],
  expected: number,
  minimumModel: number,
  module: B15Module,
): B15ModuleGateResult {
  const completed = calls.length;
  const sourceModel = sourceModelCount(calls);
  const invalidOutput = calls.filter(callIsInvalidOutput).length;
  const timeout = calls.filter(callIsTimeout).length;
  const requiredFieldMissing = calls.filter(
    (call) => call.validationFailureClassification === "required_field_missing",
  ).length;
  const recommendationMissing = calls.filter(
    (call) =>
      call.validationFailureClassification === "required_field_missing" &&
      call.validationFieldPaths.includes("$.recommendation"),
  ).length;
  const quoteMismatch = calls.filter(
    (call) => call.validationFailureClassification === "quote_mismatch",
  ).length;
  const evidenceLiteral =
    calls.every((call) => call.evidenceChecks === call.evidencePasses) &&
    quoteMismatch === 0;
  const schemaValid = module === "diagnose" ? sourceModel : null;
  const evaluated = completed === expected;
  const pass =
    evaluated &&
    sourceModel >= minimumModel &&
    invalidOutput <= (module === "diagnose" ? 0 : 1) &&
    timeout <= (module === "diagnose" ? 0 : 1) &&
    requiredFieldMissing === 0 &&
    recommendationMissing === 0 &&
    evidenceLiteral &&
    (module !== "diagnose" || schemaValid === expected) &&
    (module !== "content_draft" || quoteMismatch === 0);
  return {
    evaluated,
    pass,
    expected,
    completed,
    sourceModel,
    schemaValid,
    invalidOutput,
    timeout,
    requiredFieldMissing,
    recommendationMissing,
    quoteMismatch,
    evidenceLiteral,
  };
}

function roundOverallSummary(
  calls: B15InternalCall[],
  round: B15Round,
): B15RoundGateResult {
  const roundCalls = calls.filter((call) => call.round === round);
  const sourceModel = QUESTION_PREDICTION_BASELINE_PER_ROUND + sourceModelCount(roundCalls);
  const invalidOutput = roundCalls.filter(callIsInvalidOutput).length;
  const timeout = roundCalls.filter(callIsTimeout).length;
  const quoteMismatch = roundCalls.some(
    (call) => call.validationFailureClassification === "quote_mismatch",
  );
  const evidenceLiteral =
    roundCalls.every((call) => call.evidenceChecks === call.evidencePasses) &&
    !quoteMismatch;
  const completed = roundCalls.length === 60;
  return {
    round,
    pass:
      completed &&
      sourceModel >= 67 &&
      invalidOutput <= 1 &&
      timeout <= 1 &&
      evidenceLiteral,
    expected: 70,
    sourceModel,
    invalidOutput,
    timeout,
    evidenceLiteral,
  };
}

export function classifyB15Calibration(
  input: B15GateEvaluationInput,
): B15ResultClassification {
  if (
    input.infrastructureFailure ||
    !input.artifactIntegrityValid ||
    !input.runtimeTelemetryComplete
  ) {
    return "INCONCLUSIVE";
  }
  if (input.confirmedGateFailure || !input.moduleGatePass || !input.overallGatePass) {
    return "BLOCKED";
  }
  if (!input.executionComplete || !input.runtimeTelemetryComplete) {
    return "INCONCLUSIVE";
  }
  return "PASS";
}

export function b15ResultMessage(result: B15ResultClassification): string {
  if (result === "PASS") return "B.1.5 PASS，允许重新申请 Stage 1";
  if (result === "BLOCKED") return "B.1.5 BLOCKED，需要继续模型稳定化";
  return "B.1.5 INCONCLUSIVE，不允许重新申请 Stage 1";
}

function artifactRecord(call: B15InternalCall): B15ArtifactRecord {
  const requestId = normalizedRequestId(call.requestId);
  const latencyMs = call.modelLatencyMs ?? call.requestLatencyMs;
  return {
    requestId,
    route: call.route,
    httpStatus:
      call.module === "diagnose" && call.outcome !== "success"
        ? call.httpStatus
        : null,
    responseContentType: call.responseContentType,
    xRequestId: call.xRequestId,
    serverTiming: call.serverTiming,
    errorBoundaryCategory: call.errorBoundaryCategory,
    modelStatus: call.modelStatus,
    latencyMs: Number.isFinite(latencyMs) && latencyMs >= 0 ? Math.round(latencyMs) : null,
    timeout: callIsTimeout(call),
    validationStage: call.validationStage,
    validationFieldPaths: call.validationFieldPaths
      .filter(
        (path) =>
          path.length <= 160 &&
          /^\$(?:\.[A-Za-z_][A-Za-z0-9_]*|\[\d+\])*$/.test(path),
      )
      .slice(0, 20),
    responseLength: call.responseLength,
    trimmedLength: call.trimmedLength,
    firstCharType: call.firstCharType,
    lastCharType: call.lastCharType,
    startsWithCodeFence: call.startsWithCodeFence,
    endsWithCodeFence: call.endsWithCodeFence,
    parserErrorName: call.parserErrorName,
    parserErrorPosition: call.parserErrorPosition,
    jsonErrorCategory: call.jsonErrorCategory,
    containsMultipleTopLevelValues: call.containsMultipleTopLevelValues,
    hasLeadingNonWhitespaceText: call.hasLeadingNonWhitespaceText,
    hasTrailingNonWhitespaceText: call.hasTrailingNonWhitespaceText,
    providerRequestStartAt: call.providerRequestStartAt,
    firstByteAt: call.firstByteAt,
    firstTokenAt: call.firstTokenAt,
    responseCompletedAt: call.responseCompletedAt,
    abortedAt: call.abortedAt,
    streamDurationMs: call.streamDurationMs,
    contentPresent: call.contentPresent,
    contentLength: call.contentLength,
    finishReason: call.finishReason,
    promptTokens: call.promptTokens,
    completionTokens: call.completionTokens,
    reasoningTokens: call.reasoningTokens,
    totalTokens: call.totalTokens,
  };
}

function emptyRuntimeDistribution(): Record<B1RuntimeLogStatus, number> {
  return Object.fromEntries(
    RUNTIME_LOG_STATUSES.map((status) => [status, 0]),
  ) as Record<B1RuntimeLogStatus, number>;
}

export function buildB15CalibrationArtifact(
  flow: B15FlowResult,
  collection: B1RuntimeLogCollectionResult,
): B15CalibrationArtifact {
  const calls = mergeRuntimeLogs(flow.calls, collection);
  const diagnoseRound1 = moduleSummary(
    calls.filter((call) => call.module === "diagnose" && call.round === 1),
    30,
    30,
    "diagnose",
  );
  const diagnoseRound2 = moduleSummary(
    calls.filter((call) => call.module === "diagnose" && call.round === 2),
    30,
    30,
    "diagnose",
  );
  const scoringRound1 = moduleSummary(
    calls.filter((call) => call.module === "scoring" && call.round === 1),
    10,
    9,
    "scoring",
  );
  const scoringRound2 = moduleSummary(
    calls.filter((call) => call.module === "scoring" && call.round === 2),
    10,
    9,
    "scoring",
  );
  const advice = moduleSummary(
    calls.filter((call) => call.module === "advice"),
    20,
    18,
    "advice",
  );
  const contentDraft = moduleSummary(
    calls.filter((call) => call.module === "content_draft"),
    20,
    18,
    "content_draft",
  );
  const round1 = roundOverallSummary(calls, 1);
  const round2 = roundOverallSummary(calls, 2);
  const runtimeLogStatus = emptyRuntimeDistribution();
  for (const call of calls) runtimeLogStatus[call.runtimeLogStatus] += 1;
  const runtimeTelemetryComplete = calls.every(
    (call) =>
      call.requestId !== null &&
      call.runtimeLogStatus === "matched" &&
      call.modelStatus !== null &&
      call.runtimeHttpStatus === call.httpStatus &&
      call.runtimeSource === call.source &&
      !(
        call.source === "fallback" &&
        call.modelStatus === "success" &&
        call.validationStage === null
      ),
  ) &&
    collection.collectorState.collectorMode !== "unavailable" &&
    collection.collectorState.matchedCount === calls.length &&
    collection.collectorState.unmatchedCount === 0;
  const moduleGatePass =
    diagnoseRound1.pass &&
    diagnoseRound2.pass &&
    scoringRound1.pass &&
    scoringRound2.pass &&
    advice.pass &&
    contentDraft.pass &&
    contentDraft.quoteMismatch === 0;
  const overallGatePass = round1.pass && round2.pass;
  const evaluatedModuleFailure = [
    diagnoseRound1,
    diagnoseRound2,
    scoringRound1,
    scoringRound2,
    advice,
    contentDraft,
  ].some((module) => module.evaluated && !module.pass);
  const confirmedGateFailure =
    flow.stopReason === "module-gate" ||
    evaluatedModuleFailure ||
    contentDraft.quoteMismatch > 0 ||
    (flow.calls.length === B15_EXPECTED_MODEL_REQUESTS && !overallGatePass);
  const result = classifyB15Calibration({
    executionComplete:
      flow.stopReason === "complete" && calls.length === B15_EXPECTED_MODEL_REQUESTS,
    runtimeTelemetryComplete,
    infrastructureFailure:
      flow.stopReason === "infrastructure" || flow.infrastructureIssues.length > 0,
    artifactIntegrityValid: true,
    confirmedGateFailure,
    moduleGatePass,
    overallGatePass,
  });
  const evidenceChecks = calls.reduce((total, call) => total + call.evidenceChecks, 0);
  const evidencePasses = calls.reduce((total, call) => total + call.evidencePasses, 0);
  const infrastructureIssues = [...new Set(flow.infrastructureIssues)]
    .map((issue) =>
      isOneOf(issue, INFRASTRUCTURE_ISSUE_CODES)
        ? issue
        : "unknown-infrastructure-failure",
    )
    .sort();

  return {
    calibrationSchemaVersion: B15_CALIBRATION_SCHEMA_VERSION,
    result,
    resultMessage: b15ResultMessage(result),
    execution: {
      expectedModelRequests: B15_EXPECTED_MODEL_REQUESTS,
      completedModelRequests: calls.length,
      stopReason: flow.stopReason,
      infrastructureIssues,
    },
    modules: {
      diagnose: { round1: diagnoseRound1, round2: diagnoseRound2 },
      scoring: { round1: scoringRound1, round2: scoringRound2 },
      advice,
      contentDraft,
    },
    overall: { round1, round2 },
    runtimeLogStatus,
    runtimeLogCollectorState: collection.collectorState,
    evidenceLiteralAccuracy: {
      checks: evidenceChecks,
      passes: evidencePasses,
      rate: evidenceChecks ? Number((evidencePasses / evidenceChecks).toFixed(4)) : 1,
    },
    records: calls.map(artifactRecord),
  };
}

function assertAllowedArtifactShape(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertAllowedArtifactShape(item);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_ARTIFACT_KEYS.has(key)) {
      throw new Error("B.1.5 artifact contains a forbidden field.");
    }
    assertAllowedArtifactShape(child);
  }
}

export function serializeB15CalibrationArtifact(
  artifact: B15CalibrationArtifact,
  sensitiveValues: readonly string[] = [],
): string {
  if (artifact.calibrationSchemaVersion !== B15_CALIBRATION_SCHEMA_VERSION) {
    throw new Error("B.1.5 artifact schema version is invalid.");
  }
  for (const record of artifact.records) {
    const keys = Object.keys(record).sort();
    const expectedKeys = [...ARTIFACT_RECORD_KEYS].sort();
    if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
      throw new Error("B.1.5 artifact record contains an unapproved field.");
    }
  }
  assertAllowedArtifactShape(artifact);
  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  for (const value of sensitiveValues) {
    if (value && serialized.includes(value)) {
      throw new Error("B.1.5 artifact redaction validation failed.");
    }
  }
  return serialized;
}

async function writeArtifactAtomic(
  directory: string,
  serialized: string,
): Promise<void> {
  const target = join(directory, "calibration-report.json");
  const temporary = join(directory, `.calibration-report.${randomUUID()}.tmp`);
  await writeFile(temporary, serialized, { encoding: "utf8", flag: "wx" });
  await rename(temporary, target);
}

function normalizedRequestId(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    normalized,
  )
    ? normalized.toLowerCase()
    : null;
}

function sanitizedXRequestId(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim();
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(normalized)
    ? normalized
    : null;
}

function normalizedResponseContentType(value: string | null): string | null {
  if (!value) return null;
  const mediaType = value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return /^[a-z0-9!#$&^_.+-]{1,64}\/[a-z0-9!#$&^_.+-]{1,64}$/.test(mediaType)
    ? mediaType
    : null;
}

function sanitizedServerTiming(value: string | null): string | null {
  if (!value) return null;
  const allowedMetricNames = new Set([
    "app",
    "cdn",
    "compute",
    "edge",
    "function",
    "gateway",
    "origin",
    "proxy",
    "total",
    "vercel",
  ]);
  const metrics = value
    .split(",")
    .flatMap((entry, index) => {
      const [rawName, ...parameters] = entry.split(";");
      const rawNormalizedName = rawName?.trim().toLowerCase() ?? "";
      const name = allowedMetricNames.has(rawNormalizedName)
        ? rawNormalizedName
        : `other-${index + 1}`;
      const durationParameter = parameters
        .map((parameter) => parameter.trim())
        .find((parameter) => /^dur=\d+(?:\.\d{1,3})?$/.test(parameter));
      return [durationParameter ? `${name};${durationParameter}` : name];
    })
    .slice(0, 8);
  return metrics.length ? metrics.join(",") : null;
}

function publicErrorCode(responseText: string | null): string | null {
  if (!responseText || responseText.length > 65_536) return null;
  try {
    const payload: unknown = JSON.parse(responseText);
    return isRecord(payload) &&
        typeof payload.error === "string" &&
        /^[A-Z][A-Z0-9_]{0,63}$/.test(payload.error)
      ? payload.error
      : null;
  } catch {
    return null;
  }
}

function httpErrorBoundaryCategory(params: {
  outcome: B15TransportOutcome;
  httpStatus: number | null;
  xRequestId: string | null;
  errorCode: string | null;
  platformGatewaySignal: boolean;
}): B15HttpErrorBoundaryCategory | null {
  if (params.outcome === "network-error" || params.outcome === "client-timeout") {
    return "D. client/network error";
  }
  if (params.outcome === "success" || params.outcome === "invalid-response") {
    return null;
  }
  if (params.errorCode === "RATE_LIMITED") {
    return "B. upstream provider error";
  }
  if (
    params.outcome === "protection-blocked" ||
    params.platformGatewaySignal
  ) {
    return "C. platform gateway error";
  }
  if (normalizedRequestId(params.xRequestId) !== null) {
    return "A. route handler error";
  }
  if (params.httpStatus !== null && params.httpStatus >= 500) {
    return "C. platform gateway error";
  }
  return "E. unknown";
}

export function createB15FetchTransport(
  baseUrl: string,
  bypassSecret: string,
): B15CalibrationTransport {
  return {
    async request(input) {
      const startedAt = performance.now();
      const headers = new Headers();
      if (input.body !== undefined) headers.set("Content-Type", "application/json");
      if (input.clientId) headers.set("X-GEO-Client-ID", input.clientId);
      if (input.analysisToken) headers.set("X-GEO-Analysis-Token", input.analysisToken);
      try {
        const response = await fetch(
          `${baseUrl}${input.route}`,
          withAutomationBypassRequestInit(
            {
              method: input.method,
              headers,
              redirect: "manual",
              ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
              signal: AbortSignal.timeout(45_000),
            },
            bypassSecret,
          ),
        );
        const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));
        const xRequestId = sanitizedXRequestId(
          response.headers.get("x-request-id"),
        );
        const requestId = normalizedRequestId(xRequestId);
        const responseContentType = normalizedResponseContentType(
          response.headers.get("content-type"),
        );
        const serverTiming = sanitizedServerTiming(
          response.headers.get("server-timing"),
        );
        const protectionBlocked = isVercelDeploymentProtectionRedirect(
          response.status,
          response.headers.get("location"),
        );
        if (protectionBlocked || !response.ok) {
          const responseText = await response.text().catch(() => null);
          const errorCode = publicErrorCode(responseText);
          let payload: unknown = null;
          if (responseText !== null) {
            try {
              payload = JSON.parse(responseText);
            } catch {
              payload = null;
            }
          }
          const outcome: B15TransportOutcome = protectionBlocked
            ? "protection-blocked"
            : response.status === 429
              ? "rate-limited"
              : "http-error";
          return {
            route: input.route,
            outcome,
            httpStatus: response.status,
            requestId,
            source: null,
            latencyMs,
            responseContentType,
            responseLength: responseText?.length ?? null,
            xRequestId,
            serverTiming,
            errorBoundaryCategory: httpErrorBoundaryCategory({
              outcome,
              httpStatus: response.status,
              xRequestId,
              errorCode,
              platformGatewaySignal:
                response.headers.has("x-vercel-error"),
            }),
            payload,
          };
        }
        const payload = await response.json().catch(() => null);
        if (!isRecord(payload)) {
          return {
            route: input.route,
            outcome: "invalid-response",
            httpStatus: response.status,
            requestId,
            source: null,
            latencyMs,
            payload: null,
          };
        }
        const source = input.expectModelSource &&
            (payload.source === "model" || payload.source === "fallback")
          ? payload.source
          : null;
        if (input.expectModelSource && source === null) {
          return {
            route: input.route,
            outcome: "invalid-response",
            httpStatus: response.status,
            requestId,
            source: null,
            latencyMs,
            payload: null,
          };
        }
        return {
          route: input.route,
          outcome: "success",
          httpStatus: response.status,
          requestId,
          source,
          latencyMs,
          payload,
        };
      } catch (error) {
        return {
          route: input.route,
          outcome:
            error instanceof Error &&
              (error.name === "AbortError" || error.name === "TimeoutError")
              ? "client-timeout"
              : "network-error",
          httpStatus: null,
          requestId: null,
          source: null,
          latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
          responseContentType: null,
          responseLength: null,
          xRequestId: null,
          serverTiming: null,
          errorBoundaryCategory: httpErrorBoundaryCategory({
            outcome:
              error instanceof Error &&
                (error.name === "AbortError" || error.name === "TimeoutError")
                ? "client-timeout"
                : "network-error",
            httpStatus: null,
            xRequestId: null,
            errorCode: null,
            platformGatewaySignal: false,
          }),
          payload: null,
        };
      }
    },
  };
}

async function verifyB15Deployment(
  environment: B15Environment,
): Promise<B1RuntimeLogConfig> {
  const hostname = new URL(environment.baseUrl).hostname;
  const endpoint = new URL(
    `https://api.vercel.com/v13/deployments/${encodeURIComponent(hostname)}`,
  );
  endpoint.searchParams.set("teamId", environment.teamId);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${environment.vercelToken}`,
        "User-Agent": "geo-content-checker-b1.5-calibration",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error("B.1.5 deployment preflight failed.");
  }
  if (!response.ok) {
    throw new Error("B.1.5 deployment preflight failed.");
  }
  const metadata: unknown = await response.json().catch(() => null);
  if (!isRecord(metadata)) {
    throw new Error("B.1.5 deployment preflight failed.");
  }
  const summary = validatePreviewDeploymentMetadata(metadata, {
    previewUrl: environment.baseUrl,
    expectedSha: environment.expectedSha,
    expectedBranch: environment.expectedBranch,
    expectedProjectId: environment.projectId,
  });
  return {
    deploymentId: summary.deploymentId,
    projectId: environment.projectId,
    teamId: environment.teamId,
    token: environment.vercelToken,
  };
}

async function verifyB15Health(
  environment: B15Environment,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(
      `${environment.baseUrl}/api/health`,
      withAutomationBypassRequestInit(
        {
          method: "GET",
          redirect: "manual",
          signal: AbortSignal.timeout(15_000),
        },
        environment.bypassSecret,
      ),
    );
  } catch {
    throw new Error("B.1.5 Health preflight failed.");
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !isRecord(payload) || payload.status !== "ok" || !isRecord(payload.checks)) {
    throw new Error("B.1.5 Health preflight failed.");
  }
  for (const key of HEALTH_CHECK_KEYS) {
    if (payload.checks[key] !== true) {
      throw new Error("B.1.5 Health preflight failed.");
    }
  }
}

async function main(): Promise<void> {
  assertB15NodeVersion();
  const args = parseB15Arguments(process.argv.slice(2));
  const environment = resolveB15Environment();
  const corpusPath = resolve(args.corpusPath);
  const corpusRaw = await readFile(corpusPath, "utf8");
  if (sha256(corpusRaw) !== B15_REQUIRED_CORPUS_SHA256) {
    throw new Error("B.1.5 corpus SHA-256 does not match corpus-v1.");
  }
  const articles = validateB1Corpus(JSON.parse(corpusRaw));
  const transport = createB15FetchTransport(
    environment.baseUrl,
    environment.bypassSecret,
  );
  const runtimeConfig = await verifyB15Deployment(environment);
  const runtimeLogCollector = startB1RuntimeLogCollector(Promise.resolve(runtimeConfig));
  try {
    await verifyB15Health(environment);
    await requireB1RuntimeLogCollectorReady(runtimeLogCollector);
  } catch (error) {
    runtimeLogCollector.close();
    throw error;
  }

  const runId = createB15RunId();
  const directory = await createB15CalibrationDirectory(process.cwd(), runId);
  const sensitiveValues = [
    environment.bypassSecret,
    environment.vercelToken,
    ...articles.flatMap((article) => [
      article.title,
      article.content,
      ...selectB15DiagnosticQuestions(article.title, article.sourceIndex),
    ]),
  ];
  let flow: B15FlowResult;
  try {
    flow = await runB15CalibrationFlow({
      articles,
      transport,
      runtimeLogCollector,
      onAdviceDiagnosticsArtifact: async (adviceDiagnosticsArtifact) => {
        const serializedAdviceDiagnostics = serializeB15AdviceDiagnosticsArtifact(
          adviceDiagnosticsArtifact,
          articles,
          sensitiveValues,
        );
        await writeB15AdviceDiagnosticsArtifactAtomic(
          directory,
          serializedAdviceDiagnostics,
        );
      },
    });
  } catch {
    flow = {
      calls: [],
      stopReason: "infrastructure",
      infrastructureIssues: ["runner-interrupted"],
    };
  }

  try {
    await verifyB15Deployment(environment);
    await verifyB15Health(environment);
  } catch {
    flow.infrastructureIssues.push("preview-drift-or-health-failure");
    flow.stopReason = "infrastructure";
  }

  const collection = await runtimeLogCollector.finish(Date.now());
  const artifact = buildB15CalibrationArtifact(flow, collection);
  let serialized: string;
  let finalArtifact = artifact;
  try {
    serialized = serializeB15CalibrationArtifact(artifact, sensitiveValues);
  } catch {
    const inconclusiveArtifact: B15CalibrationArtifact = {
      ...artifact,
      result: "INCONCLUSIVE",
      resultMessage: b15ResultMessage("INCONCLUSIVE"),
      execution: {
        ...artifact.execution,
        infrastructureIssues: ["artifact-integrity-failure"],
      },
      records: [],
    };
    finalArtifact = inconclusiveArtifact;
    serialized = serializeB15CalibrationArtifact(inconclusiveArtifact);
  }
  await writeArtifactAtomic(directory, serialized);
  console.log(finalArtifact.resultMessage);
  console.log(`Artifacts: ${relative(process.cwd(), directory)}`);
}

const isDirectExecution =
  typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  main()
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "B.1.5 Calibration failed.");
      process.exitCode = 1;
    })
    .finally(() => {
      delete process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
      delete process.env.VERCEL_TOKEN;
    });
}
