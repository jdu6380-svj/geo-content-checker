import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const CONFIG_CHECK = fileURLToPath(new URL("./check-staging-config.mjs", import.meta.url));
const SAFE_ERROR = /^[A-Z][A-Z0-9_]{2,63}$/;
const DEFAULT_PLAN = "growth";
const TERMINAL_RUN_STATES = new Set(["succeeded", "failed", "cancelled"]);

function safeErrorCode(body) {
  return body && typeof body === "object" && typeof body.error === "string" && SAFE_ERROR.test(body.error)
    ? body.error : "UNEXPECTED_STATUS";
}
function isHttps(value) {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}
function authHeaders(env) {
  const headers = {};
  if (env.STAGING_SMOKE_AUTHORIZATION?.trim()) headers.authorization = env.STAGING_SMOKE_AUTHORIZATION.trim();
  if (env.STAGING_SMOKE_COOKIE?.trim()) headers.cookie = env.STAGING_SMOKE_COOKIE.trim();
  return headers;
}
function runConfigCheck(env, spawn = spawnSync) {
  const result = spawn(process.execPath, [CONFIG_CHECK], { env: { ...env }, encoding: "utf8", stdio: ["ignore", "ignore", "ignore"] });
  return result.status === 0;
}
function assertUsage(body) {
  const usage = body && typeof body === "object" ? body.usage : null;
  return Boolean(usage && Number.isSafeInteger(usage.consumed) && usage.consumed >= 0 && Number.isSafeInteger(usage.limit) && usage.limit >= 0 && usage.consumed <= usage.limit);
}

export async function runStagingSmoke({
  env = process.env,
  fetchImpl = globalThis.fetch,
  log = (line) => console.log(line),
  checkConfig = (candidateEnv) => runConfigCheck(candidateEnv),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  if (env.STAGING_SMOKE_CONFIRM !== "true") throw new Error("STAGING_SMOKE_CONFIRM_REQUIRED");
  if (!isHttps(env.STAGING_BASE_URL?.trim())) throw new Error("STAGING_BASE_URL_HTTPS_REQUIRED");
  if (typeof fetchImpl !== "function") throw new Error("FETCH_UNAVAILABLE");
  if (!(await checkConfig(env))) throw new Error("STAGING_CONFIG_INVALID");

  const baseUrl = env.STAGING_BASE_URL.trim().replace(/\/$/, "");
  const commonHeaders = { accept: "application/json", ...authHeaders(env) };
  const request = async (label, path, init = {}, expected = [200]) => {
    const endpoint = new URL(path, `${baseUrl}/`).toString();
    let response;
    try {
      response = await fetchImpl(endpoint, { ...init, headers: { ...commonHeaders, ...(init.headers || {}) } });
    } catch {
      log(`FAIL ${label} NETWORK_ERROR`);
      throw new Error(`${label}:NETWORK_ERROR`);
    }
    let body = null;
    try { body = await response.clone().json(); } catch { /* body intentionally never logged */ }
    const code = safeErrorCode(body);
    if (!expected.includes(response.status)) {
      log(`FAIL ${label} ${response.status} ${code}`);
      throw new Error(`${label}:${code}`);
    }
    log(`PASS ${label} ${response.status}`);
    return body;
  };

  const health = await request("health/readiness", "/api/health");
  if (!health || health.status !== "ok" || !health.checks || Object.values(health.checks).some((value) => value !== true)) {
    throw new Error("health/readiness:INVALID_RESPONSE");
  }
  const projects = await request("clerk/workspace", "/api/commercial/projects");
  if (!projects || !Array.isArray(projects.projects)) throw new Error("clerk/workspace:INVALID_RESPONSE");
  const idempotency = `staging-smoke-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const created = await request("project/create", "/api/commercial/projects", {
    method: "POST", headers: { "content-type": "application/json", "idempotency-key": idempotency }, body: JSON.stringify({ name: "staging smoke project" }),
  }, [201]);
  const projectId = created?.project?.id;
  if (typeof projectId !== "string" || !projectId) throw new Error("project/create:INVALID_RESPONSE");
  const checkout = await request("alipay/checkout", "/api/alipay/checkout", {
    method: "POST", headers: { "content-type": "application/json", "idempotency-key": `${idempotency}-checkout` }, body: JSON.stringify({ plan: env.STAGING_SMOKE_PLAN?.trim() || DEFAULT_PLAN }),
  }, [201]);
  if (!isHttps(checkout?.checkoutUrl)) throw new Error("alipay/checkout:INVALID_RESPONSE");
  if (Object.keys(checkout).some((key) => /customer|subscription|price|workspace|session|sign|trade|order/i.test(key))) throw new Error("alipay/checkout:SENSITIVE_RESPONSE");
  const launched = await request("run/launch", `/api/commercial/projects/${encodeURIComponent(projectId)}/analyze`, {
    method: "POST", headers: { "content-type": "application/json", "idempotency-key": `${idempotency}-run` }, body: JSON.stringify({ title: "staging smoke", content: "staging smoke content" }),
  }, [201]);
  const runId = launched?.run?.id;
  if (typeof runId !== "string" || !runId) throw new Error("run/launch:INVALID_RESPONSE");
  let current = null;
  const maxPolls = Math.max(1, Math.min(20, Number.parseInt(env.STAGING_SMOKE_MAX_POLLS || "6", 10) || 6));
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    current = await request(`run/poll/${attempt + 1}`, `/api/commercial/runs/${encodeURIComponent(runId)}`);
    const status = current?.run?.status;
    if (!["queued", "running", "succeeded", "failed", "cancelled"].includes(status)) throw new Error("run/poll:INVALID_STATUS");
    if (TERMINAL_RUN_STATES.has(status)) break;
    if (attempt + 1 < maxPolls) await sleep(Math.max(0, Number.parseInt(env.STAGING_SMOKE_POLL_MS || "250", 10) || 250));
  }
  if (current?.run?.status !== "succeeded") {
    const failureCode = typeof current?.run?.failureCode === "string" && SAFE_ERROR.test(current.run.failureCode) ? current.run.failureCode : "RUN_NOT_SUCCEEDED";
    log(`FAIL run/terminal ${failureCode}`);
    throw new Error(`run/terminal:${failureCode}`);
  }
  await request("run/result", `/api/commercial/runs/${encodeURIComponent(runId)}/result`);
  const usage = await request("quota/retry", "/api/commercial/projects");
  if (!assertUsage(usage)) throw new Error("quota/retry:INVALID_RESPONSE");
  await request("retry/refresh", `/api/commercial/runs/${encodeURIComponent(runId)}`);
  log("STAGING SMOKE PASS (not staging acceptance)");
  return { projectId, runId };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runStagingSmoke().catch((error) => {
    const code = error instanceof Error ? error.message : "STAGING_SMOKE_FAILED";
    console.error(`STAGING SMOKE BLOCKED ${SAFE_ERROR.test(code) ? code : "CONFIG_OR_GATE_FAILURE"}`);
    process.exitCode = 1;
  });
}
