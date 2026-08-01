import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export const B2_CONTENT_DRAFT_ARTIFACT_SCHEMA_VERSION =
  "b2-content-draft-v1";

const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_ARTIFACT_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export interface B2ContentDraftArtifact {
  artifactSchemaVersion: typeof B2_CONTENT_DRAFT_ARTIFACT_SCHEMA_VERSION;
  articleId: string;
  stage: number;
  sourceRequestId: string;
  generatedAt: string;
  inputSha256: string;
  markdownSha256: string;
  patchedContentSha256: string;
  markdown: string;
}

export interface B2ContentDraftArtifactInput {
  articleId: string;
  stage: number;
  sourceRequestId: string;
  generatedAt: string;
  title: string;
  content: string;
  markdown: string;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return JSON.stringify(actual) === JSON.stringify([...keys].sort());
}

function assertDigest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error(`B.2 Content Draft ${label} must be a SHA-256 digest.`);
  }
}

function assertSafeArticleId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !SAFE_ARTIFACT_ID_PATTERN.test(value)) {
    throw new Error("B.2 Content Draft article ID is invalid.");
  }
}

export function b2ContentDraftInputSha256(title: string, content: string): string {
  return sha256(`${title}\0${content}`);
}

export function b2PatchedContentSha256(content: string, markdown: string): string {
  return sha256(`${content}\n\n${markdown.trim()}`);
}

export function buildB2ContentDraftArtifact(
  input: B2ContentDraftArtifactInput,
): B2ContentDraftArtifact {
  assertSafeArticleId(input.articleId);
  if (!Number.isSafeInteger(input.stage) || input.stage < 1) {
    throw new Error("B.2 Content Draft stage is invalid.");
  }
  if (!REQUEST_ID_PATTERN.test(input.sourceRequestId)) {
    throw new Error("B.2 Content Draft source request ID is invalid.");
  }
  if (!Number.isFinite(Date.parse(input.generatedAt))) {
    throw new Error("B.2 Content Draft generatedAt is invalid.");
  }
  if (typeof input.title !== "string" || !input.title.trim()) {
    throw new Error("B.2 Content Draft title is invalid.");
  }
  if (typeof input.content !== "string" || !input.content.trim()) {
    throw new Error("B.2 Content Draft content is invalid.");
  }
  const markdown = input.markdown.trim();
  if (!markdown || markdown.length > 12_000) {
    throw new Error("B.2 Content Draft markdown is invalid.");
  }

  const artifact: B2ContentDraftArtifact = {
    artifactSchemaVersion: B2_CONTENT_DRAFT_ARTIFACT_SCHEMA_VERSION,
    articleId: input.articleId,
    stage: input.stage,
    sourceRequestId: input.sourceRequestId.toLowerCase(),
    generatedAt: new Date(input.generatedAt).toISOString(),
    inputSha256: b2ContentDraftInputSha256(input.title, input.content),
    markdownSha256: sha256(markdown),
    patchedContentSha256: b2PatchedContentSha256(input.content, markdown),
    markdown,
  };
  return parseB2ContentDraftArtifact(artifact);
}

export function parseB2ContentDraftArtifact(
  value: unknown,
): B2ContentDraftArtifact {
  const keys = [
    "artifactSchemaVersion",
    "articleId",
    "stage",
    "sourceRequestId",
    "generatedAt",
    "inputSha256",
    "markdownSha256",
    "patchedContentSha256",
    "markdown",
  ] as const;
  if (
    !isRecord(value) ||
    !exactKeys(value, keys) ||
    value.artifactSchemaVersion !== B2_CONTENT_DRAFT_ARTIFACT_SCHEMA_VERSION
  ) {
    throw new Error("B.2 Content Draft artifact schema is invalid.");
  }
  const articleId = value.articleId;
  const stageValue = value.stage;
  const sourceRequestId = value.sourceRequestId;
  const generatedAt = value.generatedAt;
  const inputSha256 = value.inputSha256;
  const markdownSha256 = value.markdownSha256;
  const patchedContentSha256 = value.patchedContentSha256;
  const markdown = value.markdown;
  assertSafeArticleId(articleId);
  if (
    typeof stageValue !== "number" ||
    !Number.isSafeInteger(stageValue) ||
    stageValue < 1
  ) {
    throw new Error("B.2 Content Draft artifact stage is invalid.");
  }
  const stage = stageValue;
  if (
    typeof sourceRequestId !== "string" ||
    !REQUEST_ID_PATTERN.test(sourceRequestId)
  ) {
    throw new Error("B.2 Content Draft artifact request ID is invalid.");
  }
  if (
    typeof generatedAt !== "string" ||
    !Number.isFinite(Date.parse(generatedAt))
  ) {
    throw new Error("B.2 Content Draft artifact generatedAt is invalid.");
  }
  assertDigest(inputSha256, "inputSha256");
  assertDigest(markdownSha256, "markdownSha256");
  assertDigest(patchedContentSha256, "patchedContentSha256");
  if (typeof markdown !== "string" || !markdown.trim()) {
    throw new Error("B.2 Content Draft artifact markdown is invalid.");
  }
  if (sha256(markdown) !== markdownSha256) {
    throw new Error("B.2 Content Draft markdown integrity mismatch.");
  }
  return {
    artifactSchemaVersion: B2_CONTENT_DRAFT_ARTIFACT_SCHEMA_VERSION,
    articleId,
    stage,
    sourceRequestId,
    generatedAt: new Date(generatedAt).toISOString(),
    inputSha256,
    markdownSha256,
    patchedContentSha256,
    markdown,
  };
}

export function assertB2ContentDraftArtifactInput(
  artifact: B2ContentDraftArtifact,
  input: { title: string; content: string },
): void {
  if (artifact.inputSha256 !== b2ContentDraftInputSha256(input.title, input.content)) {
    throw new Error("B.2 Content Draft input integrity mismatch.");
  }
  if (
    artifact.patchedContentSha256 !==
    b2PatchedContentSha256(input.content, artifact.markdown)
  ) {
    throw new Error("B.2 Content Draft patched content integrity mismatch.");
  }
}

export function serializeB2ContentDraftArtifact(
  artifact: B2ContentDraftArtifact,
): string {
  const parsed = parseB2ContentDraftArtifact(artifact);
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

function assertWithinDirectory(directory: string, target: string): void {
  const root = resolve(directory);
  const candidate = resolve(target);
  const pathFromRoot = relative(root, candidate);
  if (
    !pathFromRoot ||
    pathFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathFromRoot)
  ) {
    throw new Error("B.2 Content Draft artifact path escapes its controlled directory.");
  }
}

export function b2ContentDraftArtifactFilename(
  articleId: string,
  stage: number,
  round: number,
): string {
  assertSafeArticleId(articleId);
  if (!Number.isSafeInteger(stage) || stage < 1) {
    throw new Error("B.2 Content Draft artifact stage is invalid.");
  }
  if (!Number.isSafeInteger(round) || round < 1) {
    throw new Error("B.2 Content Draft artifact round is invalid.");
  }
  return `${articleId}-stage-${stage}-round-${round}.json`;
}

export async function writeB2ContentDraftArtifactAtomic(
  directory: string,
  artifact: B2ContentDraftArtifact,
  filename: string,
): Promise<string> {
  if (!/^[A-Za-z0-9_.:-]{1,128}\.json$/.test(filename)) {
    throw new Error("B.2 Content Draft artifact filename is invalid.");
  }
  const target = resolve(directory, filename);
  assertWithinDirectory(directory, target);
  const serialized = serializeB2ContentDraftArtifact(artifact);
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, serialized, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  await rename(temporary, target);
  const stored = parseB2ContentDraftArtifact(
    JSON.parse(await readFile(target, "utf8")),
  );
  if (stored.markdownSha256 !== artifact.markdownSha256) {
    throw new Error("B.2 Content Draft stored hash does not match runtime hash.");
  }
  return target;
}
