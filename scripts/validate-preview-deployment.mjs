import { appendFileSync } from "node:fs";

import {
  normalizePreviewUrl,
  validatePreviewDeploymentMetadata,
} from "./preview-automation.mjs";

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

const expectedSha = requiredEnvironment("EXPECTED_SHA").toLowerCase();
const checkoutSha = requiredEnvironment("CHECKOUT_SHA").toLowerCase();
const expectedBranch = requiredEnvironment("EXPECTED_BRANCH");
const projectId = requiredEnvironment("VERCEL_PROJECT_ID");
const orgId = requiredEnvironment("VERCEL_ORG_ID");
const token = requiredEnvironment("VERCEL_TOKEN");
const configuredPreviewUrl = process.env.PREVIEW_URL?.trim();

if (!/^[0-9a-f]{40}$/.test(expectedSha)) {
  throw new Error("EXPECTED_SHA must be a full 40-character Git commit SHA.");
}
if (checkoutSha !== expectedSha) {
  throw new Error("expected_sha does not match the workflow checkout SHA.");
}

async function vercelRequest(endpoint) {
  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "geo-content-checker-preview-blackbox",
    },
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Vercel deployment lookup failed with HTTP ${response.status}.`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error("Vercel deployment lookup returned invalid JSON.");
  }
}

async function discoverPreviewUrl() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const endpoint = new URL("https://api.vercel.com/v7/deployments");
    endpoint.searchParams.set("teamId", orgId);
    endpoint.searchParams.set("projectId", projectId);
    endpoint.searchParams.set("branch", expectedBranch);
    endpoint.searchParams.set("sha", expectedSha);
    endpoint.searchParams.set("state", "READY");
    endpoint.searchParams.set("limit", "20");
    const payload = await vercelRequest(endpoint);
    const deployment = payload?.deployments?.find((item) =>
      item?.meta?.githubCommitSha === expectedSha &&
      item?.meta?.githubCommitRef === expectedBranch &&
      item?.target !== "production" &&
      typeof item?.url === "string"
    );
    if (deployment) return normalizePreviewUrl(`https://${deployment.url}`);
    if (attempt < 59) await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  throw new Error("Timed out waiting for the matching Git Integration Preview deployment.");
}

const previewUrl = configuredPreviewUrl
  ? normalizePreviewUrl(configuredPreviewUrl)
  : await discoverPreviewUrl();
const hostname = new URL(previewUrl).hostname;
const detailEndpoint = new URL(
  `https://api.vercel.com/v13/deployments/${encodeURIComponent(hostname)}`,
);
detailEndpoint.searchParams.set("teamId", orgId);
const metadata = await vercelRequest(detailEndpoint);

const summary = validatePreviewDeploymentMetadata(metadata, {
  previewUrl,
  expectedSha,
  expectedBranch,
  expectedProjectId: projectId,
});

console.log(`Preview deployment verified: ${JSON.stringify(summary)}`);
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `preview_url=${previewUrl}\ndeployment_id=${summary.deploymentId}\n`,
    "utf8",
  );
}
