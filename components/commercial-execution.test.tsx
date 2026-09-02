import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callOpenAICompatibleModel, ModelCallError } from "@/lib/ai/openai-compatible";

import {
  CommercialExecutionFailedError,
  CommercialExecutionInvalidOutputError,
  CommercialExecutionRetryableError,
  CommercialNotFoundError,
  CommercialQuotaExceededError,
} from "@/lib/server/commercial/domain";
import {
  CommercialAnalysisOrchestrator,
  DeterministicCommercialExecutor,
  OpenAICompatibleCommercialExecutor,
  type CommercialModelCall,
  getConfiguredCommercialExecutor,
  type CommercialAnalysisExecutor,
  type CommercialAnalysisResult,
} from "@/lib/server/commercial/execution";
import { InMemoryCommercialRepository } from "@/lib/server/commercial/repository";
import { CommercialService } from "@/lib/server/commercial/service";
import type { StorageAdapter } from "@/lib/server/commercial/providers";
import type { CommercialTelemetryEvent, CommercialTelemetrySink } from "@/lib/server/commercial/observability";

const actor = { subjectId: "user_1", workspaceId: "workspace_1", role: "owner" as const };
const input = { title: "Example", content: "A deterministic analysis input." };

function result(): CommercialAnalysisResult {
  return {
    source: "deterministic",
    contentDigest: "digest",
    contentLength: 3,
    score: 42,
    diagnostics: { status: "available", issueCount: 0 },
    patch: { status: "not_generated" },
    analysis: {
      scoring: {
        totalScore: 42,
        dimensions: {
          questionCoverage: { score: 15, max: 35, reason: "ok" },
          factCompleteness: { score: 12, max: 30, reason: "ok" },
          structureClarity: { score: 8, max: 20, reason: "ok" },
          freshness: { score: 7, max: 15, reason: "ok" },
        },
        numbered_paragraphs: [{ id: "Para-1", text: "A paragraph." }],
        source: "fallback",
      },
      questions: {
        questions: ["核心问题是什么？", "具体方法有哪些？", "适合哪些使用场景？", "有哪些事实依据？", "限制和时效是什么？"],
        source: "fallback",
      },
      diagnostics: [],
      patch: {
        mode: "advice",
        actions: [{
          type: "author_evidence",
          field: "source",
          reason: "补充来源。",
          id: "00000000-0000-4000-8000-000000000001",
          createdAt: "2026-01-01T00:00:00.000Z",
        }],
        markdown: "- 补充来源。",
        source: "fallback",
      },
    },
  };
}

function storageFake(options: { fail?: boolean } = {}): StorageAdapter & { writes: number; values: Map<string, Uint8Array> } {
  const values = new Map<string, Uint8Array>();
  return {
    writes: 0,
    values,
    async putResult({ workspaceId, runId, bytes }) {
      if (options.fail) throw new Error("storage unavailable");
      this.writes += 1;
      const key = `workspaces/${workspaceId}/runs/${runId}/result.json`;
      values.set(key, bytes);
      return { key };
    },
    async getResult({ workspaceId, runId }) {
      const value = values.get(`workspaces/${workspaceId}/runs/${runId}/result.json`);
      if (!value) throw new Error("missing result");
      return value;
    },
  };
}

class FakeExecutor implements CommercialAnalysisExecutor {
  calls = 0;

  constructor(private readonly failure = false) {}

  async execute(): Promise<CommercialAnalysisResult> {
    this.calls += 1;
    if (this.failure) throw new CommercialExecutionFailedError();
    return result();
  }
}

describe("commercial analysis orchestration", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function setup(runLimit = 2) {
    const service = new CommercialService({ repository: new InMemoryCommercialRepository(runLimit) });
    const project = await service.createProject(actor, { name: "Commercial project" });
    return { service, project };
  }

  it("persists a successful run and result, which can be read after a refresh", async () => {
    const { service, project } = await setup();
    const executor = new FakeExecutor();
    const storage = storageFake();
    const run = await new CommercialAnalysisOrchestrator(service, executor, storage).launch(
      actor,
      project.id,
      input,
      "launch-success",
    );

    expect(run.status).toBe("succeeded");
    expect(run.resultKey).toContain(`runs/${run.id}/result.json`);
    expect(executor.calls).toBe(1);
    expect(storage.writes).toBe(1);
    expect(await service.getRun(actor, run.id)).toMatchObject({ id: run.id, status: "succeeded", resultKey: run.resultKey });
    expect(JSON.parse(new TextDecoder().decode(await storage.getResult({ workspaceId: actor.workspaceId, runId: run.id })))).toEqual(result());
  });

  it("emits only safe hashed run telemetry and never blocks execution", async () => {
    const { service, project } = await setup();
    const events: CommercialTelemetryEvent[] = [];
    const telemetry: CommercialTelemetrySink = { emit: (event) => { events.push(event); } };
    const storage = storageFake();
    const secretContent = "customer secret article";
    const run = await new CommercialAnalysisOrchestrator(service, new FakeExecutor(), storage, telemetry).launch(
      actor,
      project.id,
      { title: "private title", content: secretContent },
      "telemetry-safe",
    );

    expect(run.status).toBe("succeeded");
    expect(events.filter((event) => event.event === "commercial_run").map((event) => event.stage)).toEqual([
      "launch_started",
      "execution_started",
      "result_persisting",
      "result_persisted",
      "succeeded",
    ]);
    expect(events.filter((event) => event.event === "commercial_operation").map((event) => event.stage)).toEqual([
      "quota_reservation_started",
      "quota_reserved",
      "quota_charge_recorded",
    ]);
    for (const event of events) {
      const serialized = JSON.stringify(event);
      expect(serialized).not.toContain(actor.workspaceId);
      expect(serialized).not.toContain(run.id);
      expect(serialized).not.toContain(secretContent);
      expect(serialized).not.toContain("resultKey");
      expect(event.workspaceRef).toMatch(/^ws_[a-f0-9]{16}$/);
      expect(event.runRef).toMatch(/^run_[a-f0-9]{16}$/);
    }
  });

  it("produces the existing scoring, question, diagnosis and patch shapes", async () => {
    const executor = new DeterministicCommercialExecutor();
    const value = await executor.execute({
      title: "GEO article",
      content: "方法与步骤：第一步收集数据。第二步核验来源。",
    });

    expect(value.analysis.scoring.source).toBe("fallback");
    expect(value.analysis.scoring.numbered_paragraphs.length).toBeGreaterThan(0);
    expect(value.analysis.questions.questions).toHaveLength(5);
    expect(value.analysis.diagnostics).toHaveLength(5);
    expect(value.analysis.patch.mode).toBe("advice");
    expect(value.analysis.patch.actions.length).toBeGreaterThan(0);
  });

  it("runs the full provider-backed scoring, questions, diagnosis and patch flow", async () => {
    const paragraph = "方法与步骤：第一步收集数据。第二步核验来源。";
    const responses = [
      JSON.stringify({ totalScore: 40, dimensions: {
        questionCoverage: { score: 14, max: 35, reason: "ok" },
        factCompleteness: { score: 11, max: 30, reason: "ok" },
        structureClarity: { score: 8, max: 20, reason: "ok" },
        freshness: { score: 7, max: 15, reason: "ok" },
      } }),
      JSON.stringify({ questions: ["核心问题是什么？", "具体方法有哪些？", "适合哪些使用场景？", "有哪些事实依据？", "限制和时效是什么？"] }),
      ...Array.from({ length: 5 }, (_, index) => JSON.stringify({
        answerability: "可以完全回答",
        riskLevel: "low",
        evidence: [{ paragraphId: "Para-1", quote: paragraph }],
        missingInfo: [],
        recommendation: `保留第${index + 1}项回答。`,
      })),
      JSON.stringify({ actions: [{ type: "structure_change", title: "优化结构", instruction: "调整已有段落顺序。", targetParagraphIds: ["Para-1"] }] }),
    ];
    let index = 0;
    const call: CommercialModelCall = async () => ({ content: responses[index++], finishReason: "stop" });
    const value = await new OpenAICompatibleCommercialExecutor(call).execute({ title: "Provider article", content: paragraph });

    expect(index).toBe(8);
    expect(value.source).toBe("model");
    expect(value.analysis.scoring.source).toBe("model");
    expect(value.analysis.questions.questions).toHaveLength(5);
    expect(value.analysis.diagnostics.every((diagnostic) => diagnostic.evidenceStatus === "valid")).toBe(true);
    expect(value.analysis.patch.source).toBe("model");
    expect(value.patch.status).toBe("generated");
  });

  it("fails closed on invalid JSON, schema output, and evidence mismatch", async () => {
    const invalidJson: CommercialModelCall = async () => ({ content: "not-json", finishReason: "stop" });
    await expect(new OpenAICompatibleCommercialExecutor(invalidJson).execute({ title: "A", content: "Content" })).rejects.toBeInstanceOf(CommercialExecutionInvalidOutputError);

    const invalidSchema: CommercialModelCall = async () => ({ content: JSON.stringify({ totalScore: 20 }), finishReason: "stop" });
    await expect(new OpenAICompatibleCommercialExecutor(invalidSchema).execute({ title: "A", content: "Content" })).rejects.toBeInstanceOf(CommercialExecutionInvalidOutputError);

    let callCount = 0;
    const evidenceMismatch: CommercialModelCall = async () => {
      callCount += 1;
      if (callCount === 1) return { content: JSON.stringify({ totalScore: 20, dimensions: {
        questionCoverage: { score: 5, max: 35, reason: "ok" }, factCompleteness: { score: 5, max: 30, reason: "ok" }, structureClarity: { score: 5, max: 20, reason: "ok" }, freshness: { score: 5, max: 15, reason: "ok" },
      } }), finishReason: "stop" };
      if (callCount === 2) return { content: JSON.stringify({ questions: ["核心问题是什么？", "具体方法有哪些？", "适合哪些使用场景？", "有哪些事实依据？", "限制和时效是什么？"] }), finishReason: "stop" };
      return { content: JSON.stringify({ answerability: "可以完全回答", riskLevel: "low", evidence: [{ paragraphId: "Para-1", quote: "not in source" }], missingInfo: [], recommendation: "ok" }), finishReason: "stop" };
    };
    await expect(new OpenAICompatibleCommercialExecutor(evidenceMismatch).execute({ title: "A", content: "Content" })).rejects.toBeInstanceOf(CommercialExecutionInvalidOutputError);

    let diagnosisCallCount = 0;
    const diagnosisInvalidJson: CommercialModelCall = async () => {
      diagnosisCallCount += 1;
      if (diagnosisCallCount === 1) return { content: JSON.stringify({ totalScore: 20, dimensions: {
        questionCoverage: { score: 5, max: 35, reason: "ok" }, factCompleteness: { score: 5, max: 30, reason: "ok" }, structureClarity: { score: 5, max: 20, reason: "ok" }, freshness: { score: 5, max: 15, reason: "ok" },
      } }), finishReason: "stop" };
      if (diagnosisCallCount === 2) return { content: JSON.stringify({ questions: ["核心问题是什么？", "具体方法有哪些？", "适合哪些使用场景？", "有哪些事实依据？", "限制和时效是什么？"] }), finishReason: "stop" };
      return { content: "{broken", finishReason: "stop" };
    };
    await expect(new OpenAICompatibleCommercialExecutor(diagnosisInvalidJson).execute({ title: "A", content: "Content" })).rejects.toBeInstanceOf(CommercialExecutionInvalidOutputError);
  });

  it("maps provider rate limits and timeouts to retryable errors without exposing provider text", async () => {
    const rateLimited: CommercialModelCall = async () => {
      throw new ModelCallError("provider secret text", { status: 429, retryAfter: "10" });
    };
    await expect(new OpenAICompatibleCommercialExecutor(rateLimited).execute({ title: "A", content: "Content" })).rejects.toBeInstanceOf(CommercialExecutionRetryableError);

    const timedOut: CommercialModelCall = async () => {
      throw new ModelCallError("timeout details", { errorCategory: "provider_timeout" });
    };
    await expect(new OpenAICompatibleCommercialExecutor(timedOut).execute({ title: "A", content: "Content" })).rejects.toBeInstanceOf(CommercialExecutionRetryableError);
  });

  it("replays a completed idempotent launch without executing or writing twice", async () => {
    const { service, project } = await setup();
    const executor = new FakeExecutor();
    const storage = storageFake();
    const orchestrator = new CommercialAnalysisOrchestrator(service, executor, storage);
    const first = await orchestrator.launch(actor, project.id, input, "launch-replay");
    const replay = await orchestrator.launch(actor, project.id, input, "launch-replay");

    expect(replay).toEqual(first);
    expect(executor.calls).toBe(1);
    expect(storage.writes).toBe(1);
    expect((await service.usage(actor)).consumed).toBe(1);
    await expect(service.transitionRun(actor, first.id, "running", "succeeded", { resultKey: first.resultKey })).resolves.toBeNull();
    expect((await service.usage(actor)).consumed).toBe(1);
  });

  it("marks executor failures as failed and preserves a retryable run state", async () => {
    const { service, project } = await setup();
    const storage = storageFake();
    const runPromise = new CommercialAnalysisOrchestrator(service, new FakeExecutor(true), storage).launch(
      actor,
      project.id,
      input,
      "launch-executor-failure",
    );

    await expect(runPromise).rejects.toBeInstanceOf(CommercialExecutionFailedError);
    const failed = await service.createRun(actor, { projectId: project.id }, "launch-executor-failure");
    expect(failed.status).toBe("failed");
    expect(failed.failureCode).toBe("EXECUTION_FAILED");
    expect((await service.usage(actor)).consumed).toBe(0);
  });

  it("charges only successful completion, releases failed reservations, and charges a retry once", async () => {
    const { service, project } = await setup(1);
    const storage = storageFake();
    const failed = new CommercialAnalysisOrchestrator(service, new FakeExecutor(true), storage).launch(actor, project.id, input, "failed-once");
    await expect(failed).rejects.toBeInstanceOf(CommercialExecutionFailedError);
    expect((await service.usage(actor)).consumed).toBe(0);

    const successExecutor = new FakeExecutor();
    const orchestrator = new CommercialAnalysisOrchestrator(service, successExecutor, storage);
    const completed = await orchestrator.launch(actor, project.id, input, "retry-success");
    expect(completed.status).toBe("succeeded");
    expect((await service.usage(actor)).consumed).toBe(1);
    expect(successExecutor.calls).toBe(1);
    expect(await orchestrator.launch(actor, project.id, input, "retry-success")).toEqual(completed);
    expect((await service.usage(actor)).consumed).toBe(1);
  });

  it("allows a failed run reservation to be reused but blocks concurrent capacity", async () => {
    const { service, project } = await setup(1);
    const first = await service.createRun(actor, { projectId: project.id }, "capacity-first");
    expect((await service.usage(actor)).consumed).toBe(0);
    await expect(service.createRun(actor, { projectId: project.id }, "capacity-second")).rejects.toBeInstanceOf(CommercialQuotaExceededError);
    expect(await service.transitionRun(actor, first.id, "queued", "failed", { failureCode: "EXECUTION_FAILED" })).toMatchObject({ status: "failed" });
    expect((await service.usage(actor)).consumed).toBe(0);
    await expect(service.createRun(actor, { projectId: project.id }, "capacity-third")).resolves.toMatchObject({ status: "queued" });
  });

  it("requires a persisted result before charging and keeps workspace usage isolated", async () => {
    const repository = new InMemoryCommercialRepository(1);
    const service = new CommercialService({ repository });
    const otherActor = { ...actor, subjectId: "user_2", workspaceId: "workspace_2" };
    const project = await service.createProject(actor, { name: "Workspace one" });
    const otherProject = await service.createProject(otherActor, { name: "Workspace two" });
    const run = await service.createRun(actor, { projectId: project.id }, "missing-result");

    await expect(service.transitionRun(actor, run.id, "queued", "succeeded")).resolves.toBeNull();
    expect((await service.usage(actor)).consumed).toBe(0);
    await expect(service.createRun(actor, { projectId: project.id }, "same-workspace-second")).rejects.toBeInstanceOf(CommercialQuotaExceededError);
    await expect(service.createRun(otherActor, { projectId: otherProject.id }, "other-workspace-first")).resolves.toMatchObject({ workspaceId: otherActor.workspaceId });
  });

  it("marks storage failures as failed without returning a successful run", async () => {
    const { service, project } = await setup();
    const executor = new FakeExecutor();
    const runPromise = new CommercialAnalysisOrchestrator(service, executor, storageFake({ fail: true })).launch(
      actor,
      project.id,
      input,
      "launch-storage-failure",
    );

    await expect(runPromise).rejects.toMatchObject({ code: "DATA_UNAVAILABLE" });
    const failed = await service.createRun(actor, { projectId: project.id }, "launch-storage-failure");
    expect(failed.status).toBe("failed");
    expect(failed.failureCode).toBe("DATA_UNAVAILABLE");
  });

  it("rejects cross-workspace projects and quota exhaustion before execution", async () => {
    const { service, project } = await setup(1);
    const otherActor = { ...actor, subjectId: "user_2", workspaceId: "workspace_2" };
    const executor = new FakeExecutor();
    const orchestrator = new CommercialAnalysisOrchestrator(service, executor, storageFake());

    await expect(orchestrator.launch(otherActor, project.id, input, "cross-workspace")).rejects.toBeInstanceOf(CommercialNotFoundError);
    await orchestrator.launch(actor, project.id, input, "first-run");
    await expect(orchestrator.launch(actor, project.id, input, "second-run")).rejects.toBeInstanceOf(CommercialQuotaExceededError);
    expect(executor.calls).toBe(1);
  });

  it("only exposes the deterministic executor when explicitly configured outside production", () => {
    vi.stubEnv("COMMERCIAL_EXECUTOR", "deterministic");
    expect(getConfiguredCommercialExecutor()).toBeInstanceOf(DeterministicCommercialExecutor);
    vi.stubEnv("NODE_ENV", "production");
    expect(getConfiguredCommercialExecutor()).toBeNull();
  });

  it("fails closed when the OpenAI-compatible provider or model is not configured", () => {
    vi.stubEnv("COMMERCIAL_EXECUTOR", "openai-compatible");
    expect(getConfiguredCommercialExecutor()).toBeNull();
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    expect(getConfiguredCommercialExecutor()).toBeNull();
    vi.stubEnv("OPENAI_MODEL", "test-model");
    expect(getConfiguredCommercialExecutor()).toBeNull();
    vi.stubEnv("OPENAI_BASE_URL", "https://provider.test");
    expect(getConfiguredCommercialExecutor()).toBeInstanceOf(OpenAICompatibleCommercialExecutor);
  });

  it("uses short-lived Vercel OIDC credentials for AI Gateway without forwarding a provider key", async () => {
    vi.stubEnv("OPENAI_BASE_URL", "https://ai-gateway.vercel.sh/v1");
    vi.stubEnv("OPENAI_MODEL", "alibaba/qwen-3-14b");
    vi.stubEnv("OPENAI_API_KEY", "provider-key-must-not-leave-the-app");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "short-lived-oidc-token");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(callOpenAICompatibleModel({
      messages: [{ role: "user", content: "non-sensitive sample" }],
      reasoningEffort: "low",
    })).resolves.toMatchObject({ content: '{"ok":true}' });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://ai-gateway.vercel.sh/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer short-lived-oidc-token" }),
      }),
    );
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).not.toHaveProperty("response_format");
    expect(JSON.parse(String(request.body))).not.toHaveProperty("reasoning_effort");
  });

  it("omits reasoning_effort for DeepSeek-compatible models", async () => {
    vi.stubEnv("OPENAI_BASE_URL", "https://api.deepseek.com/v1");
    vi.stubEnv("OPENAI_MODEL", "deepseek-chat");
    vi.stubEnv("OPENAI_API_KEY", "test-deepseek-key");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(callOpenAICompatibleModel({
      messages: [{ role: "user", content: "non-sensitive sample" }],
      reasoningEffort: "low",
    })).resolves.toMatchObject({ content: '{"ok":true}' });

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).not.toHaveProperty("reasoning_effort");
  });

  it("recognizes a Vercel AI Gateway OIDC deployment as a configured executor", () => {
    vi.stubEnv("COMMERCIAL_EXECUTOR", "openai-compatible");
    vi.stubEnv("OPENAI_BASE_URL", "https://ai-gateway.vercel.sh/v1");
    vi.stubEnv("OPENAI_MODEL", "alibaba/qwen-3-14b");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "short-lived-oidc-token");

    expect(getConfiguredCommercialExecutor()).toBeInstanceOf(OpenAICompatibleCommercialExecutor);
  });
});
