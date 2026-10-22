import assert from "node:assert/strict";

import { NextRequest } from "next/server.js";

import {
  buildModelCallBudgetRedisKey,
  consumeModelCallBudget,
  DEFAULT_MODEL_CALL_BUDGET_PER_HOUR,
  MAX_MODEL_CALL_BUDGET_PER_HOUR,
  resolveModelCallBudgetLimit,
} from "../lib/server/model-call-budget.ts";
import {
  markGeoRequestOutcome,
  withGeoRequestLogging,
} from "../lib/server/geo-observability.ts";

assert.equal(
  resolveModelCallBudgetLimit(undefined),
  DEFAULT_MODEL_CALL_BUDGET_PER_HOUR,
);
assert.equal(resolveModelCallBudgetLimit("240"), 240);
for (const invalidValue of [
  "0",
  "-1",
  "1.5",
  String(MAX_MODEL_CALL_BUDGET_PER_HOUR + 1),
  "not-a-number",
]) {
  assert.equal(
    resolveModelCallBudgetLimit(invalidValue),
    DEFAULT_MODEL_CALL_BUDGET_PER_HOUR,
  );
}

const fixedHour = new Date("2026-07-30T08:00:00.000Z");
const previewKey = buildModelCallBudgetRedisKey(
  fixedHour,
  "prj_Test/Project",
  "preview",
);
assert.equal(
  previewKey,
  "geo:model-call-budget:v2:prj_test-project:preview:hour:495944",
);
assert.notEqual(
  previewKey,
  buildModelCallBudgetRedisKey(fixedHour, "prj_Test/Project", "production"),
);
assert.equal(
  buildModelCallBudgetRedisKey(fixedHour, undefined, undefined),
  "geo:model-call-budget:v2:local-project:local:hour:495944",
);

process.env.MODEL_CALL_BUDGET_PER_HOUR = "2";
process.env.VERCEL_PROJECT_ID = "prj_budget_validation";
process.env.VERCEL_ENV = "preview";
const first = await consumeModelCallBudget("memory", fixedHour);
assert.deepEqual(first, {
  allowed: true,
  limit: 2,
  remaining: 1,
  retryAfter: 0,
});
const second = await consumeModelCallBudget("memory", fixedHour);
assert.deepEqual(second, {
  allowed: true,
  limit: 2,
  remaining: 0,
  retryAfter: 0,
});
const exhausted = await consumeModelCallBudget("memory", fixedHour);
assert.equal(exhausted.allowed, false);
assert.equal(exhausted.limit, 2);
assert.equal(exhausted.remaining, 0);
assert.ok(exhausted.retryAfter > 0);

const quotaHour = new Date("2026-07-30T09:00:00.000Z");
for (let index = 0; index < 30; index += 1) {
  const result = await consumeModelCallBudget("memory-quota", quotaHour);
  assert.equal(result.allowed, true);
  assert.equal(result.limit, 30);
  assert.equal(result.remaining, 29 - index);
}
const quotaExhausted = await consumeModelCallBudget("memory-quota", quotaHour);
assert.equal(quotaExhausted.allowed, false);
assert.equal(quotaExhausted.limit, 30);
assert.equal(quotaExhausted.remaining, 0);
assert.ok(quotaExhausted.retryAfter > 0);

const requestLogs: string[] = [];
const originalConsoleInfo = console.info;
console.info = (value?: unknown) => {
  requestLogs.push(String(value));
};
try {
  const handler = withGeoRequestLogging(
    "/api/model-budget-validation",
    async () => {
      markGeoRequestOutcome({
        modelBudgetLimit: 240,
        modelBudgetRemaining: 79,
        modelBudgetRetryAfter: 0,
      });
      return Response.json({ ok: true });
    },
  );
  await handler(
    new NextRequest("https://example.invalid/api/model-budget-validation"),
  );
} finally {
  console.info = originalConsoleInfo;
}

const requestEvent = requestLogs
  .map((entry) => JSON.parse(entry) as Record<string, unknown>)
  .find((entry) => entry.event === "geo_api_request");
assert.ok(requestEvent);
assert.equal(requestEvent.modelBudgetLimit, 240);
assert.equal(requestEvent.modelBudgetRemaining, 79);
assert.equal(requestEvent.modelBudgetRetryAfter, 0);
const serializedTelemetry = JSON.stringify(requestEvent);
assert.doesNotMatch(
  serializedTelemetry,
  /prj_budget_validation|OPENAI_API_KEY|UPSTASH_REDIS_REST_TOKEN/,
);

console.log("PASS model call budget validation");
