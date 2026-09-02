import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

import { runStagingSmoke } from "./staging-smoke.mjs";

function response(body, status = 200) {
  return { status, clone() { return { json: async () => body }; } };
}
const env = { STAGING_SMOKE_CONFIRM: "true", STAGING_BASE_URL: "https://staging.test", STAGING_SMOKE_PLAN: "growth", STAGING_SMOKE_POLL_MS: "0" };

test("refuses without explicit confirmation or HTTPS base URL", async () => {
  await assert.rejects(runStagingSmoke({ env: { STAGING_BASE_URL: "https://staging.test" }, fetchImpl: async () => { throw new Error("network"); } }), /STAGING_SMOKE_CONFIRM_REQUIRED/);
  await assert.rejects(runStagingSmoke({ env: { STAGING_SMOKE_CONFIRM: "true", STAGING_BASE_URL: "http://staging.test" }, fetchImpl: async () => { throw new Error("network"); } }), /STAGING_BASE_URL_HTTPS_REQUIRED/);
});

test("runs fixed flow with fake responses and does not log bodies or secrets", async () => {
  const calls = []; const logs = [];
  const queue = [response({ status: "ok", checks: { commercial: true } }), response({ projects: [], usage: { consumed: 0, limit: 20 } }), response({ project: { id: "project_smoke" } }, 201), response({ checkoutUrl: "https://checkout.test/session" }, 201), response({ run: { id: "run_smoke", status: "queued" } }, 201), response({ run: { id: "run_smoke", status: "queued" } }), response({ run: { id: "run_smoke", status: "running" } }), response({ run: { id: "run_smoke", status: "succeeded" } }), response({ result: "private result body" }), response({ projects: [], usage: { consumed: 1, limit: 20 } }), response({ run: { id: "run_smoke", status: "succeeded" } })];
  const result = await runStagingSmoke({ env, checkConfig: async () => true, fetchImpl: async (url, init) => { calls.push({ url: String(url), init }); return queue.shift(); }, log: (line) => logs.push(line) });
  assert.deepEqual(result, { projectId: "project_smoke", runId: "run_smoke" });
  assert.equal(calls.length, 11);
  assert.deepEqual(calls.map((call) => new URL(call.url).pathname), ["/api/health", "/api/commercial/projects", "/api/commercial/projects", "/api/alipay/checkout", "/api/commercial/projects/project_smoke/analyze", "/api/commercial/runs/run_smoke", "/api/commercial/runs/run_smoke", "/api/commercial/runs/run_smoke", "/api/commercial/runs/run_smoke/result", "/api/commercial/projects", "/api/commercial/runs/run_smoke"]);
  assert.deepEqual(JSON.parse(calls[3].init.body), { plan: "growth" });
  assert.ok(logs.every((line) => !line.includes("private")));
  assert.ok(logs.includes("STAGING SMOKE PASS (not staging acceptance)"));
});

test("fails with stable terminal code without exposing response body", async () => {
  const logs = []; const queue = [response({ status: "ok", checks: { commercial: true } }), response({ projects: [], usage: { consumed: 0, limit: 20 } }), response({ project: { id: "project_smoke" } }, 201), response({ checkoutUrl: "https://checkout.test/session" }, 201), response({ run: { id: "run_smoke", status: "queued" } }, 201), response({ run: { id: "run_smoke", status: "failed", failureCode: "EXECUTION_RETRYABLE" } })];
  await assert.rejects(runStagingSmoke({ env, checkConfig: async () => true, fetchImpl: async () => queue.shift(), log: (line) => logs.push(line) }), /run\/terminal:EXECUTION_RETRYABLE/);
  assert.ok(logs.includes("FAIL run/terminal EXECUTION_RETRYABLE"));
  assert.ok(logs.every((line) => !line.includes("checkout.test")));
});

test("CLI is blocked by default", () => {
  const result = spawnSync(process.execPath, ["scripts/staging-smoke.mjs"], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(`${result.stdout}${result.stderr}`, /STAGING SMOKE BLOCKED STAGING_SMOKE_CONFIRM_REQUIRED/);
});
