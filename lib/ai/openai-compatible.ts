import { markGeoRequestOutcome } from "@/lib/server/geo-observability";
import {
  consumeModelCallBudget,
  type ModelCallBudgetMode,
} from "@/lib/server/model-call-budget";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatCompletionOptions = {
  messages: ChatMessage[];
  temperature?: number;
  timeoutMs?: number;
  maxTokens?: number;
  rateLimitMode?: ModelCallBudgetMode;
};

export interface ModelTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ModelCallResult {
  content: string;
  usage?: ModelTokenUsage;
}

export class ModelCallError extends Error {
  readonly status?: number;
  readonly retryAfter?: string;

  constructor(
    message: string,
    options?: ErrorOptions & { status?: number; retryAfter?: string },
  ) {
    super(message, options);
    this.name = "ModelCallError";
    this.status = options?.status;
    this.retryAfter = options?.retryAfter;
  }
}

export async function callOpenAICompatibleModel({
  messages,
  temperature = 0.1,
  timeoutMs = 10_000,
  maxTokens,
  rateLimitMode = process.env.NODE_ENV === "production" ? "fallback" : "memory",
}: ChatCompletionOptions): Promise<ModelCallResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

  if (!apiKey) {
    markGeoRequestOutcome({ modelStatus: "disabled" });
    throw new ModelCallError("OPENAI_API_KEY is not configured");
  }

  const budget = await consumeModelCallBudget(rateLimitMode);
  if (!budget.allowed) {
    markGeoRequestOutcome({ modelStatus: "rate-limited" });
    throw new ModelCallError("Model call budget exhausted", {
      retryAfter: String(budget.retryAfter),
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const modelStartedAt = performance.now();
  markGeoRequestOutcome({ modelStatus: "requested" });

  function modelLatencyMs(): number {
    return Math.max(0, Math.round(performance.now() - modelStartedAt));
  }

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        response_format: { type: "json_object" },
        ...(maxTokens ? { max_tokens: maxTokens } : {}),
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      markGeoRequestOutcome({
        modelStatus: response.status === 429 ? "rate-limited" : "failed",
        modelLatencyMs: modelLatencyMs(),
      });
      throw new ModelCallError(`Model request failed with status ${response.status}`, {
        status: response.status,
        retryAfter: response.headers.get("retry-after") ?? undefined,
      });
    }

    const payload: unknown = await response.json();
    const content =
      typeof payload === "object" && payload !== null && "choices" in payload
        ? (payload as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content
        : undefined;
    const rawUsage =
      typeof payload === "object" && payload !== null && "usage" in payload
        ? (payload as {
            usage?: {
              prompt_tokens?: unknown;
              completion_tokens?: unknown;
              total_tokens?: unknown;
            };
          }).usage
        : undefined;
    const usage = normalizeUsage(rawUsage);

    if (typeof content !== "string" || !content.trim()) {
      markGeoRequestOutcome({
        modelStatus: "invalid-output",
        modelLatencyMs: modelLatencyMs(),
        ...usageLogFields(usage),
      });
      throw new ModelCallError("Model returned empty content");
    }

    markGeoRequestOutcome({
      modelStatus: "success",
      modelLatencyMs: modelLatencyMs(),
      ...usageLogFields(usage),
    });
    return { content, ...(usage ? { usage } : {}) };
  } catch (error) {
    if (error instanceof ModelCallError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      markGeoRequestOutcome({ modelStatus: "timeout", modelLatencyMs: modelLatencyMs() });
      throw new ModelCallError("Model request timed out", { cause: error });
    }
    markGeoRequestOutcome({ modelStatus: "failed", modelLatencyMs: modelLatencyMs() });
    throw new ModelCallError("Model request failed", {
      cause: error instanceof Error ? error : undefined,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeTokenCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function normalizeUsage(
  usage:
    | {
        prompt_tokens?: unknown;
        completion_tokens?: unknown;
        total_tokens?: unknown;
      }
    | undefined,
): ModelTokenUsage | undefined {
  const promptTokens = normalizeTokenCount(usage?.prompt_tokens);
  const completionTokens = normalizeTokenCount(usage?.completion_tokens);
  const totalTokens = normalizeTokenCount(usage?.total_tokens);

  if (promptTokens === undefined || completionTokens === undefined) return undefined;
  return {
    promptTokens,
    completionTokens,
    totalTokens: totalTokens ?? promptTokens + completionTokens,
  };
}

function optionalRate(name: string): number | undefined {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function estimateCostUsd(usage: ModelTokenUsage): number | undefined {
  const inputRate = optionalRate("MODEL_INPUT_COST_USD_PER_MILLION_TOKENS");
  const outputRate = optionalRate("MODEL_OUTPUT_COST_USD_PER_MILLION_TOKENS");
  if (inputRate === undefined || outputRate === undefined) return undefined;

  return Number(
    (
      (usage.promptTokens * inputRate + usage.completionTokens * outputRate) /
      1_000_000
    ).toFixed(8),
  );
}

function usageLogFields(usage: ModelTokenUsage | undefined): {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
} {
  if (!usage) return {};
  const estimatedCostUsd = estimateCostUsd(usage);
  return {
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
    ...(estimatedCostUsd === undefined ? {} : { estimatedCostUsd }),
  };
}
