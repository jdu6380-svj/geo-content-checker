import { createHash } from "node:crypto";

import { Redis } from "@upstash/redis";
import { getUpstashRedisRestConfig } from "../redis-config.ts";

import {
  CommercialRateLimitedError,
  CommercialRateLimitUnavailableError,
} from "./domain";

/** Operational admission guard for expensive commercial analysis requests. */
export const COMMERCIAL_ANALYZE_RATE_LIMIT_PER_MINUTE = 6;
export const COMMERCIAL_ANALYZE_RATE_LIMIT_WINDOW_SECONDS = 60;

export type CommercialAnalyzeRateLimitMode = "redis" | "memory";

export type CommercialAnalyzeRateLimitResult = {
  allowed: boolean;
  mode: CommercialAnalyzeRateLimitMode;
  remaining: number;
  retryAfter: number;
};

export type CommercialAnalyzeRateLimitInput = {
  workspaceId: string;
  subjectId: string;
  now?: Date;
};

export interface CommercialAnalyzeRateLimiter {
  check(input: CommercialAnalyzeRateLimitInput): Promise<CommercialAnalyzeRateLimitResult>;
}

interface CounterResult {
  allowed: boolean;
  count: number;
  retryAfter: number;
}

interface CounterStore {
  consume(key: string, limit: number, ttlSeconds: number): Promise<CounterResult>;
}

const CONSUME_SCRIPT = `
local current = tonumber(redis.call("GET", KEYS[1]) or "0")
local limit = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])

if current + 1 > limit then
  local remainingTtl = redis.call("TTL", KEYS[1])
  if remainingTtl < 1 then remainingTtl = ttl end
  return {0, current, remainingTtl}
end

local nextCount = redis.call("INCR", KEYS[1])
if nextCount == 1 then redis.call("EXPIRE", KEYS[1], ttl) end
return {1, nextCount, 0}
`;

function parseCounterResult(raw: unknown): CounterResult {
  if (!Array.isArray(raw) || raw.length !== 3) throw new Error("invalid counter response");
  const values = raw.map((value) => Number(value));
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error("invalid counter response");
  }
  const [allowed, count, retryAfter] = values;
  if (allowed !== 0 && allowed !== 1) throw new Error("invalid counter response");
  return { allowed: allowed === 1, count, retryAfter: Math.max(1, retryAfter) };
}

class RedisCounterStore implements CounterStore {
  constructor(private readonly redis: Redis) {}

  async consume(key: string, limit: number, ttlSeconds: number): Promise<CounterResult> {
    const raw = await this.redis.eval(
      CONSUME_SCRIPT,
      [key],
      [String(limit), String(ttlSeconds)],
    );
    return parseCounterResult(raw);
  }
}

class MemoryCounterStore implements CounterStore {
  private readonly counters = new Map<string, { count: number; expiresAt: number }>();

  async consume(key: string, limit: number, ttlSeconds: number): Promise<CounterResult> {
    const now = Date.now();
    for (const [storedKey, counter] of this.counters) {
      if (counter.expiresAt <= now) this.counters.delete(storedKey);
    }
    const current = this.counters.get(key);
    const count = current && current.expiresAt > now ? current.count : 0;
    const expiresAt = current && current.expiresAt > now ? current.expiresAt : now + ttlSeconds * 1_000;
    if (count + 1 > limit) {
      return {
        allowed: false,
        count,
        retryAfter: Math.max(1, Math.ceil((expiresAt - now) / 1_000)),
      };
    }
    this.counters.set(key, { count: count + 1, expiresAt });
    return { allowed: true, count: count + 1, retryAfter: 0 };
  }
}

function rateLimitSalt(): string {
  return process.env.RATE_LIMIT_SALT?.trim() || "local-commercial-rate-limit";
}

function buildCounterKey(input: CommercialAnalyzeRateLimitInput, now: Date): string {
  const bucket = Math.floor(now.getTime() / (COMMERCIAL_ANALYZE_RATE_LIMIT_WINDOW_SECONDS * 1_000));
  const subjectRef = createHash("sha256")
    .update(`${rateLimitSalt()}:${input.workspaceId}:${input.subjectId}`)
    .digest("hex");
  return `geo:commercial-analyze:v1:${bucket}:${subjectRef}`;
}

function redisFromEnvironment(): Redis | null {
  const { url, token } = getUpstashRedisRestConfig();
  if (!url && !token) return null;
  if (!url || !token) throw new CommercialRateLimitUnavailableError();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new CommercialRateLimitUnavailableError();
  }
  if (parsed.protocol !== "https:") throw new CommercialRateLimitUnavailableError();
  return new Redis({ url, token });
}

class CommercialAnalyzeRateLimiterImpl implements CommercialAnalyzeRateLimiter {
  constructor(
    private readonly store: CounterStore,
    private readonly mode: CommercialAnalyzeRateLimitMode,
  ) {}

  async check(input: CommercialAnalyzeRateLimitInput): Promise<CommercialAnalyzeRateLimitResult> {
    const now = input.now ?? new Date();
    let result: CounterResult;
    try {
      result = await this.store.consume(
        buildCounterKey(input, now),
        COMMERCIAL_ANALYZE_RATE_LIMIT_PER_MINUTE,
        COMMERCIAL_ANALYZE_RATE_LIMIT_WINDOW_SECONDS,
      );
    } catch {
      throw new CommercialRateLimitUnavailableError();
    }
    if (!result.allowed) {
      throw new CommercialRateLimitedError(result.retryAfter);
    }
    return {
      allowed: true,
      mode: this.mode,
      remaining: Math.max(0, COMMERCIAL_ANALYZE_RATE_LIMIT_PER_MINUTE - result.count),
      retryAfter: 0,
    };
  }
}

export class InMemoryCommercialAnalyzeRateLimiter extends CommercialAnalyzeRateLimiterImpl {
  constructor() {
    super(new MemoryCounterStore(), "memory");
  }
}

let configuredLimiter: { key: string; limiter: CommercialAnalyzeRateLimiter | null } | null = null;

export function getConfiguredCommercialAnalyzeRateLimiter(): CommercialAnalyzeRateLimiter | null {
  const environment = String(process.env.NODE_ENV || "development");
  const { url, token } = getUpstashRedisRestConfig();
  const salt = process.env.RATE_LIMIT_SALT?.trim() || "";
  const key = createHash("sha256")
    .update(JSON.stringify({ environment, url, token, salt }))
    .digest("hex");
  if (configuredLimiter?.key === key) return configuredLimiter.limiter;

  let limiter: CommercialAnalyzeRateLimiter | null;
  if ((environment === "production" || environment === "staging") && !salt) {
    limiter = null;
  } else {
    try {
      const redis = redisFromEnvironment();
      if (redis) {
        limiter = new CommercialAnalyzeRateLimiterImpl(new RedisCounterStore(redis), "redis");
      } else if (environment === "production" || environment === "staging") {
        limiter = null;
      } else {
        limiter = new InMemoryCommercialAnalyzeRateLimiter();
      }
    } catch {
      limiter = null;
    }
  }
  configuredLimiter = { key, limiter };
  return limiter;
}

export function resetCommercialAnalyzeRateLimiterForTests(): void {
  configuredLimiter = null;
}
