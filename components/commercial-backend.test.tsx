import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import {
  CommercialIdempotencyConflictError,
  CommercialQuotaExceededError,
} from "@/lib/server/commercial/domain";
import { InMemoryCommercialRepository } from "@/lib/server/commercial/repository";
import { CommercialService, getLocalCommercialService } from "@/lib/server/commercial/service";
import { GET as listProjects, POST as createProject } from "@/app/api/commercial/projects/route";
import { getCommercialProjects } from "@/app/api/commercial/projects/handler";
import { POST as createRun } from "@/app/api/commercial/runs/route";
import { getCommercialResult } from "@/app/api/commercial/runs/[runId]/result/handler";
import type { PaymentAdapter, StorageAdapter } from "@/lib/server/commercial/providers";
import { getSubscriptionGet } from "@/app/api/stripe/subscription/handler";
import type { CommercialTelemetryEvent, CommercialTelemetrySink } from "@/lib/server/commercial/observability";

const actor = { subjectId: "user_1", workspaceId: "workspace_1", role: "owner" as const };

afterEach(() => {
  delete process.env.COMMERCIAL_AUTH_ADAPTER;
  delete process.env.COMMERCIAL_DATA_ADAPTER;
  delete process.env.COMMERCIAL_RUN_LIMIT;
});

beforeEach(() => {
  process.env.COMMERCIAL_AUTH_ADAPTER = "local";
  process.env.COMMERCIAL_DATA_ADAPTER = "memory";
  process.env.COMMERCIAL_RUN_LIMIT = "1";
});

function routeRequest(
  path: string,
  options: { workspaceId?: string; subjectId?: string; body?: string; idempotencyKey?: string } = {},
): NextRequest {
  const headers = new Headers({
    ...(options.workspaceId ? { "x-commercial-workspace-id": options.workspaceId } : {}),
    ...(options.subjectId ? { "x-commercial-subject-id": options.subjectId } : {}),
    ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
    ...(options.idempotencyKey ? { "idempotency-key": options.idempotencyKey } : {}),
  });
  return new NextRequest(`https://example.test${path}`, {
    method: options.body === undefined ? "GET" : "POST",
    headers,
    body: options.body,
  });
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function expectErrorBody(body: Record<string, unknown>, code: string): void {
  expect(body).toEqual({ error: code, message: expect.any(String) });
}

describe("commercial backend local slice", () => {
  it("keeps projects and runs tenant-scoped and persists them in the adapter", async () => {
    const service = new CommercialService({ repository: new InMemoryCommercialRepository(2) });
    const project = await service.createProject(actor, { name: "First project" }, "project-key");
    const sameProject = await service.createProject(actor, { name: "First project" }, "project-key");
    expect(sameProject.id).toBe(project.id);
    const run = await service.createRun(actor, { projectId: project.id }, "run-key");
    expect(run.workspaceId).toBe(actor.workspaceId);
    expect(await service.usage(actor)).toMatchObject({ consumed: 0, limit: 2 });
    expect(await service.listProjects({ ...actor, workspaceId: "other_workspace" })).toEqual([]);
  });

  it("lists project history newest-first with a safe result availability flag", async () => {
    const service = new CommercialService({ repository: new InMemoryCommercialRepository(4) });
    const project = await service.createProject(actor, { name: "History project" });
    const first = await service.createRun(actor, { projectId: project.id }, "history-first");
    await service.transitionRun(actor, first.id, "queued", "running");
    await service.transitionRun(actor, first.id, "running", "succeeded", { resultKey: "private/blob-key" });
    const second = await service.createRun(actor, { projectId: project.id }, "history-second");
    const listed = await service.listRuns(actor, project.id);
    expect(listed).toHaveLength(2);
    expect(listed.map((run) => run.id)).toEqual([...listed].sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id)).map((run) => run.id));
    expect(listed.find((run) => run.id === first.id)?.resultKey).toBe("private/blob-key");
    expect(await service.listRuns({ ...actor, workspaceId: "other_workspace" }, project.id)).toEqual([]);
  });

  it("returns project history without result keys through the HTTP contract", async () => {
    const service = new CommercialService({ repository: new InMemoryCommercialRepository(2) });
    const project = await service.createProject(actor, { name: "Route history" });
    const run = await service.createRun(actor, { projectId: project.id }, "route-history");
    await service.transitionRun(actor, run.id, "queued", "running");
    await service.transitionRun(actor, run.id, "running", "succeeded", { resultKey: "private/secret" });
    const response = await getCommercialProjects(
      routeRequest("/api/commercial/projects", { workspaceId: actor.workspaceId, subjectId: actor.subjectId }),
      { resolveActor: async () => actor, getService: () => service },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.history).toEqual([{ projectId: project.id, runs: [{
      id: run.id,
      workspaceId: actor.workspaceId,
      projectId: project.id,
      status: "succeeded",
      createdBy: actor.subjectId,
      createdAt: expect.any(String),
      resultAvailable: true,
    }] }]);
    expect(JSON.stringify(body)).not.toContain("private/secret");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("applies the conservative history limit", async () => {
    const service = new CommercialService({ repository: new InMemoryCommercialRepository(30) });
    const project = await service.createProject(actor, { name: "History limit" });
    for (let index = 0; index < 21; index += 1) {
      await service.createRun(actor, { projectId: project.id }, `history-limit-${index}`);
    }
    expect(await service.listRuns(actor, project.id)).toHaveLength(20);
  });

  it("rejects a reused idempotency key with a different request", async () => {
    const service = new CommercialService({ repository: new InMemoryCommercialRepository(2) });
    await service.createProject(actor, { name: "First project" }, "project-key");
    await expect(service.createProject(actor, { name: "Other project" }, "project-key")).rejects.toThrowError(
      CommercialIdempotencyConflictError,
    );
  });

  it("does not consume quota when an idempotent run is replayed and fails closed at the limit", async () => {
    const service = new CommercialService({ repository: new InMemoryCommercialRepository(1) });
    const project = await service.createProject(actor, { name: "First project" });
    const first = await service.createRun(actor, { projectId: project.id }, "run-key");
    const replay = await service.createRun(actor, { projectId: project.id }, "run-key");
    expect(replay.id).toBe(first.id);
    expect((await service.usage(actor)).consumed).toBe(0);
    await expect(service.createRun(actor, { projectId: project.id }, "other-run-key")).rejects.toThrowError(
      CommercialQuotaExceededError,
    );
  });

  it("does not reuse a memory service when the configured quota changes", () => {
    const first = getLocalCommercialService();
    process.env.COMMERCIAL_RUN_LIMIT = "2";
    const second = getLocalCommercialService();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
  });

  describe("route HTTP contract", () => {
    it("returns a stable 503 auth error when the actor boundary is missing", async () => {
      const response = await listProjects(routeRequest("/api/commercial/projects"));
      expect(response.status).toBe(503);
      expectErrorBody(await responseJson(response), "AUTH_UNAVAILABLE");
    });

    it("returns a distinct 503 data error when the data adapter is not configured", async () => {
      delete process.env.COMMERCIAL_DATA_ADAPTER;
      const response = await listProjects(routeRequest("/api/commercial/projects", {
        workspaceId: "route_data_missing",
        subjectId: "user_route_data_missing",
      }));
      expect(response.status).toBe(503);
      expectErrorBody(await responseJson(response), "DATA_UNAVAILABLE");
    });

    it("returns a workspace-derived subscription without provider identifiers", async () => {
      const getSubscription = vi.fn<PaymentAdapter["getSubscription"]>().mockResolvedValue({
        workspaceId: "workspace_1",
        customerId: "cus_private",
        subscriptionId: "sub_private",
        status: "active",
        priceId: "price_private",
        currentPeriodEnd: "2099-01-01T00:00:00.000Z",
        updatedAt: "2026-08-30T00:00:00.000Z",
        eventCreated: 10,
        entitlementRunLimit: 20,
      });
      const adapter: PaymentAdapter = {
        createCheckoutSession: vi.fn(),
        createPortalSession: vi.fn(),
        handleWebhook: vi.fn(),
        getSubscription,
      };
      const response = await getSubscriptionGet(
        routeRequest("/api/stripe/subscription", { workspaceId: actor.workspaceId, subjectId: actor.subjectId }),
        { resolveActor: async () => actor, getAdapter: () => adapter },
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual({ subscription: {
        status: "active",
        currentPeriodEnd: "2099-01-01T00:00:00.000Z",
        updatedAt: "2026-08-30T00:00:00.000Z",
        eventCreated: 10,
        entitlementRunLimit: 20,
      } });
      expect(getSubscription).toHaveBeenCalledWith(actor.workspaceId);
      expect(JSON.stringify(body)).not.toMatch(/cus_private|sub_private|price_private|workspace_1/);
      expect(response.headers.get("cache-control")).toBe("no-store");
    });

    it("fails closed when subscription payment configuration is unavailable", async () => {
      const response = await getSubscriptionGet(
        routeRequest("/api/stripe/subscription", { workspaceId: actor.workspaceId, subjectId: actor.subjectId }),
        { resolveActor: async () => actor, getAdapter: () => null },
      );
      expect(response.status).toBe(503);
      expectErrorBody(await responseJson(response), "PAYMENT_UNAVAILABLE");
    });

    it("validates JSON and creates an idempotent project response", async () => {
      const invalid = await createProject(routeRequest("/api/commercial/projects", {
        workspaceId: "route_validation",
        subjectId: "user_route_validation",
        body: "{",
      }));
      expect(invalid.status).toBe(400);
      expectErrorBody(await responseJson(invalid), "INVALID_REQUEST");

      const requestOptions = {
        workspaceId: "route_projects",
        subjectId: "user_route_projects",
        body: JSON.stringify({ name: "Route project" }),
        idempotencyKey: "project-route-key",
      };
      const first = await createProject(routeRequest("/api/commercial/projects", requestOptions));
      const replay = await createProject(routeRequest("/api/commercial/projects", requestOptions));
      expect(first.status).toBe(201);
      expect(replay.status).toBe(201);
      expect((await responseJson(replay)).project).toEqual((await responseJson(first)).project);

      const conflict = await createProject(routeRequest("/api/commercial/projects", {
        ...requestOptions,
        body: JSON.stringify({ name: "Different project" }),
      }));
      expect(conflict.status).toBe(409);
      expectErrorBody(await responseJson(conflict), "IDEMPOTENCY_CONFLICT");
    });

    it("rejects direct queued-run creation so reservations only come from analysis orchestration", async () => {
      const response = await createRun();
      expect(response.status).toBe(409);
      expectErrorBody(await responseJson(response), "ANALYSIS_LAUNCH_REQUIRED");
    });

    it("does not read a result blob before a run is succeeded", async () => {
      const service = new CommercialService({ repository: new InMemoryCommercialRepository(2) });
      const project = await service.createProject(actor, { name: "Result gate" });
      const run = await service.createRun(actor, { projectId: project.id }, "result-gate");
      const getResult = vi.fn<StorageAdapter["getResult"]>();
      const response = await getCommercialResult(
        routeRequest(`/api/commercial/runs/${run.id}/result`, { workspaceId: actor.workspaceId, subjectId: actor.subjectId }),
        { params: Promise.resolve({ runId: run.id }) },
        { resolveActor: async () => actor, getService: () => service, getStorage: () => ({ putResult: vi.fn(), getResult }) },
      );

      expect(response.status).toBe(409);
      expectErrorBody(await responseJson(response), "RESULT_NOT_READY");
      expect(getResult).not.toHaveBeenCalled();
    });

    it("emits safe result-read telemetry for not-ready and storage failures", async () => {
      const service = new CommercialService({ repository: new InMemoryCommercialRepository(2) });
      const project = await service.createProject(actor, { name: "Telemetry result" });
      const run = await service.createRun(actor, { projectId: project.id }, "telemetry-result");
      const events: CommercialTelemetryEvent[] = [];
      const telemetry: CommercialTelemetrySink = { emit: (event) => { events.push(event); } };
      const dependencies = {
        resolveActor: async () => actor,
        getService: () => service,
        getStorage: () => ({ putResult: vi.fn(), getResult: vi.fn().mockRejectedValue(new Error("blob key secret")) }),
        telemetry,
      };

      const notReady = await getCommercialResult(
        routeRequest(`/api/commercial/runs/${run.id}/result`, { workspaceId: actor.workspaceId, subjectId: actor.subjectId }),
        { params: Promise.resolve({ runId: run.id }) },
        dependencies,
      );
      expect(notReady.status).toBe(409);
      expect(events.at(-1)).toMatchObject({ stage: "result_read_not_ready", errorCode: "RESULT_NOT_READY" });

      await service.transitionRun(actor, run.id, "queued", "running");
      await service.transitionRun(actor, run.id, "running", "succeeded", { resultKey: "private/blob/key" });
      const failed = await getCommercialResult(
        routeRequest(`/api/commercial/runs/${run.id}/result`, { workspaceId: actor.workspaceId, subjectId: actor.subjectId }),
        { params: Promise.resolve({ runId: run.id }) },
        dependencies,
      );
      expect(failed.status).toBe(500);
      expect(events.at(-1)).toMatchObject({ stage: "result_read_failed", errorCode: "INTERNAL_ERROR" });
      expect(JSON.stringify(events)).not.toMatch(/workspace_1|private\/blob\/key|blob key secret/);
    });

    it("reads a succeeded result only through the current workspace boundary", async () => {
      const service = new CommercialService({ repository: new InMemoryCommercialRepository(2) });
      const project = await service.createProject(actor, { name: "Private result" });
      const run = await service.createRun(actor, { projectId: project.id }, "private-result");
      await service.transitionRun(actor, run.id, "queued", "running");
      await service.transitionRun(actor, run.id, "running", "succeeded", { resultKey: "workspaces/workspace_1/runs/result/result.bin" });
      const getResult = vi.fn<StorageAdapter["getResult"]>().mockResolvedValue(new TextEncoder().encode('{"score":82}'));
      const dependencies = { resolveActor: async () => actor, getService: () => service, getStorage: () => ({ putResult: vi.fn(), getResult }) };

      const success = await getCommercialResult(
        routeRequest(`/api/commercial/runs/${run.id}/result`, { workspaceId: actor.workspaceId, subjectId: actor.subjectId }),
        { params: Promise.resolve({ runId: run.id }) },
        dependencies,
      );
      expect(success.status).toBe(200);
      expect(await success.text()).toBe('{"score":82}');
      expect(getResult).toHaveBeenCalledWith({ workspaceId: actor.workspaceId, runId: run.id });

      const otherActor = { ...actor, subjectId: "user_2", workspaceId: "workspace_2" };
      const crossWorkspace = await getCommercialResult(
        routeRequest(`/api/commercial/runs/${run.id}/result`, { workspaceId: otherActor.workspaceId, subjectId: otherActor.subjectId }),
        { params: Promise.resolve({ runId: run.id }) },
        { ...dependencies, resolveActor: async () => otherActor },
      );
      expect(crossWorkspace.status).toBe(404);
      expectErrorBody(await responseJson(crossWorkspace), "NOT_FOUND");
      expect(getResult).toHaveBeenCalledTimes(1);
    });
  });
});
