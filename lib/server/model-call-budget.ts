import { Redis } from "@upstash/redis";
import { getUpstashRedisRestConfig } from "./redis-config.ts";

export type ModelCallBudgetMode = "redis" | "memory" | "memory-quota" | "fallback";

export interface ModelCallBudgetResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfter: number;
}

export const DEFAULT_MODEL_CALL_BUDGET_PER_HOUR = 180;
export const MAX_MODEL_CALL_BUDGET_PER_HOUR = 10_000;
const MEMORY_QUOTA_HOURLY_LIMIT = 30;
const HOUR_SECONDS = 60 * 60;
const REDIS_BUDGET_SCRIPT = `
local current = tonumber(redis.call("GET", KEYS[1]) or "0")
local limit = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])

if current + 1 > limit then
  local remainingTtl = redis.call("TTL", KEYS[1])
  if remainingTtl < 1 then
    remainingTtl = ttl
  end
  return {0, current, remainingTtl}
end

local nextCount = redis.call("INCR", KEYS[1])
if nextCount == 1 then
  redis.call("EXPIRE", KEYS[1], ttl)
end
return {1, nextCount, 0}
`;

interface MemoryBudget {
  count: number;
  expiresAt: number;
}

const memoryBudgets = new Map<string, MemoryBudget>();
let redisClient: Redis | null | undefined;

function hourBucket(now: Date): number {
  return Math.floor(now.getTime() / (HOUR_SECONDS * 1_000));
}

function sanitizeBudgetNamespace(value: string | undefined, fallback: string): string {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return normalized || fallback;
}

export function resolveModelCallBudgetLimit(
  rawValue: string | undefined = process.env.MODEL_CALL_BUDGET_PER_HOUR,
): number {
  const normalized = rawValue?.trim();
  if (!normalized || !/^\d+$/.test(normalized)) {
    return DEFAULT_MODEL_CALL_BUDGET_PER_HOUR;
  }

  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) &&
    parsed >= 1 &&
    parsed <= MAX_MODEL_CALL_BUDGET_PER_HOUR
    ? parsed
    : DEFAULT_MODEL_CALL_BUDGET_PER_HOUR;
}

export function buildModelCallBudgetRedisKey(
  now: Date = new Date(),
  projectId: string | undefined = process.env.VERCEL_PROJECT_ID,
  vercelEnvironment: string | undefined = process.env.VERCEL_ENV,
): string {
  const project = sanitizeBudgetNamespace(projectId, "local-project");
  const environment = sanitizeBudgetNamespace(vercelEnvironment, "local");
  return `geo:model-call-budget:v2:${project}:${environment}:hour:${hourBucket(now)}`;
}

function getRedisClient(): Redis | null {
  if (redisClient !== undefined) return redisClient;

  const { url, token } = getUpstashRedisRestConfig();
  if (!url || !token) {
    redisClient = null;
    return redisClient;
  }

  redisClient = new Redis({ url, token });
  return redisClient;
}

function consumeMemoryBudget(mode: "memory" | "memory-quota", now: Date): ModelCallBudgetResult {
  const bucket = hourBucket(now);
  const key = `${mode}:${buildModelCallBudgetRedisKey(now)}`;
  const limit =
    mode === "memory-quota"
      ? MEMORY_QUOTA_HOURLY_LIMIT
      : resolveModelCallBudgetLimit();
  const expiresAt = (bucket + 1) * HOUR_SECONDS * 1_000;
  const current = memoryBudgets.get(key);
  const count = current && current.expiresAt > now.getTime() ? current.count : 0;

  if (count + 1 > limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((expiresAt - now.getTime()) / 1_000)),
    };
  }

  memoryBudgets.set(key, { count: count + 1, expiresAt });
  for (const [storedKey, budget] of memoryBudgets) {
    if (budget.expiresAt <= now.getTime()) memoryBudgets.delete(storedKey);
  }
  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - count - 1),
    retryAfter: 0,
  };
}

function unavailableBudgetResult(limit: number): ModelCallBudgetResult {
  return {
    allowed: false,
    limit,
    remaining: 0,
    retryAfter: 60,
  };
}

function parseRedisBudget(raw: unknown, limit: number): ModelCallBudgetResult {
  if (!Array.isArray(raw) || raw.length !== 3) {
    return unavailableBudgetResult(limit);
  }

  const [allowed, count, retryAfter] = raw.map((value) => Number(value));
  if (
    ![allowed, count, retryAfter].every(
      (value) => Number.isSafeInteger(value) && value >= 0,
    )
  ) {
    return unavailableBudgetResult(limit);
  }
  return {
    allowed: allowed === 1,
    limit,
    remaining: Math.max(0, limit - count),
    retryAfter: allowed === 1 ? 0 : Math.max(1, Math.ceil(retryAfter)),
  };
}

export async function consumeModelCallBudget(
  mode: ModelCallBudgetMode,
  now: Date = new Date(),
): Promise<ModelCallBudgetResult> {
  const limit = resolveModelCallBudgetLimit();
  if (mode === "fallback") return unavailableBudgetResult(limit);
  if (mode === "memory" || mode === "memory-quota") {
    return consumeMemoryBudget(mode, now);
  }

  const redis = getRedisClient();
  if (!redis) return unavailableBudgetResult(limit);

  try {
    const raw = await redis.eval(
      REDIS_BUDGET_SCRIPT,
      [buildModelCallBudgetRedisKey(now)],
      [String(limit), String(HOUR_SECONDS + 60)],
    );
    return parseRedisBudget(raw, limit);
  } catch {
    return unavailableBudgetResult(limit);
  }
}
