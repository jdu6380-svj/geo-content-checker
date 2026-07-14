import { Redis } from "@upstash/redis";

export type ModelCallBudgetMode = "redis" | "memory" | "memory-quota" | "fallback";

export interface ModelCallBudgetResult {
  allowed: boolean;
  retryAfter: number;
}

const REDIS_HOURLY_LIMIT = 180;
const MEMORY_HOURLY_LIMIT = 180;
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

function getRedisClient(): Redis | null {
  if (redisClient !== undefined) return redisClient;

  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) {
    redisClient = null;
    return redisClient;
  }

  redisClient = new Redis({ url, token });
  return redisClient;
}

function consumeMemoryBudget(mode: "memory" | "memory-quota", now: Date): ModelCallBudgetResult {
  const bucket = hourBucket(now);
  const key = `${mode}:${bucket}`;
  const limit = mode === "memory-quota" ? MEMORY_QUOTA_HOURLY_LIMIT : MEMORY_HOURLY_LIMIT;
  const expiresAt = (bucket + 1) * HOUR_SECONDS * 1_000;
  const current = memoryBudgets.get(key);
  const count = current && current.expiresAt > now.getTime() ? current.count : 0;

  if (count + 1 > limit) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((expiresAt - now.getTime()) / 1_000)),
    };
  }

  memoryBudgets.set(key, { count: count + 1, expiresAt });
  for (const [storedKey, budget] of memoryBudgets) {
    if (budget.expiresAt <= now.getTime()) memoryBudgets.delete(storedKey);
  }
  return { allowed: true, retryAfter: 0 };
}

function parseRedisBudget(raw: unknown): ModelCallBudgetResult {
  if (!Array.isArray(raw) || raw.length !== 3) {
    return { allowed: false, retryAfter: 60 };
  }

  const [allowed, , retryAfter] = raw.map((value) => Number(value));
  if (![allowed, retryAfter].every(Number.isFinite)) {
    return { allowed: false, retryAfter: 60 };
  }
  return {
    allowed: allowed === 1,
    retryAfter: allowed === 1 ? 0 : Math.max(1, Math.ceil(retryAfter)),
  };
}

export async function consumeModelCallBudget(
  mode: ModelCallBudgetMode,
  now: Date = new Date(),
): Promise<ModelCallBudgetResult> {
  if (mode === "fallback") return { allowed: false, retryAfter: 60 };
  if (mode === "memory" || mode === "memory-quota") {
    return consumeMemoryBudget(mode, now);
  }

  const redis = getRedisClient();
  if (!redis) return { allowed: false, retryAfter: 60 };

  try {
    const bucket = hourBucket(now);
    const raw = await redis.eval(
      REDIS_BUDGET_SCRIPT,
      [`geo:model-call-budget:v1:hour:${bucket}`],
      [String(REDIS_HOURLY_LIMIT), String(HOUR_SECONDS + 60)],
    );
    return parseRedisBudget(raw);
  } catch {
    return { allowed: false, retryAfter: 60 };
  }
}
