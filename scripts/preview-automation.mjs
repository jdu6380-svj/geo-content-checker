export const VERCEL_AUTOMATION_BYPASS_HEADER = "x-vercel-protection-bypass";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function parseUrl(value, label) {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }
}

function isVercelDeploymentHostname(hostname) {
  return hostname.endsWith(".vercel.app") && hostname.length > ".vercel.app".length;
}

export function normalizePreviewUrl(value) {
  const url = parseUrl(value, "preview_url");
  if (url.protocol !== "https:") {
    throw new Error("preview_url must use HTTPS.");
  }
  if (!isVercelDeploymentHostname(url.hostname)) {
    throw new Error("preview_url must target a *.vercel.app deployment.");
  }
  if (url.username || url.password) {
    throw new Error("preview_url must not contain credentials.");
  }
  if ((url.pathname && url.pathname !== "/") || url.search || url.hash) {
    throw new Error("preview_url must be an origin without path, query, or fragment.");
  }
  return url.origin;
}

export function resolveAutomationBypassSecret(baseUrl, environment = process.env) {
  const secret = environment.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (!secret) return undefined;

  const target = parseUrl(baseUrl, "GEO_BASE_URL");
  if (LOCAL_HOSTNAMES.has(target.hostname)) return undefined;
  if (target.protocol === "https:" && isVercelDeploymentHostname(target.hostname)) {
    return secret;
  }

  throw new Error(
    "VERCEL_AUTOMATION_BYPASS_SECRET may only be used with HTTPS *.vercel.app targets.",
  );
}

export function automationBypassHeaders(secret) {
  return secret ? { [VERCEL_AUTOMATION_BYPASS_HEADER]: secret } : {};
}

export function applyAutomationBypassHeader(headers, secret) {
  if (secret) headers.set(VERCEL_AUTOMATION_BYPASS_HEADER, secret);
  return headers;
}

export function withAutomationBypassRequestInit(init = {}, secret) {
  const headers = new Headers(init.headers);
  applyAutomationBypassHeader(headers, secret);
  return { ...init, headers };
}

export function isVercelDeploymentProtectionRedirect(status, location) {
  if (status < 300 || status >= 400 || !location) return false;
  try {
    const url = new URL(location);
    return url.hostname === "vercel.com" && url.pathname === "/sso-api";
  } catch {
    return false;
  }
}

export function validatePreviewDeploymentMetadata(metadata, {
  previewUrl,
  expectedSha,
  expectedBranch,
  expectedProjectId,
}) {
  const normalizedUrl = normalizePreviewUrl(previewUrl);
  const hostname = new URL(normalizedUrl).hostname;
  const projectId = metadata?.projectId ?? metadata?.project?.id;
  const branch = metadata?.meta?.githubCommitRef;
  const sha = metadata?.meta?.githubCommitSha;
  const target = metadata?.target;

  if (typeof metadata?.id !== "string" || !metadata.id.startsWith("dpl_")) {
    throw new Error("Deployment metadata is missing a valid deployment ID.");
  }
  if (metadata.url !== hostname) {
    throw new Error("Deployment URL does not match preview_url.");
  }
  if (projectId !== expectedProjectId) {
    throw new Error("Deployment project does not match VERCEL_PROJECT_ID.");
  }
  if (metadata.source !== "git") {
    throw new Error("Deployment source must be Git.");
  }
  if (metadata.readyState !== "READY") {
    throw new Error("Deployment must be READY.");
  }
  if (target !== null && target !== "preview") {
    throw new Error("Deployment target must be Preview.");
  }
  if (branch !== expectedBranch) {
    throw new Error("Deployment branch does not match the expected Preview branch.");
  }
  if (sha !== expectedSha) {
    throw new Error("Deployment commit SHA does not match expected_sha.");
  }

  return {
    deploymentId: metadata.id,
    target: "preview",
    branch,
    sha,
    status: metadata.readyState,
  };
}
