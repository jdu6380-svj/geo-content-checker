export const VERCEL_AUTOMATION_BYPASS_HEADER: "x-vercel-protection-bypass";

export interface PreviewDeploymentMetadata {
  id?: string;
  projectId?: string;
  project?: { id?: string };
  url?: string;
  target?: null | string;
  readyState?: string;
  source?: string;
  meta?: {
    githubCommitRef?: string;
    githubCommitSha?: string;
  };
}

export interface PreviewDeploymentSummary {
  deploymentId: string;
  target: "preview";
  branch: string;
  sha: string;
  status: string;
}

export function normalizePreviewUrl(value: string): string;

export function resolveAutomationBypassSecret(
  baseUrl: string,
  environment?: Record<string, string | undefined>,
): string | undefined;

export function automationBypassHeaders(secret?: string): Record<string, string>;

export function applyAutomationBypassHeader<T extends Headers>(
  headers: T,
  secret?: string,
): T;

export function withAutomationBypassRequestInit(
  init?: RequestInit,
  secret?: string,
): RequestInit;

export function isVercelDeploymentProtectionRedirect(
  status: number,
  location: string | null | undefined,
): boolean;

export function validatePreviewDeploymentMetadata(
  metadata: PreviewDeploymentMetadata,
  expectations: {
    previewUrl: string;
    expectedSha: string;
    expectedBranch: string;
    expectedProjectId: string;
  },
): PreviewDeploymentSummary;
