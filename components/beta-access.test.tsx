import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { BetaAccessService, InMemoryBetaAccessRepository } from "@/lib/server/commercial/beta-access";

const owner = { subjectId: "user_operator", workspaceId: "workspace_beta", role: "owner" as const };

afterEach(() => vi.unstubAllEnvs());

describe("invite-only Beta access", () => {
  it("requires an allowlisted owner and rejects members", async () => {
    vi.stubEnv("NEXT_PUBLIC_EVIDRA_BETA_MODE", "true");
    vi.stubEnv("EVIDRA_BETA_OPERATOR_SUBJECTS", owner.subjectId);
    const service = new BetaAccessService(new InMemoryBetaAccessRepository());
    const input = { workspaceId: owner.workspaceId, runLimit: 10, expiresAt: "2026-10-31T00:00:00.000Z", idempotencyKey: "invite-1" };

    await expect(service.grant({ ...owner, role: "member" }, input)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(service.grant({ ...owner, subjectId: "user_other" }, input)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("fails closed when the deployment is not in Beta mode", async () => {
    vi.stubEnv("EVIDRA_BETA_OPERATOR_SUBJECTS", owner.subjectId);
    const service = new BetaAccessService(new InMemoryBetaAccessRepository());
    await expect(service.grant(owner, { workspaceId: owner.workspaceId, runLimit: 10, expiresAt: "2026-10-31T00:00:00.000Z", idempotencyKey: "disabled" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("creates one bounded grant and replays the same operation idempotently", async () => {
    vi.stubEnv("NEXT_PUBLIC_EVIDRA_BETA_MODE", "true");
    vi.stubEnv("EVIDRA_BETA_OPERATOR_SUBJECTS", owner.subjectId);
    const repository = new InMemoryBetaAccessRepository();
    const service = new BetaAccessService(repository);
    const input = { workspaceId: owner.workspaceId, runLimit: 10, expiresAt: "2026-10-31T00:00:00.000Z", idempotencyKey: "invite-1" };

    const first = await service.grant(owner, input);
    const replay = await service.grant(owner, input);

    expect(replay).toEqual(first);
    expect(repository.grants.size).toBe(1);
    expect(first).toMatchObject({ workspaceId: owner.workspaceId, runLimit: 10, expiresAt: "2026-10-31T00:00:00.000Z" });
    await expect(service.grant(owner, { ...input, runLimit: 11 })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("rejects expired, excessive, and cross-workspace grants", async () => {
    vi.stubEnv("NEXT_PUBLIC_EVIDRA_BETA_MODE", "true");
    vi.stubEnv("EVIDRA_BETA_OPERATOR_SUBJECTS", owner.subjectId);
    const service = new BetaAccessService(new InMemoryBetaAccessRepository());
    await expect(service.grant(owner, { workspaceId: owner.workspaceId, runLimit: 10, expiresAt: "2020-01-01T00:00:00.000Z", idempotencyKey: "expired" })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(service.grant(owner, { workspaceId: owner.workspaceId, runLimit: 10_001, expiresAt: "2026-10-01T00:00:00.000Z", idempotencyKey: "large" })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(service.grant(owner, { workspaceId: "workspace_other", runLimit: 10, expiresAt: "2026-10-01T00:00:00.000Z", idempotencyKey: "cross" })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("keeps Beta grants separate from payment orders", async () => {
    const source = await readFile(resolve(process.cwd(), "lib/server/commercial/beta-access.ts"), "utf8");
    expect(source).toContain("beta_access_grants");
    expect(source).not.toContain("payment_orders");
    expect(source).not.toContain("payment_entitlements");
  });
});
