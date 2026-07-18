import { Redis } from "@upstash/redis";

import { hashBetaRunId } from "@/lib/server/beta-identity";
import type { BetaEvent } from "@/lib/schemas/beta-event";

export const BETA_METRICS_RETENTION_SECONDS = 90 * 24 * 60 * 60;

export type BetaMetricsMode = "redis" | "memory";

export interface RecordBetaEventResult {
  accepted: boolean;
  duplicate: boolean;
  mode: BetaMetricsMode;
}

export class BetaMetricsUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super("Beta metrics are unavailable", options);
    this.name = "BetaMetricsUnavailableError";
  }
}

const memorySets = new Map<string, Set<string>>();
const memoryCounters = new Map<string, number>();
const memoryExpirations = new Map<string, number>();
let redisClient: Redis | null | undefined;

function utcDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function dailyKey(metric: string, date: string): string {
  return `geo:beta:v1:${metric}:${date}`;
}

function getRedisClient(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!url && !token) {
    redisClient = null;
    return redisClient;
  }
  if (!url || !token) throw new BetaMetricsUnavailableError();
  redisClient = new Redis({ url, token });
  return redisClient;
}

function cleanupMemory(nowMs: number): void {
  for (const [key, expiresAt] of memoryExpirations) {
    if (expiresAt > nowMs) continue;
    memoryExpirations.delete(key);
    memorySets.delete(key);
    memoryCounters.delete(key);
  }
}

function rememberExpiry(key: string, nowMs: number): void {
  memoryExpirations.set(key, nowMs + BETA_METRICS_RETENTION_SECONDS * 1_000);
}

function memorySet(key: string): Set<string> {
  const existing = memorySets.get(key);
  if (existing) return existing;
  const created = new Set<string>();
  memorySets.set(key, created);
  return created;
}

function addMemoryMember(key: string, member: string, nowMs: number): boolean {
  const values = memorySet(key);
  const sizeBefore = values.size;
  values.add(member);
  rememberExpiry(key, nowMs);
  return values.size > sizeBefore;
}

function incrementMemoryCounter(key: string, nowMs: number): void {
  memoryCounters.set(key, (memoryCounters.get(key) ?? 0) + 1);
  rememberExpiry(key, nowMs);
}

function recordInMemory(
  event: BetaEvent,
  anonymousId: string,
  now: Date,
): RecordBetaEventResult {
  const nowMs = now.getTime();
  const date = utcDate(now);
  cleanupMemory(nowMs);

  if (event.event === "visit") {
    const added = addMemoryMember(dailyKey("visitors", date), anonymousId, nowMs);
    return { accepted: true, duplicate: !added, mode: "memory" };
  }

  if (event.event === "feedback_clicked") {
    const added = addMemoryMember(dailyKey("feedback-users", date), anonymousId, nowMs);
    if (added) incrementMemoryCounter(dailyKey("feedback-count", date), nowMs);
    return { accepted: true, duplicate: !added, mode: "memory" };
  }

  const idempotencyKey = `geo:beta:v1:idempotency:analysis:${hashBetaRunId(event.runId)}`;
  if (memoryExpirations.has(idempotencyKey)) {
    return { accepted: true, duplicate: true, mode: "memory" };
  }
  rememberExpiry(idempotencyKey, nowMs);
  addMemoryMember(dailyKey("analysis-completers", date), anonymousId, nowMs);
  incrementMemoryCounter(dailyKey("analysis-count", date), nowMs);
  return { accepted: true, duplicate: false, mode: "memory" };
}

async function expireKeys(redis: Redis, keys: string[]): Promise<void> {
  const pipeline = redis.pipeline();
  for (const key of keys) pipeline.expire(key, BETA_METRICS_RETENTION_SECONDS);
  await pipeline.exec();
}

async function recordWithRedis(
  redis: Redis,
  event: BetaEvent,
  anonymousId: string,
  now: Date,
): Promise<RecordBetaEventResult> {
  const date = utcDate(now);

  if (event.event === "visit") {
    const key = dailyKey("visitors", date);
    const added = await redis.sadd(key, anonymousId);
    await redis.expire(key, BETA_METRICS_RETENTION_SECONDS);
    return { accepted: true, duplicate: added === 0, mode: "redis" };
  }

  if (event.event === "feedback_clicked") {
    const usersKey = dailyKey("feedback-users", date);
    const countKey = dailyKey("feedback-count", date);
    const added = await redis.sadd(usersKey, anonymousId);
    if (added !== 0) await redis.incr(countKey);
    await expireKeys(redis, added === 0 ? [usersKey] : [usersKey, countKey]);
    return { accepted: true, duplicate: added === 0, mode: "redis" };
  }

  const idempotencyKey = `geo:beta:v1:idempotency:analysis:${hashBetaRunId(event.runId)}`;
  const inserted = await redis.set(idempotencyKey, "1", {
    ex: BETA_METRICS_RETENTION_SECONDS,
    nx: true,
  });
  if (inserted !== "OK") return { accepted: true, duplicate: true, mode: "redis" };

  const completersKey = dailyKey("analysis-completers", date);
  const countKey = dailyKey("analysis-count", date);
  const pipeline = redis.pipeline();
  pipeline.sadd(completersKey, anonymousId);
  pipeline.incr(countKey);
  await pipeline.exec();
  await expireKeys(redis, [completersKey, countKey]);
  return { accepted: true, duplicate: false, mode: "redis" };
}

export async function recordBetaEvent(
  event: BetaEvent,
  anonymousId: string,
  now: Date = new Date(),
): Promise<RecordBetaEventResult> {
  let redis: Redis | null;
  try {
    redis = getRedisClient();
  } catch (error) {
    if (process.env.NODE_ENV !== "production") return recordInMemory(event, anonymousId, now);
    throw new BetaMetricsUnavailableError({
      cause: error instanceof Error ? error : undefined,
    });
  }

  if (!redis) {
    if (process.env.NODE_ENV !== "production") return recordInMemory(event, anonymousId, now);
    throw new BetaMetricsUnavailableError();
  }

  try {
    return await recordWithRedis(redis, event, anonymousId, now);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") return recordInMemory(event, anonymousId, now);
    throw new BetaMetricsUnavailableError({
      cause: error instanceof Error ? error : undefined,
    });
  }
}
