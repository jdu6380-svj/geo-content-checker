import {
  classifyGeoProviderResponseReadError,
  markGeoRequestOutcome,
  markGeoRequestStage,
  markScoringProviderResponseParseTelemetry,
  sanitizeModelProviderTelemetry,
  sanitizeGeoProviderRequestId,
  type GeoModelErrorCategory,
  type GeoModelFinishReason,
  type ModelProviderTelemetry,
} from "@/lib/server/geo-observability";
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
  finishReason: GeoModelFinishReason;
  usage?: ModelTokenUsage;
}

export class ModelCallError extends Error {
  readonly status?: number;
  readonly retryAfter?: string;
  readonly providerRequestId?: string;
  readonly errorCategory?: GeoModelErrorCategory;

  constructor(
    message: string,
    options?: ErrorOptions & {
      status?: number;
      retryAfter?: string;
      providerRequestId?: string;
      errorCategory?: GeoModelErrorCategory;
    },
  ) {
    super(message, options);
    this.name = "ModelCallError";
    this.status = options?.status;
    this.retryAfter = options?.retryAfter;
    this.providerRequestId = options?.providerRequestId;
    this.errorCategory = options?.errorCategory;
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
    markGeoRequestOutcome({
      modelStatus: "disabled",
      modelErrorCategory: "configuration",
    });
    throw new ModelCallError("OPENAI_API_KEY is not configured", {
      errorCategory: "configuration",
    });
  }

  const budget = await consumeModelCallBudget(rateLimitMode);
  markGeoRequestOutcome({
    modelBudgetLimit: budget.limit,
    modelBudgetRemaining: budget.remaining,
    modelBudgetRetryAfter: budget.retryAfter,
  });
  if (!budget.allowed) {
    markGeoRequestOutcome({
      modelStatus: "rate-limited",
      modelErrorCategory: "budget",
    });
    throw new ModelCallError("Model call budget exhausted", {
      retryAfter: String(budget.retryAfter),
      errorCategory: "budget",
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const modelStartedAt = performance.now();
  const providerRequestStartAt = Date.now();
  let firstByteAt: number | undefined;
  markGeoRequestOutcome({ modelStatus: "requested", providerRequestStartAt });
  markGeoRequestStage("provider_request_sent");

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
    firstByteAt = Date.now();
    const providerRequestId = providerResponseRequestId(response.headers);
    markGeoRequestOutcome({
      firstByteAt,
      providerHttpStatus: response.status,
      ...(providerRequestId === undefined ? {} : { providerRequestId }),
    });
    markGeoRequestStage("provider_response_received");

    if (!response.ok) {
      markGeoRequestOutcome({
        modelStatus: response.status === 429 ? "rate-limited" : "failed",
        modelLatencyMs: modelLatencyMs(),
        modelErrorCategory: "provider_http",
      });
      throw new ModelCallError(`Model request failed with status ${response.status}`, {
        status: response.status,
        retryAfter: response.headers.get("retry-after") ?? undefined,
        providerRequestId,
        errorCategory: "provider_http",
      });
    }

    let payload: unknown;
    let responseBody: string | undefined;
    try {
      responseBody = await response.text();
      payload = JSON.parse(responseBody);
    } catch (error) {
      markScoringProviderResponseParseTelemetry({
        responseBody,
        responseContentType: response.headers.get("content-type"),
        parseError: error,
        responseParseFailureStage:
          responseBody === undefined ? "body_read" : "json_parse",
      });
      const errorCategory = classifyGeoProviderResponseReadError(error);
      if (errorCategory === "provider_timeout") throw error;
      const responseCompletedAt = Date.now();
      markGeoRequestOutcome({
        modelStatus: "failed",
        modelLatencyMs: modelLatencyMs(),
        responseCompletedAt,
        streamDurationMs: Math.max(0, responseCompletedAt - firstByteAt),
        modelErrorCategory: errorCategory,
      });
      throw new ModelCallError("Model response parsing failed", {
        cause: error instanceof Error ? error : undefined,
        status: response.status,
        providerRequestId,
        errorCategory,
      });
    }
    const responseCompletedAt = Date.now();
    markGeoRequestOutcome({
      responseCompletedAt,
      streamDurationMs: Math.max(0, responseCompletedAt - firstByteAt),
    });
    const content = providerMessageContent(payload);
    const telemetry = sanitizeModelProviderTelemetry(payload);
    const usage = normalizeUsage(providerUsage(payload));

    if (!telemetry.contentPresent || typeof content !== "string") {
      markGeoRequestOutcome({
        modelStatus: "invalid-output",
        modelLatencyMs: modelLatencyMs(),
        modelErrorCategory: "provider_invalid_output",
        ...providerTelemetryLogFields(telemetry, usage),
      });
      throw new ModelCallError("Model returned empty content", {
        status: response.status,
        providerRequestId,
        errorCategory: "provider_invalid_output",
      });
    }

    markGeoRequestOutcome({
      modelStatus: "success",
      modelLatencyMs: modelLatencyMs(),
      ...providerTelemetryLogFields(telemetry, usage),
    });
    return {
      content,
      finishReason: telemetry.finishReason,
      ...(usage ? { usage } : {}),
    };
  } catch (error) {
    if (error instanceof ModelCallError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      const abortedAt = Date.now();
      markGeoRequestOutcome({
        modelStatus: "timeout",
        modelLatencyMs: modelLatencyMs(),
        abortedAt,
        modelErrorCategory: "provider_timeout",
        ...(firstByteAt === undefined
          ? {}
          : { streamDurationMs: Math.max(0, abortedAt - firstByteAt) }),
      });
      throw new ModelCallError("Model request timed out", {
        cause: error,
        errorCategory: "provider_timeout",
      });
    }
    markGeoRequestOutcome({
      modelStatus: "failed",
      modelLatencyMs: modelLatencyMs(),
      modelErrorCategory: "provider_network",
    });
    throw new ModelCallError("Model request failed", {
      cause: error instanceof Error ? error : undefined,
      errorCategory: "provider_network",
    });
  } finally {
    clearTimeout(timeout);
  }
}

const PROVIDER_REQUEST_ID_HEADERS = [
  "x-request-id",
  "x-openai-request-id",
  "request-id",
] as const;

function providerResponseRequestId(headers: Headers): string | undefined {
  for (const name of PROVIDER_REQUEST_ID_HEADERS) {
    const requestId = sanitizeGeoProviderRequestId(headers.get(name));
    if (requestId !== undefined) return requestId;
  }
  return undefined;
}

function normalizeTokenCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function providerMessageContent(payload: unknown): unknown {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) return undefined;
  const choice = payload.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message)) return undefined;
  return choice.message.content;
}

function providerUsage(payload: unknown): Record<string, unknown> | undefined {
  if (!isRecord(payload) || !isRecord(payload.usage)) return undefined;
  return payload.usage;
}

function normalizeUsage(
  usage: Record<string, unknown> | undefined,
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

function providerTelemetryLogFields(
  telemetry: ModelProviderTelemetry,
  usage: ModelTokenUsage | undefined,
): {
  contentPresent: boolean;
  contentLength: number;
  finishReason: GeoModelFinishReason;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
} {
  const estimatedCostUsd = usage ? estimateCostUsd(usage) : undefined;
  return {
    contentPresent: telemetry.contentPresent,
    contentLength: telemetry.contentLength,
    finishReason: telemetry.finishReason,
    ...(telemetry.promptTokens === undefined
      ? {}
      : { promptTokens: telemetry.promptTokens }),
    ...(telemetry.completionTokens === undefined
      ? {}
      : { completionTokens: telemetry.completionTokens }),
    ...(telemetry.reasoningTokens === undefined
      ? {}
      : { reasoningTokens: telemetry.reasoningTokens }),
    ...(telemetry.totalTokens === undefined ? {} : { totalTokens: telemetry.totalTokens }),
    ...(estimatedCostUsd === undefined ? {} : { estimatedCostUsd }),
  };
}
