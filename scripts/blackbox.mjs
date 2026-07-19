import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import http from "node:http";
import https from "node:https";
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
const markdownClientId = randomUUID();
const oversizedClientId = randomUUID();
const paragraphs = [
  {
    id: "Para-1",
    text: "本文说明内容体检的方法、适用范围和限制条件，所有结论仍需人工核对。",
  },
];
const patchDiagnostics = [
  {
    question: "文章说明了哪些适用范围和限制条件？",
    answerability: "信息不足",
    riskLevel: "medium",
    evidence: [{ paragraphId: "Para-1", quote: paragraphs[0].text }],
    evidenceStatus: "valid",
    missingInfo: ["发布日期"],
    recommendation: "补充发布日期和适用边界。",
    source: "fallback",
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

async function requestWithDeclaredLength(path, declaredLength, body) {
  const target = new URL(`${baseUrl}${path}`);
  const transport = target.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const outgoing = transport.request(
      target,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(declaredLength),
          "X-GEO-Client-ID": oversizedClientId,
          "X-Forwarded-For": testIp,
          Connection: "close",
        },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let parsed = null;
          try {
            parsed = text ? JSON.parse(text) : null;
          } catch {
            parsed = text;
          }
          assert.match(
            String(response.headers["x-request-id"] || ""),
            requestIdPattern,
            `missing or invalid request id for ${path}`,
          );
          resolve({
            response: { status: response.statusCode, headers: response.headers },
            body: parsed,
          });
        });
      },
    );
    outgoing.setTimeout(10_000, () => outgoing.destroy(new Error("raw request timed out")));
    outgoing.on("error", reject);
    outgoing.end(body);
  });
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
    "feedbackConfigured",
    "modelConfigured",
    "redisConfigured",
    "securityConfigured",
    "sentryConfigured",
  ]);
  assert.ok(Object.values(result.body.checks).every((value) => typeof value === "boolean"));
  assert.equal(Number.isNaN(Date.parse(result.body?.timestamp)), false);
  assert.deepEqual(Object.keys(result.body).sort(), ["checks", "status", "timestamp"]);
  assert.equal(result.response.headers.get("cache-control"), "no-store");
  assert.equal(result.response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(result.response.headers.get("x-frame-options"), "DENY");
  assert.equal(result.response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.match(result.response.headers.get("content-security-policy") || "", /frame-ancestors 'none'/);
});

await expectStatus(
  "rejects 12,001 article characters",
  "/api/evaluate-scoring",
  {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ ...article, content: "中".repeat(12_001) }),
  },
  400,
  "INVALID_REQUEST",
);

await expectStatus(
  "rejects oversized uncompressed body",
  "/api/evaluate-scoring",
  {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ ...article, content: "A".repeat(140 * 1024) }),
  },
  413,
  "PAYLOAD_TOO_LARGE",
);

await check("rejects oversized declared Content-Length", async () => {
  const result = await requestWithDeclaredLength(
    "/api/evaluate-scoring",
    129 * 1024,
    JSON.stringify(article),
  );
  assert.equal(result.response.status, 413, responseSummary(result));
  assert.equal(result.body?.error, "PAYLOAD_TOO_LARGE");
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
let sessionRunId = "";
await check("creates signed analysis session", async () => {
  const result = await request("/api/analysis-session", {
    method: "POST",
    headers: headers(),
  });
  assert.equal(result.response.status, 200, responseSummary(result));
  assert.equal(typeof result.body?.token, "string");
  assert.equal(typeof result.body?.runId, "string");
  assert.equal(result.body?.operations?.diagnose, 10);
  token = result.body.token;
  sessionRunId = result.body.runId;
});

await expectStatus(
  "rejects unknown beta event",
  "/api/beta-event",
  {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ event: "article_uploaded" }),
  },
  400,
  "INVALID_EVENT",
);

await check("records visit idempotently", async () => {
  const init = {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ event: "visit" }),
  };
  const first = await request("/api/beta-event", init);
  const second = await request("/api/beta-event", init);
  assert.equal(first.response.status, 202, responseSummary(first));
  assert.equal(first.body?.duplicate, false);
  assert.equal(second.response.status, 200, responseSummary(second));
  assert.equal(second.body?.duplicate, true);
});

await check("records editor start idempotently", async () => {
  const init = {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ event: "editor_started" }),
  };
  const first = await request("/api/beta-event", init);
  const second = await request("/api/beta-event", init);
  assert.equal(first.response.status, 202, responseSummary(first));
  assert.equal(first.body?.duplicate, false);
  assert.equal(second.response.status, 200, responseSummary(second));
  assert.equal(second.body?.duplicate, true);
});

await expectStatus(
  "requires token for analysis started event",
  "/api/beta-event",
  {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ event: "analysis_started", runId: sessionRunId }),
  },
  401,
  "ANALYSIS_SESSION_REQUIRED",
);

await check("records analysis started idempotently", async () => {
  const init = {
    method: "POST",
    headers: headers({ token }),
    body: JSON.stringify({ event: "analysis_started", runId: sessionRunId }),
  };
  const first = await request("/api/beta-event", init);
  const second = await request("/api/beta-event", init);
  assert.equal(first.response.status, 202, responseSummary(first));
  assert.equal(first.body?.duplicate, false);
  assert.equal(second.response.status, 200, responseSummary(second));
  assert.equal(second.body?.duplicate, true);
});

await expectStatus(
  "requires token for completed analysis event",
  "/api/beta-event",
  {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ event: "analysis_completed", runId: sessionRunId }),
  },
  401,
  "ANALYSIS_SESSION_REQUIRED",
);

await expectStatus(
  "rejects mismatched completed analysis run",
  "/api/beta-event",
  {
    method: "POST",
    headers: headers({ token }),
    body: JSON.stringify({ event: "analysis_completed", runId: randomUUID() }),
  },
  403,
  "RUN_ID_MISMATCH",
);

await check("records completed analysis idempotently", async () => {
  const init = {
    method: "POST",
    headers: headers({ token }),
    body: JSON.stringify({ event: "analysis_completed", runId: sessionRunId }),
  };
  const first = await request("/api/beta-event", init);
  const second = await request("/api/beta-event", init);
  assert.equal(first.response.status, 202, responseSummary(first));
  assert.equal(first.body?.duplicate, false);
  assert.equal(second.response.status, 200, responseSummary(second));
  assert.equal(second.body?.duplicate, true);
});

for (const event of ["report_viewed", "patch_requested", "patch_generated", "patch_copied"]) {
  await check(`records ${event} idempotently`, async () => {
    const init = {
      method: "POST",
      headers: headers({ token }),
      body: JSON.stringify({ event, runId: sessionRunId }),
    };
    const first = await request("/api/beta-event", init);
    const second = await request("/api/beta-event", init);
    assert.equal(first.response.status, 202, responseSummary(first));
    assert.equal(first.body?.duplicate, false);
    assert.equal(second.response.status, 200, responseSummary(second));
    assert.equal(second.body?.duplicate, true);
  });
}

await expectStatus(
  "rejects diagnostic feedback with private content",
  "/api/beta-event",
  {
    method: "POST",
    headers: headers({ token }),
    body: JSON.stringify({
      event: "diagnosis_feedback",
      runId: sessionRunId,
      diagnosticIndex: 0,
      helpful: true,
      question: "private question",
    }),
  },
  400,
  "INVALID_EVENT",
);

await check("accepts one feedback per diagnosis", async () => {
  const first = await request("/api/beta-event", {
    method: "POST",
    headers: headers({ token }),
    body: JSON.stringify({
      event: "diagnosis_feedback",
      runId: sessionRunId,
      diagnosticIndex: 0,
      helpful: true,
    }),
  });
  const duplicate = await request("/api/beta-event", {
    method: "POST",
    headers: headers({ token }),
    body: JSON.stringify({
      event: "diagnosis_feedback",
      runId: sessionRunId,
      diagnosticIndex: 0,
      helpful: false,
    }),
  });
  const secondDiagnosis = await request("/api/beta-event", {
    method: "POST",
    headers: headers({ token }),
    body: JSON.stringify({
      event: "diagnosis_feedback",
      runId: sessionRunId,
      diagnosticIndex: 1,
      helpful: false,
    }),
  });
  assert.equal(first.response.status, 202, responseSummary(first));
  assert.equal(first.body?.duplicate, false);
  assert.equal(duplicate.response.status, 200, responseSummary(duplicate));
  assert.equal(duplicate.body?.duplicate, true);
  assert.equal(secondDiagnosis.response.status, 202, responseSummary(secondDiagnosis));
  assert.equal(secondDiagnosis.body?.duplicate, false);
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
  assert.ok(["valid", "missing", "invalid"].includes(result.body?.evidenceStatus));
  assert.ok(Array.isArray(result.body?.evidence));
  if (result.body.evidenceStatus === "valid") assert.ok(result.body.evidence.length > 0);
  if (result.body.evidenceStatus === "missing") assert.equal(result.body.evidence.length, 0);
  for (const item of result.body.evidence) {
    const paragraph = paragraphs.find((value) => value.id === item.paragraphId);
    assert.equal(paragraph?.text.includes(item.quote), true);
  }
});

await check("allows patch generation once", async () => {
  const result = await request("/api/generate-patches", {
    method: "POST",
    headers: headers({ token }),
    body: JSON.stringify({
      title: article.title,
      numbered_paragraphs: paragraphs,
      diagnostics: patchDiagnostics,
      mode: "advice",
    }),
  });
  assert.equal(result.response.status, 200, responseSummary(result));
  assert.equal(result.response.headers.get("x-geo-operation-remaining"), "0");
  assert.equal(result.body?.mode, "advice");
  assert.ok(result.body?.actions?.length >= 1);
  assert.ok(result.body.actions.every((action) => typeof action.id === "string" && typeof action.createdAt === "string"));
  assertExpectedSource(result.body?.source);
});

await expectStatus(
  "blocks second patch generation",
  "/api/generate-patches",
  {
    method: "POST",
    headers: headers({ token }),
    body: JSON.stringify({
      title: article.title,
      numbered_paragraphs: paragraphs,
      diagnostics: patchDiagnostics,
      mode: "advice",
    }),
  },
  429,
  "OPERATION_LIMIT_REACHED",
);

await check("allows one content draft separately", async () => {
  const result = await request("/api/generate-patches", {
    method: "POST",
    headers: headers({ token }),
    body: JSON.stringify({
      title: article.title,
      numbered_paragraphs: paragraphs,
      diagnostics: patchDiagnostics,
      mode: "content_draft",
    }),
  });
  assert.equal(result.response.status, 200, responseSummary(result));
  assert.equal(result.body?.mode, "content_draft");
  assert.ok(result.body?.actions?.length >= 1);
  assertExpectedSource(result.body?.source);
});

await expectStatus(
  "blocks second content draft",
  "/api/generate-patches",
  {
    method: "POST",
    headers: headers({ token }),
    body: JSON.stringify({
      title: article.title,
      numbered_paragraphs: paragraphs,
      diagnostics: patchDiagnostics,
      mode: "content_draft",
    }),
  },
  429,
  "OPERATION_LIMIT_REACHED",
);

await check("limits warmup to once per device window", async () => {
  const warmupHeaders = headers({ clientId: warmupClientId });
  const first = await request("/api/warmup", { method: "POST", headers: warmupHeaders });
  const second = await request("/api/warmup", { method: "POST", headers: warmupHeaders });
  assert.equal(first.response.status, 200, responseSummary(first));
  assert.equal(first.body?.status, "deprecated");
  assert.equal(first.response.headers.get("deprecation"), "true");
  assert.equal(first.response.headers.get("x-geo-warmup-status"), "deprecated");
  assert.equal(second.response.status, 429, responseSummary(second));
  assert.equal(second.response.headers.get("deprecation"), "true");
  assert.equal(second.body?.error, "RATE_LIMITED");
});

await check("escapes raw HTML in Markdown patches", async () => {
  const sessionHeaders = headers({ clientId: markdownClientId });
  const session = await request("/api/analysis-session", {
    method: "POST",
    headers: sessionHeaders,
  });
  assert.equal(session.response.status, 200, responseSummary(session));

  const maliciousParagraphs = [
    {
      id: "Para-1",
      text: "正文包含 <script>alert('x')</script> 标签，输出时必须作为普通文本处理。",
    },
  ];
  const result = await request("/api/generate-patches", {
    method: "POST",
    headers: headers({ clientId: markdownClientId, token: session.body.token }),
    body: JSON.stringify({
      title: "Markdown 安全测试",
      numbered_paragraphs: maliciousParagraphs,
      diagnostics: [{
        ...patchDiagnostics[0],
        evidence: [{ paragraphId: "Para-1", quote: maliciousParagraphs[0].text }],
      }],
      mode: "content_draft",
    }),
  });
  assert.equal(result.response.status, 200, responseSummary(result));
  assert.equal(typeof result.body?.markdown, "string");
  assert.doesNotMatch(result.body.markdown, /<\/?script\b/i);
});

console.log(`PASS ${passed} black-box checks`);
