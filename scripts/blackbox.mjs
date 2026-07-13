import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";

const baseUrl = (process.env.GEO_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const expectedSourceArgument = process.argv.find((value) => value.startsWith("--expect-source="));
const expectedSource = expectedSourceArgument?.split("=", 2)[1] || "either";
if (!["either", "model", "fallback"].includes(expectedSource)) {
  throw new Error("--expect-source must be either, model, or fallback");
}
const testIp = `198.51.100.${10 + (randomBytes(1)[0] % 190)}`;
const clientId = randomUUID();
const alternateClientId = randomUUID();
const warmupClientId = randomUUID();
const paragraphs = [
  {
    id: "Para-1",
    text: "本文说明内容体检的方法、适用范围和限制条件，所有结论仍需人工核对。",
  },
];
const article = {
  title: "GEO 黑盒验收文章",
  content: paragraphs[0].text,
  publishedAt: "2026-07-14",
};
const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let passed = 0;

function responseSummary(result) {
  return JSON.stringify({
    status: result.response.status,
    error: typeof result.body?.error === "string" ? result.body.error : undefined,
    source: typeof result.body?.source === "string" ? result.body.source : undefined,
  });
}

function assertExpectedSource(source) {
  assert.ok(source === "model" || source === "fallback", `unexpected source: ${source}`);
  if (expectedSource !== "either") assert.equal(source, expectedSource);
}

function headers(params = {}) {
  const result = new Headers({
    "Content-Type": "application/json",
    "X-GEO-Client-ID": params.clientId || clientId,
    "X-Forwarded-For": params.ip || testIp,
  });
  if (params.token) result.set("X-GEO-Analysis-Token", params.token);
  if (params.gzip) result.set("X-GEO-Content-Encoding", "gzip");
  return result;
}

async function request(path, init) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(30_000),
  });
  assert.match(
    response.headers.get("x-request-id") || "",
    requestIdPattern,
    `missing or invalid request id for ${path}`,
  );
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { response, body };
}

async function check(name, test) {
  await test();
  passed += 1;
  console.log(`PASS ${name}`);
}

async function expectStatus(name, path, init, status, errorCode) {
  await check(name, async () => {
    const result = await request(path, init);
    assert.equal(result.response.status, status, responseSummary(result));
    if (errorCode) assert.equal(result.body?.error, errorCode);
  });
}

console.log(`GEO black-box target: ${baseUrl} (expected source: ${expectedSource})`);

await check("reports sanitized service readiness", async () => {
  const result = await request("/api/health", { method: "GET" });
  assert.ok([200, 503].includes(result.response.status), responseSummary(result));
  assert.ok(result.body?.status === "ok" || result.body?.status === "degraded");
  assert.deepEqual(Object.keys(result.body?.checks || {}).sort(), [
    "modelConfigured",
    "redisConfigured",
    "securityConfigured",
  ]);
  assert.ok(Object.values(result.body.checks).every((value) => typeof value === "boolean"));
  assert.equal(Number.isNaN(Date.parse(result.body?.timestamp)), false);
  assert.deepEqual(Object.keys(result.body).sort(), ["checks", "status", "timestamp"]);
  assert.equal(result.response.headers.get("cache-control"), "no-store");
});

await expectStatus(
  "rejects damaged gzip",
  "/api/evaluate-scoring",
  {
    method: "POST",
    headers: headers({ gzip: true }),
    body: Buffer.from("not-a-gzip-stream"),
  },
  400,
  "INVALID_COMPRESSED_BODY",
);

await expectStatus(
  "rejects decompression bomb",
  "/api/evaluate-scoring",
  {
    method: "POST",
    headers: headers({ gzip: true }),
    body: gzipSync(Buffer.from(JSON.stringify({ ...article, content: "A".repeat(140 * 1024) }))),
  },
  413,
  "PAYLOAD_TOO_LARGE",
);

await expectStatus(
  "requires analysis token",
  "/api/evaluate-scoring",
  {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(article),
  },
  401,
  "ANALYSIS_SESSION_REQUIRED",
);

await expectStatus(
  "rejects malformed analysis token",
  "/api/evaluate-scoring",
  {
    method: "POST",
    headers: headers({ token: "not-a-valid-jwt" }),
    body: JSON.stringify(article),
  },
  401,
  "INVALID_ANALYSIS_TOKEN",
);

let token = "";
await check("creates signed analysis session", async () => {
  const result = await request("/api/analysis-session", {
    method: "POST",
    headers: headers(),
  });
  assert.equal(result.response.status, 200, responseSummary(result));
  assert.equal(typeof result.body?.token, "string");
  assert.equal(result.body?.operations?.diagnose, 10);
  token = result.body.token;
});

await expectStatus(
  "rejects token on another device",
  "/api/predict-questions",
  {
    method: "POST",
    headers: headers({ clientId: alternateClientId, token }),
    body: JSON.stringify({ title: article.title, numbered_paragraphs: paragraphs }),
  },
  403,
  "SESSION_IDENTITY_MISMATCH",
);

await check("allows score once", async () => {
  const result = await request("/api/evaluate-scoring", {
    method: "POST",
    headers: headers({ token }),
    body: JSON.stringify(article),
  });
  assert.equal(result.response.status, 200, responseSummary(result));
  assert.equal(result.response.headers.get("x-geo-operation-remaining"), "0");
  assertExpectedSource(result.body?.source);
});

await expectStatus(
  "blocks second score",
  "/api/evaluate-scoring",
  {
    method: "POST",
    headers: headers({ token }),
    body: JSON.stringify(article),
  },
  429,
  "OPERATION_LIMIT_REACHED",
);

await check("accepts authenticated gzip request", async () => {
  const payload = Buffer.from(
    JSON.stringify({ title: article.title, numbered_paragraphs: paragraphs }),
  );
  const result = await request("/api/predict-questions", {
    method: "POST",
    headers: headers({ token, gzip: true }),
    body: gzipSync(payload),
  });
  assert.equal(result.response.status, 200, responseSummary(result));
  assert.equal(result.response.headers.get("x-geo-operation-remaining"), "0");
  assert.equal(result.body?.questions?.length, 5);
  assertExpectedSource(result.body?.source);
});

await check("consumes one diagnostic allowance", async () => {
  const result = await request("/api/qa-diagnostic", {
    method: "POST",
    headers: headers({ token }),
    body: JSON.stringify({
      title: article.title,
      numbered_paragraphs: paragraphs,
      question: "文章说明了哪些适用范围和限制条件？",
    }),
  });
  assert.equal(result.response.status, 200, responseSummary(result));
  assert.equal(result.response.headers.get("x-geo-operation-remaining"), "9");
  assertExpectedSource(result.body?.source);
});

await check("allows patch generation once", async () => {
  const result = await request("/api/generate-patches", {
    method: "POST",
    headers: headers({ token }),
    body: JSON.stringify({ title: article.title, numbered_paragraphs: paragraphs }),
  });
  assert.equal(result.response.status, 200, responseSummary(result));
  assert.equal(result.response.headers.get("x-geo-operation-remaining"), "0");
  assertExpectedSource(result.body?.source);
});

await expectStatus(
  "blocks second patch generation",
  "/api/generate-patches",
  {
    method: "POST",
    headers: headers({ token }),
    body: JSON.stringify({ title: article.title, numbered_paragraphs: paragraphs }),
  },
  429,
  "OPERATION_LIMIT_REACHED",
);

await check("limits warmup to once per device window", async () => {
  const warmupHeaders = headers({ clientId: warmupClientId });
  const first = await request("/api/warmup", { method: "POST", headers: warmupHeaders });
  const second = await request("/api/warmup", { method: "POST", headers: warmupHeaders });
  assert.equal(first.response.status, 200, responseSummary(first));
  assert.equal(second.response.status, 429, responseSummary(second));
  assert.equal(second.body?.error, "RATE_LIMITED");
});

console.log(`PASS ${passed} black-box checks`);
