import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { postCommercialRunCancel } from "@/app/api/commercial/runs/[runId]/cancel/handler";
import type { CommercialActor } from "@/lib/server/commercial/domain";
import { InMemoryCommercialRepository } from "@/lib/server/commercial/repository";
import { CommercialService } from "@/lib/server/commercial/service";
import { CommercialDashboard } from "@/components/commercial-dashboard";

const actor: CommercialActor = { subjectId: "member_cancel", workspaceId: "workspace_cancel", role: "member" };
const otherActor: CommercialActor = { subjectId: "member_other", workspaceId: "workspace_other", role: "member" };

function cancelRequest(runId: string, idempotencyKey: string): NextRequest {
  return new NextRequest(`https://app.test/api/commercial/runs/${runId}/cancel`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify({ intent: "cancel" }),
  });
}

function routeDependencies(service: CommercialService, resolvedActor: CommercialActor = actor) {
  return {
    resolveActor: async () => resolvedActor,
    getService: () => service,
  };
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("commercial queued cancellation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("cancels a queued run, releases its reservation, and keeps the operation replay-safe", async () => {
    const service = new CommercialService({ repository: new InMemoryCommercialRepository(1) });
    const project = await service.createProject(actor, { name: "Queued cancellation" });
    const run = await service.createRun(actor, { projectId: project.id }, "run-to-cancel");

    const first = await postCommercialRunCancel(
      cancelRequest(run.id, "cancel-key"),
      { params: Promise.resolve({ runId: run.id }) },
      routeDependencies(service),
    );
    const replay = await postCommercialRunCancel(
      cancelRequest(run.id, "cancel-key"),
      { params: Promise.resolve({ runId: run.id }) },
      routeDependencies(service),
    );

    const firstBody = await json(first);
    const replayBody = await json(replay);
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(firstBody.run).toMatchObject({ id: run.id, status: "cancelled", failureCode: "USER_CANCELLED" });
    expect(replayBody).toEqual(firstBody);
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect((await service.usage(actor)).consumed).toBe(0);

    const replacement = await service.createRun(actor, { projectId: project.id }, "replacement");
    expect(replacement.status).toBe("queued");
    await expect(service.createRun(actor, { projectId: project.id }, "over-limit")).rejects.toMatchObject({ code: "USAGE_QUOTA_EXCEEDED" });
  });

  it("rejects running cancellation without releasing its reservation", async () => {
    const service = new CommercialService({ repository: new InMemoryCommercialRepository(1) });
    const project = await service.createProject(actor, { name: "Running cancellation" });
    const run = await service.createRun(actor, { projectId: project.id }, "running");
    await expect(service.transitionRun(actor, run.id, "queued", "running")).resolves.toMatchObject({ status: "running" });

    const response = await postCommercialRunCancel(
      cancelRequest(run.id, "running-cancel"),
      { params: Promise.resolve({ runId: run.id }) },
      routeDependencies(service),
    );

    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({ error: "RUN_NOT_CANCELLABLE", message: expect.any(String) });
    expect((await service.getRun(actor, run.id))?.status).toBe("running");
    await expect(service.createRun(actor, { projectId: project.id }, "over-limit")).rejects.toMatchObject({ code: "USAGE_QUOTA_EXCEEDED" });
  });

  it("fails closed for cross-workspace access and conflicting idempotency reuse", async () => {
    const service = new CommercialService({ repository: new InMemoryCommercialRepository(2) });
    const project = await service.createProject(actor, { name: "Workspace isolation" });
    const run = await service.createRun(actor, { projectId: project.id }, "cross-workspace");

    const crossWorkspace = await postCommercialRunCancel(
      cancelRequest(run.id, "other-workspace-key"),
      { params: Promise.resolve({ runId: run.id }) },
      routeDependencies(service, otherActor),
    );
    expect(crossWorkspace.status).toBe(404);

    const secondProject = await service.createProject(actor, { name: "Second project" });
    const secondRun = await service.createRun(actor, { projectId: secondProject.id }, "second-run");
    const first = await postCommercialRunCancel(
      cancelRequest(run.id, "shared-key"),
      { params: Promise.resolve({ runId: run.id }) },
      routeDependencies(service),
    );
    const conflict = await postCommercialRunCancel(
      cancelRequest(secondRun.id, "shared-key"),
      { params: Promise.resolve({ runId: secondRun.id }) },
      routeDependencies(service),
    );

    expect(first.status).toBe(200);
    expect(conflict.status).toBe(409);
    expect(await json(conflict)).toEqual({ error: "IDEMPOTENCY_CONFLICT", message: expect.any(String) });
    expect((await service.getRun(actor, secondRun.id))?.status).toBe("queued");
  });
});

describe("CommercialDashboard queued cancellation", () => {
  it("shows queued cancellation feedback and keeps running cancellation locked", async () => {
    const project = {
      id: "project_cancel_ui",
      workspaceId: "workspace_cancel_ui",
      name: "内容审查项目",
      createdBy: "member_cancel_ui",
      createdAt: "2026-08-30T00:00:00.000Z",
    };
    const queuedRun = {
      id: "run_ui_queued",
      workspaceId: project.workspaceId,
      projectId: project.id,
      status: "queued",
      createdBy: project.createdBy,
      createdAt: project.createdAt,
      resultAvailable: false,
    };
    const runningRun = {
      ...queuedRun,
      id: "run_ui_running",
      status: "running",
    };
    const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ projects: [project], usage: { workspaceId: project.workspaceId, consumed: 0, limit: 3 }, history: [{ projectId: project.id, runs: [queuedRun, runningRun] }] }))
      .mockResolvedValueOnce(response({ subscription: null }))
      .mockResolvedValueOnce(response({ plans: [] }))
      .mockResolvedValueOnce(response({ run: { ...queuedRun, status: "cancelled" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(<CommercialDashboard />);
    expect(await screen.findByText("排队中")).toBeTruthy();
    expect(screen.getByText("正在分析，暂不可取消")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "取消本次分析" })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "取消本次分析" }));
    expect(await screen.findByText("本次分析已取消，可重新提交内容。")).toBeTruthy();
    await waitFor(() => expect(fetchMock.mock.calls[3][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ intent: "cancel" }),
    }));
    expect(fetchMock.mock.calls[3][1].headers["Idempotency-Key"]).toEqual(expect.any(String));
    expect(screen.queryByRole("button", { name: "取消本次分析" })).toBeNull();
  });
});
