import { readFileSync } from "node:fs";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createCommercialOnboardingGet,
  createCommercialOnboardingPost,
} from "@/app/api/commercial/onboarding/handler";
import { CommercialWorkspaceOnboarding } from "@/components/commercial-workspace-onboarding";
import { CommercialUnauthenticatedError } from "@/lib/server/commercial/domain";
import {
  CommercialWorkspaceAdminRequiredError,
  CommercialWorkspaceOnboardingService,
  InMemoryCommercialWorkspaceOnboardingRepository,
  resolveTrustedWorkspaceId,
  type CommercialClerkOrganizationIdentity,
} from "@/lib/server/commercial/workspace-onboarding";
import type { CommercialTelemetryEvent, CommercialTelemetrySink } from "@/lib/server/commercial/observability";

const admin: CommercialClerkOrganizationIdentity = {
  subjectId: "user_admin",
  orgId: "org_content_team",
  orgRole: "org:admin",
};

const member: CommercialClerkOrganizationIdentity = {
  subjectId: "user_member",
  orgId: "org_content_team",
  orgRole: "org:member",
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function dependencies(
  service: CommercialWorkspaceOnboardingService,
  identity: CommercialClerkOrganizationIdentity = admin,
) {
  return { resolveIdentity: async () => identity, service: () => service };
}

beforeEach(() => {
  vi.stubEnv("COMMERCIAL_WORKSPACE_BOOTSTRAP", "clerk-org");
  vi.stubEnv("COMMERCIAL_CLERK_ORG_WORKSPACE_MAP", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("commercial workspace onboarding service", () => {
  it("requires an active organization without creating a fallback workspace", async () => {
    const repository = new InMemoryCommercialWorkspaceOnboardingRepository();
    const service = new CommercialWorkspaceOnboardingService(repository);

    await expect(service.status({ ...admin, orgId: null, orgRole: null })).resolves.toEqual({ state: "organization_required" });
    expect(repository.workspaces.size).toBe(0);
  });

  it("lets an organization admin bootstrap once with zero quota under concurrent replay", async () => {
    const repository = new InMemoryCommercialWorkspaceOnboardingRepository();
    const service = new CommercialWorkspaceOnboardingService(repository);

    const results = await Promise.all([
      service.bootstrap(admin, { intent: "setup" }),
      service.bootstrap(admin, { intent: "setup" }),
    ]);

    expect(results).toEqual([{ state: "ready", role: "owner" }, { state: "ready", role: "owner" }]);
    expect(repository.workspaces.size).toBe(1);
    const workspace = [...repository.workspaces.values()][0];
    expect(workspace.runLimit).toBe(0);
    expect(workspace.members.get(admin.subjectId)).toBe("owner");
    expect(repository.audits).toEqual([
      "commercial.workspace.onboarding_resolved",
      "commercial.workspace.membership_resolved",
    ]);
  });

  it("does not let a non-admin create or self-join a workspace", async () => {
    const repository = new InMemoryCommercialWorkspaceOnboardingRepository();
    const service = new CommercialWorkspaceOnboardingService(repository);

    await expect(service.status(member)).resolves.toEqual({ state: "organization_admin_required", role: "member" });
    await expect(service.bootstrap(member, { intent: "setup" })).rejects.toBeInstanceOf(CommercialWorkspaceAdminRequiredError);
    await service.bootstrap(admin, { intent: "setup" });
    await expect(service.status(member)).resolves.toEqual({ state: "membership_required", role: "member" });
    await expect(service.bootstrap(member, { intent: "setup" })).rejects.toBeInstanceOf(CommercialWorkspaceAdminRequiredError);
  });

  it("derives isolated stable IDs from trusted orgs and preserves explicit legacy mappings", () => {
    const first = resolveTrustedWorkspaceId("org_first", { COMMERCIAL_WORKSPACE_BOOTSTRAP: "clerk-org" });
    const replay = resolveTrustedWorkspaceId("org_first", { COMMERCIAL_WORKSPACE_BOOTSTRAP: "clerk-org" });
    const second = resolveTrustedWorkspaceId("org_second", { COMMERCIAL_WORKSPACE_BOOTSTRAP: "clerk-org" });

    expect(first).toBe(replay);
    expect(first).not.toBe(second);
    expect(first).not.toContain("org_first");
    expect(resolveTrustedWorkspaceId("org_first", {
      COMMERCIAL_WORKSPACE_BOOTSTRAP: "clerk-org",
      COMMERCIAL_CLERK_ORG_WORKSPACE_MAP: "org_first=workspace_existing",
    })).toBe("workspace_existing");
  });

  it("does not auto-promote an admin into a pre-provisioned legacy workspace", async () => {
    const repository = new InMemoryCommercialWorkspaceOnboardingRepository();
    repository.workspaces.set("workspace_existing", { createdBy: "operator", runLimit: 8, members: new Map() });
    const service = new CommercialWorkspaceOnboardingService(repository);
    const identity = { ...admin, orgId: "org_existing" };
    vi.stubEnv("COMMERCIAL_CLERK_ORG_WORKSPACE_MAP", "org_existing=workspace_existing");

    await expect(service.bootstrap(identity, { intent: "setup" })).rejects.toBeInstanceOf(CommercialWorkspaceAdminRequiredError);
    expect(repository.workspaces.get("workspace_existing")?.members.size).toBe(0);
  });
});

describe("commercial onboarding route", () => {
  it("does not accept workspace identity from the request body", async () => {
    const repository = new InMemoryCommercialWorkspaceOnboardingRepository();
    const service = new CommercialWorkspaceOnboardingService(repository);
    const request = new Request("https://app.test/api/commercial/onboarding", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent: "setup", workspaceId: "workspace_attacker" }),
    });

    const result = await createCommercialOnboardingPost(request, dependencies(service));

    expect(result.status).toBe(400);
    expect(await result.json()).toEqual({ error: "INVALID_REQUEST", message: "商业请求格式不正确。" });
    expect(repository.workspaces.size).toBe(0);
  });

  it("reports setup state and bootstraps only from the injected trusted identity", async () => {
    const repository = new InMemoryCommercialWorkspaceOnboardingRepository();
    const service = new CommercialWorkspaceOnboardingService(repository);
    const deps = dependencies(service);

    const status = await createCommercialOnboardingGet(new Request("https://app.test/api/commercial/onboarding"), deps);
    const setup = await createCommercialOnboardingPost(new Request("https://app.test/api/commercial/onboarding", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent: "setup" }),
    }), deps);

    expect(await status.json()).toEqual({ state: "bootstrap_required", role: "owner" });
    expect(await setup.json()).toEqual({ state: "ready", role: "owner" });
  });

  it("returns a stable 401 without exposing auth internals", async () => {
    const repository = new InMemoryCommercialWorkspaceOnboardingRepository();
    const service = new CommercialWorkspaceOnboardingService(repository);
    const result = await createCommercialOnboardingGet(new Request("https://app.test/api/commercial/onboarding"), {
      resolveIdentity: async () => { throw new CommercialUnauthenticatedError(); },
      service: () => service,
    });

    expect(result.status).toBe(401);
    expect(await result.json()).toEqual({ error: "UNAUTHENTICATED", message: "请先登录后再访问商业工作区。" });
  });

  it("records onboarding outcome without identity or provider details", async () => {
    const events: CommercialTelemetryEvent[] = [];
    const telemetry: CommercialTelemetrySink = { emit: (event) => { events.push(event); } };
    const repository = new InMemoryCommercialWorkspaceOnboardingRepository();
    const service = new CommercialWorkspaceOnboardingService(repository);
    const result = await createCommercialOnboardingPost(new Request("https://app.test/api/commercial/onboarding", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent: "setup" }),
    }), { ...dependencies(service), telemetry });
    expect(result.status).toBe(200);
    expect(events.at(-1)).toMatchObject({ event: "commercial_operation", operation: "onboarding", stage: "onboarding_succeeded", status: "succeeded" });
    expect(JSON.stringify(events)).not.toMatch(/user_admin|org_content_team|postgres/);
  });
});

describe("commercial onboarding UX and static boundaries", () => {
  it("guides users without an active organization instead of showing a dead dashboard", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ state: "organization_required" })));
    render(<CommercialWorkspaceOnboarding />);

    expect(await screen.findByText(/请先创建或选择一个 Clerk 组织/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "已选择组织，重新检查" })).toBeTruthy();
  });

  it("sends only setup intent and exposes the dashboard after successful bootstrap", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ state: "bootstrap_required", role: "owner" }))
      .mockResolvedValueOnce(response({ state: "ready", role: "owner" }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CommercialWorkspaceOnboarding />);

    fireEvent.click(await screen.findByRole("button", { name: "创建团队工作区" }));
    expect((await screen.findByRole("link", { name: "进入项目工作台" })).getAttribute("href")).toBe("/dashboard");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/commercial/onboarding");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ intent: "setup" });
    expect(fetchMock.mock.calls[1][1].body).not.toContain("workspace");
  });

  it("maps server failures to safe copy", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ error: "DATA_UNAVAILABLE", message: "postgres-private-detail" }, 503)));
    render(<CommercialWorkspaceOnboarding />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("工作区数据服务暂不可用");
    expect(alert.textContent).not.toContain("postgres-private-detail");
  });

  it("does not offer self-join to a Clerk member without a persisted DB membership", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ state: "membership_required", role: "member" })));
    render(<CommercialWorkspaceOnboarding />);

    expect(await screen.findByText(/请让组织管理员完成工作区成员配置/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "加入当前工作区" })).toBeNull();
  });

  it("keeps auth pages public, protects onboarding, and installs the Clerk provider", () => {
    const root = process.cwd();
    const middleware = readFileSync(`${root}/middleware.ts`, "utf8");
    const layout = readFileSync(`${root}/app/layout.tsx`, "utf8");
    const signIn = readFileSync(`${root}/app/sign-in/[[...sign-in]]/page.tsx`, "utf8");
    const signUp = readFileSync(`${root}/app/sign-up/[[...sign-up]]/page.tsx`, "utf8");
    const neon = readFileSync(`${root}/lib/server/commercial/neon-workspace-onboarding.ts`, "utf8");

    expect(middleware).toContain('"/onboarding(.*)"');
    expect(middleware).not.toContain('"/sign-in(.*)"');
    expect(middleware).not.toContain('"/sign-up(.*)"');
    expect(layout).toContain("<ClerkProvider>");
    expect(signIn).toContain('fallbackRedirectUrl="/onboarding"');
    expect(signUp).toContain('fallbackRedirectUrl="/onboarding"');
    expect(neon).toContain("values (${input.workspaceId}, now(), ${input.subjectId}, 0)");
    expect(neon).toContain("on conflict (id) do nothing");
    expect(neon).toContain("on conflict (workspace_id, subject_id) do update set role = workspace_members.role");
    expect(neon).toContain("commercial.workspace.membership_resolved");
    expect(neon).not.toContain("x-commercial-workspace-id");
  });

  it("keeps configuration-locked entry pages recoverable", () => {
    const root = process.cwd();
    const pages = [
      readFileSync(`${root}/app/sign-in/[[...sign-in]]/page.tsx`, "utf8"),
      readFileSync(`${root}/app/sign-up/[[...sign-up]]/page.tsx`, "utf8"),
      readFileSync(`${root}/app/dashboard/page.tsx`, "utf8"),
      readFileSync(`${root}/app/onboarding/page.tsx`, "utf8"),
    ];
    for (const page of pages) {
      expect(page).toContain('href="/"');
      expect(page).toContain('href="/support"');
    }
  });
});
