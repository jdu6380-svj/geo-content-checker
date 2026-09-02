import { describe, expect, it } from "vitest";

import {
  CommercialExecutionFailedError,
  type CommercialActor,
} from "@/lib/server/commercial/domain";
import {
  CommercialAnalysisOrchestrator,
  type CommercialAnalysisExecutor,
  type CommercialAnalysisResult,
} from "@/lib/server/commercial/execution";
import { InMemoryCommercialRepository } from "@/lib/server/commercial/repository";
import { CommercialService } from "@/lib/server/commercial/service";
import type { StorageAdapter } from "@/lib/server/commercial/providers";

const actor: CommercialActor = { subjectId: "member_cancel", workspaceId: "workspace_cancel", role: "member" };

function analysisResult(): CommercialAnalysisResult {
  return {
    source: "deterministic",
    contentDigest: "digest",
    contentLength: 1,
    score: 1,
    diagnostics: { status: "available", issueCount: 0 },
    patch: { status: "not_generated" },
    analysis: {
      scoring: {
        totalScore: 1,
        source: "fallback",
        numbered_paragraphs: [],
        dimensions: {
          questionCoverage: { score: 1, max: 35, reason: "" },
          factCompleteness: { score: 0, max: 30, reason: "" },
          structureClarity: { score: 0, max: 20, reason: "" },
          freshness: { score: 0, max: 15, reason: "" },
        },
      },
      questions: { questions: ["一", "二", "三", "四", "五"], source: "fallback" },
      diagnostics: [],
      patch: { mode: "advice", source: "fallback", markdown: "", actions: [] },
    },
  };
}

class DeferredExecutor implements CommercialAnalysisExecutor {
  started: Promise<void>;
  private resolveStarted!: () => void;
  private resolveResult!: (value: CommercialAnalysisResult) => void;

  constructor() {
    this.started = new Promise((resolve) => { this.resolveStarted = resolve; });
  }

  release(): void {
    this.resolveResult(analysisResult());
  }

  async execute(): Promise<CommercialAnalysisResult> {
    this.resolveStarted();
    return new Promise((resolve) => { this.resolveResult = resolve; });
  }
}

function storageFake() {
  const writes: Array<{ workspaceId: string; runId: string }> = [];
  const storage: StorageAdapter = {
    async putResult({ workspaceId, runId }) {
      writes.push({ workspaceId, runId });
      return { key: `private/${workspaceId}/${runId}/result.json` };
    },
    async getResult() {
      return new Uint8Array();
    },
  };
  return { storage, writes };
}

async function waitForRunning(service: CommercialService, projectId: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const run = (await service.listRuns(actor, projectId))[0];
    if (run?.status === "running") return run;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("run did not enter running state");
}

describe("commercial user cancellation safety audit", () => {
  it("can release a queued reservation for a member without charging", async () => {
    const service = new CommercialService({ repository: new InMemoryCommercialRepository(1) });
    const project = await service.createProject(actor, { name: "Queued cancellation" });
    const run = await service.createRun(actor, { projectId: project.id }, "queued-cancel");

    await expect(service.transitionRun(actor, run.id, "queued", "cancelled", { failureCode: "USER_CANCELLED" }))
      .resolves.toMatchObject({ status: "cancelled" });
    expect((await service.usage(actor)).consumed).toBe(0);
    expect((await service.getRun(actor, run.id))?.resultKey).toBeUndefined();
  });

  it("reproduces the running cancellation race that can orphan a Blob result", async () => {
    const service = new CommercialService({ repository: new InMemoryCommercialRepository(1) });
    const project = await service.createProject(actor, { name: "Running cancellation" });
    const executor = new DeferredExecutor();
    const { storage, writes } = storageFake();
    const launch = new CommercialAnalysisOrchestrator(service, executor, storage).launch(
      actor,
      project.id,
      { title: "内容", content: "正文" },
      "running-cancel",
    );
    await executor.started;
    const running = await waitForRunning(service, project.id);

    await expect(service.transitionRun(actor, running.id, "running", "cancelled", { failureCode: "USER_CANCELLED" }))
      .resolves.toMatchObject({ status: "cancelled" });
    executor.release();

    await expect(launch).rejects.toBeInstanceOf(CommercialExecutionFailedError);
    const finalRun = await service.getRun(actor, running.id);
    expect(finalRun?.status).toBe("cancelled");
    expect(finalRun?.resultKey).toBeUndefined();
    expect((await service.usage(actor)).consumed).toBe(0);
    expect(writes).toEqual([{ workspaceId: actor.workspaceId, runId: running.id }]);
  });
});
