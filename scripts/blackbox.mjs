import assert from "node:assert/strict";

import {
  isVercelDeploymentProtectionRedirect,
  resolveAutomationBypassSecret,
  withAutomationBypassRequestInit,
} from "./preview-automation.mjs";

const baseUrl = (process.env.GEO_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const automationBypassSecret = resolveAutomationBypassSecret(baseUrl);
const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const legacyAnalysisRoutes = [
  "/api/analysis-session",
  "/api/evaluate-scoring",
  "/api/predict-questions",
  "/api/qa-diagnostic",
  "/api/generate-patches",
  "/api/warmup",
];

let passed = 0;

function responseSummary(result) {
  return JSON.stringify({
    status: result.response.status,
    error: typeof result.body?.error === "string" ? result.body.error : undefined,
  });
}

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...withAutomationBypassRequestInit(init, automationBypassSecret),
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  if (isVercelDeploymentProtectionRedirect(response.status, response.headers.get("location"))) {
    throw new Error(
      "Vercel Deployment Protection blocked the request. Configure VERCEL_AUTOMATION_BYPASS_SECRET in the Preview test runner.",
    );
  }
  assert.match(response.headers.get("x-request-id") || "", requestIdPattern, `missing or invalid request id for ${path}`);
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

console.log(`GEO commercial migration black-box target: ${baseUrl}`);
console.log(`Vercel Preview automation bypass: ${automationBypassSecret ? "enabled" : "disabled"}`);

await check("reports sanitized service readiness", async () => {
  const result = await request("/api/health", { method: "GET" });
  assert.ok([200, 503].includes(result.response.status), responseSummary(result));
  assert.ok(result.body?.status === "ok" || result.body?.status === "degraded");
  assert.ok(result.body?.checks && typeof result.body.checks === "object");
  assert.ok(Object.values(result.body.checks).every((value) => typeof value === "boolean"));
  assert.equal(Number.isNaN(Date.parse(result.body?.timestamp)), false);
  assert.deepEqual(Object.keys(result.body).sort(), ["checks", "status", "timestamp"]);
  assert.equal(result.response.headers.get("cache-control"), "no-store");
  assert.equal(result.response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(result.response.headers.get("x-frame-options"), "DENY");
  assert.equal(result.response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.match(result.response.headers.get("content-security-policy") || "", /frame-ancestors 'none'/);
});

for (const path of legacyAnalysisRoutes) {
  await check(`migrates legacy anonymous route ${path}`, async () => {
    const secretContent = "black-box input must not be reflected";
    const result = await request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: secretContent, content: secretContent }),
    });
    assert.equal(result.response.status, 401, responseSummary(result));
    assert.equal(result.response.headers.get("cache-control"), "no-store");
    assert.equal(result.response.headers.get("deprecation"), "true");
    assert.equal(result.response.headers.get("x-analysis-migration"), "commercial-workspace");
    assert.deepEqual(result.body, {
      error: "AUTHENTICATION_REQUIRED",
      message: "请登录后进入商业工作台开始分析。",
      next: "/sign-in?redirect_url=%2Fdashboard",
    });
    assert.doesNotMatch(JSON.stringify(result.body), new RegExp(secretContent));
  });
}

console.log(`PASS ${passed} commercial migration black-box checks`);
