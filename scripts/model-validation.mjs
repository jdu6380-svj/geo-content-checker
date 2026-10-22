import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";

const baseUrl = (process.env.GEO_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const corpusPath = process.argv.find((value) => value.startsWith("--corpus="))?.split("=", 2)[1];
const outputPath =
  process.argv.find((value) => value.startsWith("--output="))?.split("=", 2)[1] ||
  `outputs/model-validation-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
const runsPerArticle = Number(process.env.MODEL_VALIDATION_RUNS || 3);
const callDelayMs = Math.max(0, Number(process.env.MODEL_VALIDATION_CALL_DELAY_MS || 1_500));
const runDelayMs = Math.max(0, Number(process.env.MODEL_VALIDATION_RUN_DELAY_MS || 2_500));

if (!corpusPath) throw new Error("Usage: npm run model:validate -- --corpus=path/to/corpus.json");
if (runsPerArticle !== 3) throw new Error("MODEL_VALIDATION_RUNS must remain 3 for Beta acceptance");

const corpus = JSON.parse(await readFile(corpusPath, "utf8"));
assert.ok(Array.isArray(corpus) && corpus.length === 10, "Corpus must contain exactly 10 articles");

function createNumberedParagraphs(content) {
  const normalized = content
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ \u00a0]+/g, " ")
    .trim();
  const blocks = normalized
    .split(/\n{2,}|\n(?=#{1,6}\s)|\n(?=[一二三四五六七八九十]+[、.．])|\n(?=\d+[、.．])/)
    .map((block) => block.trim())
    .filter(Boolean);
  const chunks = [];
  for (const block of blocks.length ? blocks : [normalized]) {
    if (block.length <= 700) {
      chunks.push(block);
      continue;
    }
    const sentences = block.split(/(?<=[。！？!?；;])\s*/).filter(Boolean);
    let current = "";
    for (const sentence of sentences.length ? sentences : [block]) {
      if (current && current.length + sentence.length > 700) {
        chunks.push(current);
        current = "";
      }
      if (sentence.length > 700) {
        for (let index = 0; index < sentence.length; index += 700) {
          chunks.push(sentence.slice(index, index + 700));
        }
      } else {
        current += sentence;
      }
    }
    if (current) chunks.push(current);
  }
  return chunks.map((text, index) => ({ id: `Para-${index + 1}`, text }));
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const clientIps = new Map();

function requestHeaders(clientId, token) {
  const ip = clientIps.get(clientId) || `203.0.113.${10 + Math.floor(Math.random() * 200)}`;
  clientIps.set(clientId, ip);
  const headers = {
    "Content-Type": "application/json",
    "X-GEO-Client-ID": clientId,
    "X-Forwarded-For": ip,
  };
  if (token) headers["X-GEO-Analysis-Token"] = token;
  return headers;
}

async function call(path, body, clientId, token) {
  if (callDelayMs) await sleep(callDelayMs);
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: requestHeaders(clientId, token),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${payload?.message || "unknown error"}`);
  }
  return payload;
}

function requireModelSource(payload, path) {
  if (payload?.source !== "model") {
    throw new Error(`${path} did not return source=model; fallback is not accepted`);
  }
}

function validateArticle(article, index) {
  assert.equal(typeof article?.title, "string", `article ${index + 1} title missing`);
  assert.equal(typeof article?.content, "string", `article ${index + 1} content missing`);
  assert.ok(article.title.length <= 120, `article ${index + 1} title exceeds 120 characters`);
  assert.ok(article.content.length <= 12_000, `article ${index + 1} exceeds 12,000 characters`);
  const paragraphs = createNumberedParagraphs(article.content);
  assert.ok(paragraphs.length <= 80, `article ${index + 1} exceeds 80 paragraphs`);
  return paragraphs;
}

const records = [];
let totalModelRequests = 0;
let modelCalls = 0;
let evidenceItems = [];
let evidenceErrors = 0;
let invalidEvidenceStatuses = 0;

for (let articleIndex = 0; articleIndex < corpus.length; articleIndex += 1) {
  const article = corpus[articleIndex];
  const paragraphs = validateArticle(article, articleIndex);
  const runs = [];
  let referenceQuestions = null;

  for (let runIndex = 0; runIndex < runsPerArticle; runIndex += 1) {
    const clientId = randomUUID();
    const session = await call("/api/analysis-session", {}, clientId);
    const token = session.token;

    const scoring = await call(
      "/api/evaluate-scoring",
      { title: article.title, content: article.content, publishedAt: article.publishedAt || "" },
      clientId,
      token,
    );
    totalModelRequests += 1;
    requireModelSource(scoring, "/api/evaluate-scoring");
    modelCalls += 1;

    const predicted = await call(
      "/api/predict-questions",
      { title: article.title, numbered_paragraphs: paragraphs },
      clientId,
      token,
    );
    totalModelRequests += 1;
    requireModelSource(predicted, "/api/predict-questions");
    modelCalls += 1;
    if (!referenceQuestions) referenceQuestions = predicted.questions;

    const diagnosticQuestions = referenceQuestions.slice(0, 3);
    const diagnostics = [];
    for (const question of diagnosticQuestions) {
      const diagnostic = await call(
        "/api/qa-diagnostic",
        { title: article.title, numbered_paragraphs: paragraphs, question },
        clientId,
        token,
      );
      totalModelRequests += 1;
      requireModelSource(diagnostic, "/api/qa-diagnostic");
      modelCalls += 1;
      assert.ok(
        ["valid", "missing", "invalid"].includes(diagnostic.evidenceStatus),
        `diagnostic returned invalid evidenceStatus: ${diagnostic.evidenceStatus}`,
      );
      if (diagnostic.evidenceStatus === "valid") {
        assert.ok(diagnostic.evidence?.length > 0, "valid evidenceStatus requires evidence");
      }
      if (diagnostic.evidenceStatus === "missing") {
        assert.equal(diagnostic.evidence?.length || 0, 0, "missing evidenceStatus cannot include evidence");
      }
      if (diagnostic.evidenceStatus === "invalid") {
        invalidEvidenceStatuses += 1;
        evidenceErrors += 1;
      }
      diagnostics.push(diagnostic);
      for (const evidence of diagnostic.evidence || []) {
        const paragraph = paragraphs.find((item) => item.id === evidence.paragraphId);
        const valid = Boolean(paragraph?.text.includes(evidence.quote));
        evidenceItems.push({
          articleIndex: articleIndex + 1,
          runIndex: runIndex + 1,
          type: "diagnostic",
          question,
          paragraphId: evidence.paragraphId,
          quote: evidence.quote,
          evidenceStatus: diagnostic.evidenceStatus,
          valid,
          semanticReview: "pending",
        });
        if (!valid) evidenceErrors += 1;
      }
    }

    let patches = null;
    if (runIndex === 0) {
      patches = await call(
        "/api/generate-patches",
        {
          title: article.title,
          numbered_paragraphs: paragraphs,
          diagnostics,
          mode: "content_draft",
        },
        clientId,
        token,
      );
      totalModelRequests += 1;
      requireModelSource(patches, "/api/generate-patches");
      modelCalls += 1;
      for (const item of patches.actions || []) {
        if (item.type !== "faq" && item.type !== "fact_card") continue;
        const evidence = item.evidence;
        const paragraph = paragraphs.find((value) => value.id === evidence?.paragraphId);
        const valid = Boolean(paragraph?.text.includes(evidence?.quote || ""));
        evidenceItems.push({
          articleIndex: articleIndex + 1,
          runIndex: runIndex + 1,
          type: item.type === "faq" ? "faq" : "fact-card",
          label: item.question || item.label,
          paragraphId: evidence?.paragraphId,
          quote: evidence?.quote,
          valid,
          semanticReview: "pending",
        });
        if (!valid) evidenceErrors += 1;
      }
    }

    runs.push({
      runIndex: runIndex + 1,
      totalScore: scoring.totalScore,
      dimensions: scoring.dimensions,
      questions: predicted.questions,
      diagnostics,
      patches,
    });
    if (runDelayMs) await sleep(runDelayMs);
  }
  records.push({ articleIndex: articleIndex + 1, title: article.title, runs });
}

function scoreRange(values) {
  return Math.max(...values) - Math.min(...values);
}

const scoreRanges = records.map((record) => scoreRange(record.runs.map((run) => run.totalScore)));
const dimensionRanges = {};
for (const key of ["questionCoverage", "factCompleteness", "structureClarity", "freshness"]) {
  dimensionRanges[key] = Math.max(
    ...records.map((record) =>
      scoreRange(record.runs.map((run) => (run.dimensions[key].score / run.dimensions[key].max) * 100)),
    ),
  );
}

let consistencyTotal = 0;
let consistencyMatches = 0;
for (const record of records) {
  const baseline = record.runs[0].diagnostics;
  for (let questionIndex = 0; questionIndex < baseline.length; questionIndex += 1) {
    const expected = baseline[questionIndex].answerability;
    for (const run of record.runs) {
      consistencyTotal += 1;
      if (run.diagnostics[questionIndex]?.answerability === expected) consistencyMatches += 1;
    }
  }
}
const answerabilityConsistency = consistencyTotal ? consistencyMatches / consistencyTotal : 0;
const modelSuccessRate = totalModelRequests ? modelCalls / totalModelRequests : 0;
const semanticReviewsPending = evidenceItems.filter((item) => item.semanticReview === "pending").length;
const summary = {
  articles: records.length,
  runsPerArticle,
  totalModelApiCalls: totalModelRequests,
  modelSourceSuccessRate: Number(modelSuccessRate.toFixed(4)),
  maxScoreRange: Math.max(...scoreRanges),
  maxNormalizedDimensionRange: Math.max(...Object.values(dimensionRanges)),
  answerabilityConsistency: Number(answerabilityConsistency.toFixed(4)),
  evidenceItems: evidenceItems.length,
  fabricatedEvidenceErrors: evidenceErrors,
  invalidEvidenceStatuses,
  semanticReviewsPending,
  thresholds: {
    scoreRangePass: Math.max(...scoreRanges) <= 10,
    dimensionRangePass: Math.max(...Object.values(dimensionRanges)) <= 15,
    answerabilityConsistencyPass: answerabilityConsistency >= 0.8,
    modelSourceSuccessPass: modelSuccessRate >= 0.95,
    fabricatedEvidencePass: evidenceErrors === 0,
    manualSemanticReviewRequired: semanticReviewsPending > 0,
  },
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      baseUrl,
      summary,
      evidenceReview: evidenceItems,
      records,
    },
    null,
    2,
  ),
);

console.log(JSON.stringify(summary, null, 2));
if (
  !summary.thresholds.scoreRangePass ||
  !summary.thresholds.dimensionRangePass ||
  !summary.thresholds.answerabilityConsistencyPass ||
  !summary.thresholds.modelSourceSuccessPass ||
  !summary.thresholds.fabricatedEvidencePass
) {
  process.exitCode = 1;
}
