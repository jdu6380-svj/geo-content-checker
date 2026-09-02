import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createRunRecoveryGet, createRunRecoveryPost } from "@/app/api/commercial/operator/runs/handler";
import { CommercialRunRecoveryPanel } from "@/components/commercial-run-recovery-panel";
import type { CommercialActor } from "@/lib/server/commercial/domain";
import {
  CommercialRunRecoveryService,
  InMemoryCommercialRunRecoveryRepository,
} from "@/lib/server/commercial/run-recovery";
import type { CommercialTelemetryEvent, CommercialTelemetrySink } from "@/lib/server/commercial/observability";

const owner: CommercialActor = { subjectId: "owner_1", workspaceId: "workspace_1", role: "owner" };
const otherOwner: CommercialActor = { subjectId: "owner_2", workspaceId: "workspace_2", role: "owner" };

function seed(
  repository: InMemoryCommercialRunRecoveryRepository,
  workspaceId: string,
  runId: string,
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled",
  usageState: "unknown" | "reserved" | "charged" | "released",
  resultRecorded = false,
) {
  repository.seed(workspaceId, {
    runId,
    status,
    usageState,
    resultRecorded,
    createdAt: "2026-08-30T00:00:00.000Z",
  });
}

function getRequest() {
  return new Request("https://app.test/api/commercial/operator/runs");
}

function postRequest(runId: string, action: "cancel_and_release" | "release_reservation", key: string) {
  return new Request("https://app.test/api/commercial/operator/runs", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": key },
    body: JSON.stringify({ runId, action }),
  });
}

function dependencies(repository: InMemoryCommercialRunRecoveryRepository, actor = owner, telemetry?: CommercialTelemetrySink) {
  return {
    resolveActor: async () => actor,
    service: new CommercialRunRecoveryService(repository),
    telemetry,
  };
}

describe("commercial run recovery boundary", () => {
  it("requires an owner and returns a stable safe authorization error", async () => {
    const repository = new InMemoryCommercialRunRecoveryRepository();
    const response = await createRunRecoveryGet(getRequest(), dependencies(repository, { ...owner, role: "member" }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "FORBIDDEN", message: "仅工作区所有者可使用运行恢复能力。" });
  });

  it("lists only the actor workspace and never exposes ownership or result references", async () => {
    const repository = new InMemoryCommercialRunRecoveryRepository();
    seed(repository, owner.workspaceId, "run_visible", "failed", "reserved");
    seed(repository, otherOwner.workspaceId, "run_private", "failed", "reserved");

    const response = await createRunRecoveryGet(getRequest(), dependencies(repository));
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.runs).toHaveLength(1);
    expect(body.runs[0]).toMatchObject({ runId: "run_visible", reconciliation: "reservation_mismatch" });
    expect(body.orphanBlobPolicy).toBe("manual_infrastructure_reconciliation");
    expect(serialized).not.toContain("workspace_1");
    expect(serialized).not.toContain("workspace_2");
    expect(serialized).not.toContain("run_private");
    expect(serialized).not.toContain("resultKey");
  });

  it("releases failed and cancelled reservations idempotently and writes one audit per action", async () => {
    const repository = new InMemoryCommercialRunRecoveryRepository();
    seed(repository, owner.workspaceId, "run_failed", "failed", "reserved");
    seed(repository, owner.workspaceId, "run_cancelled", "cancelled", "reserved");
    const deps = dependencies(repository);

    const first = await createRunRecoveryPost(postRequest("run_failed", "release_reservation", "release_failed"), deps);
    const replay = await createRunRecoveryPost(postRequest("run_failed", "release_reservation", "release_failed"), deps);
    const cancelled = await createRunRecoveryPost(postRequest("run_cancelled", "release_reservation", "release_cancelled"), deps);

    expect(first.status).toBe(200);
    expect(await replay.json()).toEqual(await first.json());
    expect(cancelled.status).toBe(200);
    expect(repository.reserved.get(owner.workspaceId)).toBe(0);
    expect(repository.audits).toEqual([
      { workspaceId: owner.workspaceId, actorId: owner.subjectId, action: "commercial.run.release_reservation", runId: "run_failed" },
      { workspaceId: owner.workspaceId, actorId: owner.subjectId, action: "commercial.run.release_reservation", runId: "run_cancelled" },
    ]);
  });

  it("can terminate an active run once and release its reservation", async () => {
    const repository = new InMemoryCommercialRunRecoveryRepository();
    seed(repository, owner.workspaceId, "run_running", "running", "reserved");

    const response = await createRunRecoveryPost(
      postRequest("run_running", "cancel_and_release", "cancel_running"),
      dependencies(repository),
    );

    expect(response.status).toBe(200);
    expect(repository.runs.get("run_running")).toMatchObject({ status: "cancelled", usageState: "released" });
    expect(repository.reserved.get(owner.workspaceId)).toBe(0);
    expect(repository.audits).toHaveLength(1);
  });

  it("does not release successful or result-recorded runs and keeps them for manual review", async () => {
    const repository = new InMemoryCommercialRunRecoveryRepository();
    seed(repository, owner.workspaceId, "run_succeeded", "succeeded", "charged", true);
    seed(repository, owner.workspaceId, "run_result_mismatch", "failed", "reserved", true);
    const deps = dependencies(repository);

    const succeeded = await createRunRecoveryPost(postRequest("run_succeeded", "release_reservation", "release_success"), deps);
    const mismatch = await createRunRecoveryPost(postRequest("run_result_mismatch", "release_reservation", "release_result"), deps);
    const listed = await createRunRecoveryGet(getRequest(), deps);
    const body = await listed.json();

    expect(succeeded.status).toBe(409);
    expect(mismatch.status).toBe(409);
    expect(repository.runs.get("run_succeeded")).toMatchObject({ status: "succeeded", usageState: "charged" });
    expect(repository.runs.get("run_result_mismatch")).toMatchObject({ status: "failed", usageState: "reserved" });
    expect(body.runs.find((run: { runId: string }) => run.runId === "run_result_mismatch").reconciliation).toBe("manual_review");
    expect(repository.audits).toHaveLength(0);
  });

  it("fails closed across workspaces and rejects conflicting idempotency reuse", async () => {
    const repository = new InMemoryCommercialRunRecoveryRepository();
    seed(repository, otherOwner.workspaceId, "run_other", "failed", "reserved");
    seed(repository, owner.workspaceId, "run_first", "failed", "reserved");
    seed(repository, owner.workspaceId, "run_second", "failed", "reserved");
    const deps = dependencies(repository);

    const crossWorkspace = await createRunRecoveryPost(postRequest("run_other", "release_reservation", "cross_workspace"), deps);
    const first = await createRunRecoveryPost(postRequest("run_first", "release_reservation", "same_key"), deps);
    const conflict = await createRunRecoveryPost(postRequest("run_second", "release_reservation", "same_key"), deps);

    expect(crossWorkspace.status).toBe(404);
    expect(first.status).toBe(200);
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ error: "IDEMPOTENCY_CONFLICT", message: "幂等键已用于不同恢复请求。" });
    expect(repository.runs.get("run_other")).toMatchObject({ usageState: "reserved" });
  });

  it("records recovery success and conflict with safe references", async () => {
    const repository = new InMemoryCommercialRunRecoveryRepository();
    seed(repository, owner.workspaceId, "run_recovery_telemetry", "failed", "reserved");
    const events: CommercialTelemetryEvent[] = [];
    const telemetry: CommercialTelemetrySink = { emit: (event) => { events.push(event); } };
    const deps = dependencies(repository, owner, telemetry);
    const response = await createRunRecoveryPost(postRequest("run_recovery_telemetry", "release_reservation", "recovery_telemetry"), deps);
    expect(response.status).toBe(200);
    expect(events.at(-1)).toMatchObject({ event: "commercial_operation", operation: "recovery", stage: "recovery_succeeded", status: "succeeded" });
    expect(JSON.stringify(events)).not.toMatch(/workspace_1|run_recovery_telemetry/);
  });
});

describe("commercial run recovery panel", () => {
  it("shows safe recovery actions and keeps inconsistent results on the manual path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      runs: [
        { runId: "run_failed", status: "failed", usageState: "reserved", resultRecorded: false, reconciliation: "reservation_mismatch", createdAt: "2026-08-30T00:00:00.000Z" },
        { runId: "run_result", status: "failed", usageState: "reserved", resultRecorded: true, reconciliation: "manual_review", createdAt: "2026-08-30T00:00:00.000Z" },
      ],
      reservedCount: 2,
      observedReservedRuns: 2,
      orphanBlobPolicy: "manual_infrastructure_reconciliation",
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(<CommercialRunRecoveryPanel />);
    fireEvent.click(screen.getByRole("button", { name: "运行故障恢复" }));

    expect(await screen.findByText("占用待释放")).toBeTruthy();
    expect(screen.getByText("需人工基础设施对账")).toBeTruthy();
    expect(screen.getByText(/孤立私有结果只进入人工基础设施对账，不会自动删除/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "释放异常占用" })).toHaveLength(1);
    expect(document.body.textContent).not.toContain("resultKey");
    expect(document.body.textContent).not.toContain("workspace_");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/commercial/operator/runs", { cache: "no-store" }));
  });
});
