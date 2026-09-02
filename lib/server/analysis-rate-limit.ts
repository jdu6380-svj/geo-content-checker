import { Redis } from "@upstash/redis";
import { getUpstashRedisRestConfig } from "./redis-config.ts";

export type AnalysisRateLimitMode = "redis" | "memory" | "memory-quota";
export type AnalysisRateLimitReason =
  | "device-minute"
  | "device-day"
  | "ip-minute"
  | "ip-day";
export type WarmupRateLimitReason = "device-window" | "ip-minute" | "ip-day";

export interface AnalysisRateLimitRemaining {
  deviceMinute: number;
  deviceDay: number;
  ipMinute: number;
  ipDay: number;
}

export interface WarmupRateLimitRemaining {
  deviceWindow: number;
  ipMinute: number;
  ipDay: number;
}

export interface AnalysisRateLimitResult {
  allowed: boolean;
  mode: AnalysisRateLimitMode;
  retryAfter: number;
  reason?: AnalysisRateLimitReason;
  remaining: AnalysisRateLimitRemaining;
}

export interface WarmupRateLimitResult {
  allowed: boolean;
  mode: AnalysisRateLimitMode;
  retryAfter: number;
  reason?: WarmupRateLimitReason;
  remaining: WarmupRateLimitRemaining;
}

export interface CheckAnalysisRateLimitInput {
  deviceHash: string;
  ipHash: string;
  now?: Date;
}

export class AnalysisRateLimitUnavailableError extends Error {
  constructor() {
    super("Analysis rate limiting is unavailable");
    this.name = "AnalysisRateLimitUnavailableError";
  }
}

interface CounterDefinition<TName extends string, TReason extends string> {
  name: TName;
  reason: TReason;
  limit: number;
  key: string;
  ttlSeconds: number;
}

interface CounterResult<TReason extends string> {
  allowed: boolean;
  mode: AnalysisRateLimitMode;
  retryAfter: number;
  reason?: TReason;
  counts: number[];
}

interface MemoryCounter {
  count: number;
  expiresAt: number;
}

const ANALYSIS_LIMITS = {
  deviceMinute: 6,
  deviceDay: 10,
  ipMinute: 30,
  ipDay: 100,
} as const;

const WARMUP_LIMITS = {
  deviceWindow: 1,
  ipMinute: 30,
  ipDay: 100,
} as const;

const ATOMIC_RATE_LIMIT_SCRIPT = `
local keyCount = #KEYS
local current = {}

for index = 1, keyCount do
  current[index] = tonumber(redis.call("GET", KEYS[index]) or "0")
end

for index = 1, keyCount do
  local limit = tonumber(ARGV[index])
  if current[index] + 1 > limit then
    local ttl = redis.call("TTL", KEYS[index])
    if ttl < 1 then
      ttl = tonumber(ARGV[keyCount + index])
    end
    local denied = {0, index, ttl}
    for countIndex = 1, keyCount do
      denied[#denied + 1] = current[countIndex]
    end
    return denied
  end
end

for index = 1, keyCount do
  current[index] = redis.call("INCR", KEYS[index])
  if current[index] == 1 then
    redis.call("EXPIRE", KEYS[index], tonumber(ARGV[keyCount + index]))
  end
end

local allowed = {1, 0, 0}
for index = 1, keyCount do
  allowed[#allowed + 1] = current[index]
end
return allowed
`;

const memoryCounters = new Map<string, MemoryCounter>();

let redisClient: Redis | null | undefined;
let lastMemoryCleanup = 0;

function secondsUntilNextUtcDay(now: Date): number {
  const nextDay = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
  return Math.max(1, Math.ceil((nextDay - now.getTime()) / 1_000));
}

function utcDateKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function sharedIpMinuteKey(ipHash: string, now: Date): string {
  return `geo:shared-ip-gate:v2:minute:${Math.floor(now.getTime() / 60_000)}:${ipHash}`;
}

function sharedIpDayKey(ipHash: string, now: Date): string {
  return `geo:shared-ip-gate:v2:day:${utcDateKey(now)}:${ipHash}`;
}

function createAnalysisDefinitions(
  input: CheckAnalysisRateLimitInput,
  now: Date,
): Array<CounterDefinition<keyof AnalysisRateLimitRemaining, AnalysisRateLimitReason>> {
  const minuteBucket = Math.floor(now.getTime() / 60_000);
  const dayBucket = utcDateKey(now);
  const dayTtl = secondsUntilNextUtcDay(now);

  return [
    {
      name: "deviceMinute",
      reason: "device-minute",
      limit: ANALYSIS_LIMITS.deviceMinute,
      key: `geo:analysis-admission:v2:device:minute:${minuteBucket}:${input.deviceHash}`,
      ttlSeconds: 60,
    },
    {
      name: "deviceDay",
      reason: "device-day",
      limit: ANALYSIS_LIMITS.deviceDay,
      key: `geo:analysis-admission:v2:device:day:${dayBucket}:${input.deviceHash}`,
      ttlSeconds: dayTtl,
    },
    {
      name: "ipMinute",
      reason: "ip-minute",
      limit: ANALYSIS_LIMITS.ipMinute,
      key: sharedIpMinuteKey(input.ipHash, now),
      ttlSeconds: 60,
    },
    {
      name: "ipDay",
      reason: "ip-day",
      limit: ANALYSIS_LIMITS.ipDay,
      key: sharedIpDayKey(input.ipHash, now),
      ttlSeconds: dayTtl,
    },
  ];
}

function createWarmupDefinitions(
  input: CheckAnalysisRateLimitInput,
  now: Date,
): Array<CounterDefinition<keyof WarmupRateLimitRemaining, WarmupRateLimitReason>> {
  return [
    {
      name: "deviceWindow",
      reason: "device-window",
      limit: WARMUP_LIMITS.deviceWindow,
      key: `geo:warmup:v1:device:window:${input.deviceHash}`,
      ttlSeconds: 30 * 60,
    },
    {
      name: "ipMinute",
      reason: "ip-minute",
      limit: WARMUP_LIMITS.ipMinute,
      key: sharedIpMinuteKey(input.ipHash, now),
      ttlSeconds: 60,
    },
    {
      name: "ipDay",
      reason: "ip-day",
      limit: WARMUP_LIMITS.ipDay,
      key: sharedIpDayKey(input.ipHash, now),
      ttlSeconds: secondsUntilNextUtcDay(now),
    },
  ];
}

function getRedisClient(): Redis | null {
  if (redisClient !== undefined) return redisClient;

  const { url, token } = getUpstashRedisRestConfig();

  if (!url && !token) {
    redisClient = null;
    return redisClient;
  }
  if (!url || !token) throw new AnalysisRateLimitUnavailableError();

  redisClient = new Redis({ url, token });
  return redisClient;
}

function isRedisQuotaExceeded(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /quota exceeded|exceeded[^\n]*quota|max(?:imum)? requests? limit|request quota/i.test(message);
}

function cleanupMemoryCounters(nowMs: number): void {
  if (nowMs - lastMemoryCleanup < 60_000 && memoryCounters.size < 2_000) return;

  for (const [key, counter] of memoryCounters) {
    if (counter.expiresAt <= nowMs) memoryCounters.delete(key);
  }
  lastMemoryCleanup = nowMs;
}

function parseRedisResult<TName extends string, TReason extends string>(
  raw: unknown,
  definitions: Array<CounterDefinition<TName, TReason>>,
): Omit<CounterResult<TReason>, "mode"> {
  if (!Array.isArray(raw) || raw.length !== definitions.length + 3) {
    throw new AnalysisRateLimitUnavailableError();
  }

  const values = raw.map((value) => Number(value));
  if (values.some((value) => !Number.isFinite(value))) {
    throw new AnalysisRateLimitUnavailableError();
  }

  const [allowedValue, reasonIndex, retryAfter, ...counts] = values;
  const allowed = allowedValue === 1;
  const definition = reasonIndex > 0 ? definitions[reasonIndex - 1] : undefined;
  if (!allowed && !definition) throw new AnalysisRateLimitUnavailableError();

  return {
    allowed,
    retryAfter: allowed ? 0 : Math.max(1, Math.ceil(retryAfter)),
    ...(definition ? { reason: definition.reason } : {}),
    counts,
  };
}

function checkMemoryCounters<TName extends string, TReason extends string>(
  definitions: Array<CounterDefinition<TName, TReason>>,
  nowMs: number,
  mode: Extract<AnalysisRateLimitMode, "memory" | "memory-quota">,
): CounterResult<TReason> {
  cleanupMemoryCounters(nowMs);
  const current = definitions.map((definition) => {
    const counter = memoryCounters.get(definition.key);
    if (!counter || counter.expiresAt <= nowMs) {
      memoryCounters.delete(definition.key);
      return 0;
    }
    return counter.count;
  });
  const deniedIndex = definitions.findIndex(
    (definition, index) => current[index] + 1 > definition.limit,
  );

  if (deniedIndex >= 0) {
    const definition = definitions[deniedIndex];
    const counter = memoryCounters.get(definition.key);
    return {
      allowed: false,
      mode,
      retryAfter: counter
        ? Math.max(1, Math.ceil((counter.expiresAt - nowMs) / 1_000))
        : definition.ttlSeconds,
      reason: definition.reason,
      counts: current,
    };
  }

  const counts = definitions.map((definition, index) => {
    const existing = memoryCounters.get(definition.key);
    const count = current[index] + 1;
    memoryCounters.set(definition.key, {
      count,
      expiresAt: existing?.expiresAt ?? nowMs + definition.ttlSeconds * 1_000,
    });
    return count;
  });

  return { allowed: true, mode, retryAfter: 0, counts };
}

async function checkCounters<TName extends string, TReason extends string>(
  definitions: Array<CounterDefinition<TName, TReason>>,
  now: Date,
): Promise<CounterResult<TReason>> {
  const redis = getRedisClient();

  if (!redis) {
    if (process.env.NODE_ENV === "production") {
      throw new AnalysisRateLimitUnavailableError();
    }
    return checkMemoryCounters(definitions, now.getTime(), "memory");
  }

  try {
    const raw = await redis.eval(
      ATOMIC_RATE_LIMIT_SCRIPT,
      definitions.map((definition) => definition.key),
      [
        ...definitions.map((definition) => String(definition.limit)),
        ...definitions.map((definition) => String(definition.ttlSeconds)),
      ],
    );
    return { ...parseRedisResult(raw, definitions), mode: "redis" };
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      return checkMemoryCounters(definitions, now.getTime(), "memory");
    }
    if (
      isRedisQuotaExceeded(error) &&
      process.env.REDIS_QUOTA_FAIL_OPEN?.trim().toLowerCase() === "true"
    ) {
      return checkMemoryCounters(definitions, now.getTime(), "memory-quota");
    }
    if (error instanceof AnalysisRateLimitUnavailableError) throw error;
    throw new AnalysisRateLimitUnavailableError();
  }
}

function remainingByName<TName extends string, TReason extends string>(
  definitions: Array<CounterDefinition<TName, TReason>>,
  counts: number[],
): Record<TName, number> {
  return Object.fromEntries(
    definitions.map((definition, index) => [
      definition.name,
      Math.max(0, definition.limit - (counts[index] ?? 0)),
    ]),
  ) as Record<TName, number>;
}

export async function checkAnalysisRateLimit(
  input: CheckAnalysisRateLimitInput,
): Promise<AnalysisRateLimitResult> {
  const now = input.now ?? new Date();
  const definitions = createAnalysisDefinitions(input, now);
  const result = await checkCounters(definitions, now);

  return {
    allowed: result.allowed,
    mode: result.mode,
    retryAfter: result.retryAfter,
    ...(result.reason ? { reason: result.reason } : {}),
    remaining: remainingByName(definitions, result.counts),
  };
}

export async function checkWarmupRateLimit(
  input: CheckAnalysisRateLimitInput,
): Promise<WarmupRateLimitResult> {
  const now = input.now ?? new Date();
  const definitions = createWarmupDefinitions(input, now);
  const result = await checkCounters(definitions, now);

  return {
    allowed: result.allowed,
    mode: result.mode,
    retryAfter: result.retryAfter,
    ...(result.reason ? { reason: result.reason } : {}),
    remaining: remainingByName(definitions, result.counts),
  };
}
