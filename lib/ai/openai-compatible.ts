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
}: ChatCompletionOptions): Promise<string> {
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
  markGeoRequestOutcome({ modelStatus: "requested" });

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

    if (typeof content !== "string" || !content.trim()) {
      markGeoRequestOutcome({ modelStatus: "invalid-output" });
      throw new ModelCallError("Model returned empty content");
    }

    markGeoRequestOutcome({ modelStatus: "success" });
    return content;
  } catch (error) {
    if (error instanceof ModelCallError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      markGeoRequestOutcome({ modelStatus: "timeout" });
      throw new ModelCallError("Model request timed out", { cause: error });
    }
    markGeoRequestOutcome({ modelStatus: "failed" });
    throw new ModelCallError("Model request failed", {
      cause: error instanceof Error ? error : undefined,
    });
  } finally {
    clearTimeout(timeout);
  }
}
