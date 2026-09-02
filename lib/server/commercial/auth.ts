import {
  CommercialDataUnavailableError,
  CommercialAuthUnavailableError,
  CommercialUnauthenticatedError,
  CommercialWorkspaceRequiredError,
  commercialIdSchema,
  type CommercialActor,
} from "./domain";
import { getConfiguredCommercialService } from "./service";
import {
  resolveTrustedWorkspaceId,
  type CommercialClerkOrganizationIdentity,
} from "./workspace-onboarding";

export function resolveLocalCommercialActor(request: Request): CommercialActor {
  if (process.env.NODE_ENV === "production" || process.env.COMMERCIAL_AUTH_ADAPTER !== "local") {
    throw new CommercialAuthUnavailableError();
  }

  const subjectId = request.headers.get("x-commercial-subject-id")?.trim();
  const workspaceId = request.headers.get("x-commercial-workspace-id")?.trim();
  const parsedSubject = commercialIdSchema.safeParse(subjectId);
  const parsedWorkspace = commercialIdSchema.safeParse(workspaceId);
  if (!parsedSubject.success || !parsedWorkspace.success) throw new CommercialAuthUnavailableError();

  return { subjectId: parsedSubject.data, workspaceId: parsedWorkspace.data, role: "owner" };
}

export async function resolveCommercialActor(request: Request): Promise<CommercialActor> {
  if (process.env.COMMERCIAL_AUTH_ADAPTER === "local") return resolveLocalCommercialActor(request);
  const identity = await resolveCommercialClerkOrganizationIdentity();
  if (!identity.orgId) throw new CommercialWorkspaceRequiredError();
  const workspaceId = resolveTrustedWorkspaceId(identity.orgId);
  if (!workspaceId) throw new CommercialWorkspaceRequiredError();
  return { subjectId: identity.subjectId, workspaceId, role: identity.orgRole === "org:admin" ? "owner" : "member" };
}

export async function resolveCommercialClerkOrganizationIdentity(): Promise<CommercialClerkOrganizationIdentity> {
  if (process.env.COMMERCIAL_AUTH_ADAPTER !== "clerk") throw new CommercialAuthUnavailableError();
  if (!process.env.CLERK_SECRET_KEY?.trim() || !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim()) throw new CommercialAuthUnavailableError();
  try {
    const { auth } = await import("@clerk/nextjs/server");
    const session = await auth();
    if (!session.userId) throw new CommercialUnauthenticatedError();
    return {
      subjectId: session.userId,
      orgId: session.orgId ?? null,
      orgRole: session.orgRole ?? null,
    };
  } catch (error) {
    if (error instanceof CommercialUnauthenticatedError) throw error;
    throw new CommercialAuthUnavailableError();
  }
}

export async function resolveVerifiedCommercialActor(request: Request): Promise<CommercialActor> {
  const actor = await resolveCommercialActor(request);
  const service = getConfiguredCommercialService();
  if (!service) throw new CommercialDataUnavailableError();
  await service.verifyActor(actor);
  return actor;
}
