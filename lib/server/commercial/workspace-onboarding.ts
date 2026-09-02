import { createHash } from "node:crypto";

import {
  CommercialAuthUnavailableError,
  CommercialValidationError,
  commercialIdSchema,
} from "./domain";

export type CommercialClerkOrganizationIdentity = {
  subjectId: string;
  orgId: string | null;
  orgRole: string | null;
};

export type CommercialWorkspaceRole = "owner" | "member";
export type CommercialWorkspaceOnboardingState =
  | "organization_required"
  | "organization_admin_required"
  | "bootstrap_required"
  | "membership_required"
  | "ready";

export type CommercialWorkspaceOnboardingStatus = {
  state: CommercialWorkspaceOnboardingState;
  role?: CommercialWorkspaceRole;
};

export class CommercialWorkspaceAdminRequiredError extends Error {
  readonly code = "WORKSPACE_ADMIN_REQUIRED" as const;
  readonly status = 403 as const;

  constructor() {
    super("需要当前 Clerk 组织管理员先创建工作区。");
    this.name = "CommercialWorkspaceAdminRequiredError";
  }
}

export interface CommercialWorkspaceOnboardingRepository {
  inspect(workspaceId: string, subjectId: string): Promise<{
    workspaceExists: boolean;
    membershipRole: CommercialWorkspaceRole | null;
  }>;
  ensure(input: {
    workspaceId: string;
    subjectId: string;
    role: CommercialWorkspaceRole;
  }): Promise<{ role: CommercialWorkspaceRole }>;
}

type WorkspaceResolutionConfig = {
  COMMERCIAL_CLERK_ORG_WORKSPACE_MAP?: string;
  COMMERCIAL_WORKSPACE_BOOTSTRAP?: string;
};

function readMappings(raw: string | undefined): Map<string, string> {
  const result = new Map<string, string>();
  const workspaces = new Set<string>();
  for (const entry of raw?.split(",").map((value) => value.trim()).filter(Boolean) ?? []) {
    const separator = entry.indexOf("=");
    const orgId = separator > 0 ? entry.slice(0, separator).trim() : "";
    const workspaceId = separator > 0 ? entry.slice(separator + 1).trim() : "";
    if (!/^org_[A-Za-z0-9_-]{1,200}$/.test(orgId) || !commercialIdSchema.safeParse(workspaceId).success || result.has(orgId) || workspaces.has(workspaceId)) {
      throw new CommercialAuthUnavailableError();
    }
    result.set(orgId, workspaceId);
    workspaces.add(workspaceId);
  }
  return result;
}

export function resolveTrustedWorkspaceId(
  orgId: string,
  config: WorkspaceResolutionConfig = {
    COMMERCIAL_CLERK_ORG_WORKSPACE_MAP: process.env.COMMERCIAL_CLERK_ORG_WORKSPACE_MAP,
    COMMERCIAL_WORKSPACE_BOOTSTRAP: process.env.COMMERCIAL_WORKSPACE_BOOTSTRAP,
  },
): string | null {
  if (!/^org_[A-Za-z0-9_-]{1,200}$/.test(orgId)) throw new CommercialAuthUnavailableError();
  const mapped = readMappings(config.COMMERCIAL_CLERK_ORG_WORKSPACE_MAP).get(orgId);
  if (mapped) return mapped;
  const mode = config.COMMERCIAL_WORKSPACE_BOOTSTRAP?.trim();
  if (!mode) return null;
  if (mode !== "clerk-org") throw new CommercialAuthUnavailableError();
  return `workspace_org_${createHash("sha256").update(orgId).digest("hex")}`;
}

function roleFromClerk(orgRole: string | null): CommercialWorkspaceRole | null {
  if (orgRole === "org:admin") return "owner";
  if (orgRole && /^org:[a-z0-9_-]{1,64}$/.test(orgRole)) return "member";
  return null;
}

function validateIdentity(identity: CommercialClerkOrganizationIdentity): void {
  if (!commercialIdSchema.safeParse(identity.subjectId).success) throw new CommercialAuthUnavailableError();
}

export class CommercialWorkspaceOnboardingService {
  constructor(private readonly repository: CommercialWorkspaceOnboardingRepository) {}

  async status(identity: CommercialClerkOrganizationIdentity): Promise<CommercialWorkspaceOnboardingStatus> {
    validateIdentity(identity);
    if (!identity.orgId) return { state: "organization_required" };
    const role = roleFromClerk(identity.orgRole);
    if (!role) throw new CommercialWorkspaceAdminRequiredError();
    const workspaceId = resolveTrustedWorkspaceId(identity.orgId);
    if (!workspaceId) throw new CommercialAuthUnavailableError();
    const current = await this.repository.inspect(workspaceId, identity.subjectId);
    if (current.membershipRole) return { state: "ready", role: current.membershipRole };
    if (current.workspaceExists) return { state: "membership_required", role };
    return role === "owner" ? { state: "bootstrap_required", role } : { state: "organization_admin_required", role };
  }

  async bootstrap(identity: CommercialClerkOrganizationIdentity, body: unknown): Promise<CommercialWorkspaceOnboardingStatus> {
    validateIdentity(identity);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new CommercialValidationError();
    const value = body as Record<string, unknown>;
    if (value.intent !== "setup" || Object.keys(value).some((key) => key !== "intent")) throw new CommercialValidationError();
    if (!identity.orgId) throw new CommercialWorkspaceAdminRequiredError();
    const role = roleFromClerk(identity.orgRole);
    if (!role) throw new CommercialWorkspaceAdminRequiredError();
    const workspaceId = resolveTrustedWorkspaceId(identity.orgId);
    if (!workspaceId) throw new CommercialAuthUnavailableError();
    const current = await this.repository.inspect(workspaceId, identity.subjectId);
    // Clerk organization membership is not a database membership grant. Only an
    // organization admin may perform the explicit bootstrap; ordinary members
    // remain fail-closed until an operator/admin provisions their DB row.
    if (current.membershipRole) return { state: "ready", role: current.membershipRole };
    if (role !== "owner" || current.workspaceExists) throw new CommercialWorkspaceAdminRequiredError();
    const ensured = await this.repository.ensure({ workspaceId, subjectId: identity.subjectId, role: "owner" });
    return { state: "ready", role: ensured.role };
  }
}

type MemoryWorkspace = { createdBy: string; runLimit: number; members: Map<string, CommercialWorkspaceRole> };

export class InMemoryCommercialWorkspaceOnboardingRepository implements CommercialWorkspaceOnboardingRepository {
  readonly workspaces = new Map<string, MemoryWorkspace>();
  readonly audits: string[] = [];

  async inspect(workspaceId: string, subjectId: string) {
    const workspace = this.workspaces.get(workspaceId);
    return { workspaceExists: Boolean(workspace), membershipRole: workspace?.members.get(subjectId) ?? null };
  }

  async ensure(input: { workspaceId: string; subjectId: string; role: CommercialWorkspaceRole }) {
    let workspace = this.workspaces.get(input.workspaceId);
    if (!workspace) {
      workspace = { createdBy: input.subjectId, runLimit: 0, members: new Map() };
      this.workspaces.set(input.workspaceId, workspace);
      this.audits.push("commercial.workspace.onboarding_resolved");
    }
    if (!workspace.members.has(input.subjectId)) {
      workspace.members.set(input.subjectId, input.role);
      this.audits.push("commercial.workspace.membership_resolved");
    }
    return { role: workspace.members.get(input.subjectId) as CommercialWorkspaceRole };
  }
}
