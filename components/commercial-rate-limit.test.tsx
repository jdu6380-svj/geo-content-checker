import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import {
  CommercialRateLimitedError,
  CommercialUnauthenticatedError,
  type CommercialActor,
} from "@/lib/server/commercial/domain";
import {
  DeterministicCommercialExecutor,
  type CommercialAnalysisExecutor,
} from "@/lib/server/commercial/execution";
import { InMemoryCommercialRepository } from "@/lib/server/commercial/repository";
import {
  getConfiguredCommercialAnalyzeRateLimiter,
  InMemoryCommercialAnalyzeRateLimiter,
  resetCommercialAnalyzeRateLimiterForTests,
  type CommercialAnalyzeRateLimiter,
} from "@/lib/server/commercial/rate-limit";
import { CommercialService } from "@/lib/server/commercial/service";
import type { StorageAdapter } from "@/lib/server/commercial/providers";
import { postCommercialAnalyze } from "@/app/api/commercial/projects/[projectId]/analyze/handler";

const actor: CommercialActor = { subjectId: "user_rate", workspaceId: "workspace_rate", role: "owner" };

function request(body: unknown, idempotencyKey = "rate-limit-key"): NextRequest {
  return new NextRequest("https://example.test/api/commercial/projects/project_rate/analyze", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });
}

function storage(): StorageAdapter {
  return {
    async putResult({ workspaceId, runId }) {
      return { key: `workspaces/${workspaceId}/runs/${runId}/result.json` };
    },
    async getResult() {
      return new Uint8Array();
    },
  };
}

function setup(executor: CommercialAnalysisExecutor = new DeterministicCommercialExecutor()) {
  const service = new CommercialService({ repository: new InMemoryCommercialRepository(2) });
  return service.createProject(actor, { name: "Rate limited project" }).then((project) => ({ service, project, executor }));
}

function dependencies(
  service: CommercialService,
  executor: CommercialAnalysisExecutor,
  limiter: CommercialAnalyzeRateLimiter | null,
) {
  return {
    resolveActor: async () => actor,
    getService: () => service,
    getExecutor: () => executor,
    getStorage: storage,
    getRateLimiter: () => limiter,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  resetCommercialAnalyzeRateLimiterForTests();
});

describe("commercial analyze rate-limit boundary", () => {
  it("checks the authenticated workspace before launching expensive execution", async () => {
    const executor = new DeterministicCommercialExecutor();
    const { service, project } = await setup(executor);
    const limiter: CommercialAnalyzeRateLimiter = {
      check: vi.fn().mockResolvedValue({ allowed: true, mode: "memory", remaining: 5, retryAfter: 0 }),
    };

    const response = await postCommercialAnalyze(
      request({ title: "内容标题", content: "需要发布前审查的内容。" }),
      { params: Promise.resolve({ projectId: project.id }) },
      dependencies(service, executor, limiter),
    );

    expect(response.status).toBe(201);
    expect(limiter.check).toHaveBeenCalledWith({ workspaceId: actor.workspaceId, subjectId: actor.subjectId });
    expect(response.headers.get("x-geo-ratelimit-mode")).toBe("memory");
    expect(response.headers.get("x-geo-ratelimit-remaining")).toBe("5");
  });

  it("returns a stable 429 and Retry-After without invoking the executor", async () => {
    const executor = { execute: vi.fn() } as unknown as CommercialAnalysisExecutor;
    const { service, project } = await setup(executor);
    const limiter: CommercialAnalyzeRateLimiter = {
      check: vi.fn().mockRejectedValue(new CommercialRateLimitedError(17)),
    };

    const response = await postCommercialAnalyze(
      request({ title: "内容标题", content: "需要发布前审查的内容。" }, "rate-limit-denied"),
      { params: Promise.resolve({ projectId: project.id }) },
      dependencies(service, executor, limiter),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("17");
    expect(await response.json()).toEqual({ error: "RATE_LIMITED", message: expect.any(String) });
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it("does not call the limiter before the authentication boundary", async () => {
    const { service, project, executor } = await setup();
    const limiter: CommercialAnalyzeRateLimiter = { check: vi.fn() };
    const response = await postCommercialAnalyze(
      request({ title: "内容标题", content: "需要发布前审查的内容。" }, "unauthenticated-limit"),
      { params: Promise.resolve({ projectId: project.id }) },
      {
        ...dependencies(service, executor, limiter),
        resolveActor: async () => { throw new CommercialUnauthenticatedError(); },
      },
    );

    expect(response.status).toBe(401);
    expect(limiter.check).not.toHaveBeenCalled();
  });

  it("returns a stable retryable 503 when the limiter is unavailable", async () => {
    const executor = { execute: vi.fn() } as unknown as CommercialAnalysisExecutor;
    const { service, project } = await setup(executor);
    const response = await postCommercialAnalyze(
      request({ title: "内容标题", content: "需要发布前审查的内容。" }, "rate-limit-unavailable"),
      { params: Promise.resolve({ projectId: project.id }) },
      dependencies(service, executor, null),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(await response.json()).toEqual({ error: "RATE_LIMIT_UNAVAILABLE", message: expect.any(String) });
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it("fails closed when production has no Redis limiter", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    vi.stubEnv("RATE_LIMIT_SALT", "rate-limit-salt-that-is-long-enough-for-production");
    expect(getConfiguredCommercialAnalyzeRateLimiter()).toBeNull();
  });

  it("fails closed when production Redis is configured without a key salt", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.test");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token-is-not-read-or-logged");
    vi.stubEnv("RATE_LIMIT_SALT", "");
    expect(getConfiguredCommercialAnalyzeRateLimiter()).toBeNull();
  });

  it("uses an isolated bounded in-memory limiter for local fake execution", async () => {
    const limiter = new InMemoryCommercialAnalyzeRateLimiter();
    const now = new Date("2026-08-30T00:00:00.000Z");
    for (let index = 0; index < 6; index += 1) {
      await expect(limiter.check({ workspaceId: "workspace_a", subjectId: "user_a", now })).resolves.toMatchObject({
        allowed: true,
        mode: "memory",
      });
    }
    await expect(limiter.check({ workspaceId: "workspace_a", subjectId: "user_a", now })).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
      retryAfter: expect.any(Number),
    });
    await expect(limiter.check({ workspaceId: "workspace_b", subjectId: "user_a", now })).resolves.toMatchObject({ allowed: true });
  });
});
