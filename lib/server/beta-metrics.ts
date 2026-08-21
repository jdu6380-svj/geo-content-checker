import { Redis } from "@upstash/redis";

import type { BetaEvent, BetaRunEvent } from "@/lib/schemas/beta-event";
import { hashBetaRunId } from "@/lib/server/beta-identity";

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

type DailyAnonymousEvent = Extract<
  BetaEvent,
  { event: "visit" | "editor_started" | "feedback_clicked" }
>;

type MetricConfig = Readonly<{
  users: string;
  count: string | null;
  idempotency?: string;
}>;

const DAILY_EVENT_METRICS = {
  visit: { users: "visitors", count: null },
  editor_started: { users: "editor-starters", count: "editor-start-count" },
  feedback_clicked: { users: "feedback-users", count: "feedback-count" },
} as const satisfies Record<DailyAnonymousEvent["event"], MetricConfig>;

const RUN_EVENT_METRICS = {
  analysis_started: {
    users: "analysis-starters",
    count: "analysis-start-count",
    idempotency: "analysis-started",
  },
  analysis_completed: {
    users: "analysis-completers",
    count: "analysis-count",
    idempotency: "analysis",
  },
  report_viewed: {
    users: "report-viewers",
    count: "report-view-count",
    idempotency: "report-viewed",
  },
  patch_requested: {
    users: "patch-requesters",
    count: "patch-request-count",
    idempotency: "patch-requested",
  },
  patch_generated: {
    users: "patch-generators",
    count: "patch-generated-count",
    idempotency: "patch-generated",
  },
  patch_copied: {
    users: "patch-copiers",
    count: "patch-copied-count",
    idempotency: "patch-copied",
  },
  diagnosis_feedback: {
    users: "diagnosis-feedback-users",
    count: "diagnosis-feedback-count",
    idempotency: "diagnosis-feedback",
  },
} as const satisfies Record<BetaRunEvent["event"], MetricConfig & { idempotency: string }>;

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

function isDailyAnonymousEvent(event: BetaEvent): event is DailyAnonymousEvent {
  return event.event === "visit" ||
    event.event === "editor_started" ||
    event.event === "feedback_clicked";
}

function runIdempotencyKey(event: BetaRunEvent): string {
  const metric = RUN_EVENT_METRICS[event.event].idempotency;
  const diagnosticSuffix = event.event === "diagnosis_feedback"
    ? `:${event.diagnosticIndex}`
    : "";
  return `geo:beta:v1:idempotency:${metric}:${hashBetaRunId(event.runId)}${diagnosticSuffix}`;
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

function recordAnonymousEventInMemory(
  event: DailyAnonymousEvent,
  anonymousId: string,
  date: string,
  nowMs: number,
): RecordBetaEventResult {
  const metrics = DAILY_EVENT_METRICS[event.event];
  const added = addMemoryMember(dailyKey(metrics.users, date), anonymousId, nowMs);
  if (added && metrics.count) incrementMemoryCounter(dailyKey(metrics.count, date), nowMs);
  return { accepted: true, duplicate: !added, mode: "memory" };
}

function recordRunEventInMemory(
  event: BetaRunEvent,
  anonymousId: string,
  date: string,
  nowMs: number,
): RecordBetaEventResult {
  const idempotencyKey = runIdempotencyKey(event);
  if (memoryExpirations.has(idempotencyKey)) {
    return { accepted: true, duplicate: true, mode: "memory" };
  }

  rememberExpiry(idempotencyKey, nowMs);
  const metrics = RUN_EVENT_METRICS[event.event];
  addMemoryMember(dailyKey(metrics.users, date), anonymousId, nowMs);
  incrementMemoryCounter(dailyKey(metrics.count, date), nowMs);
  if (event.event === "diagnosis_feedback" && event.helpful) {
    incrementMemoryCounter(dailyKey("diagnosis-helpful-count", date), nowMs);
  }
  return { accepted: true, duplicate: false, mode: "memory" };
}

function recordInMemory(
  event: BetaEvent,
  anonymousId: string,
  now: Date,
): RecordBetaEventResult {
  const nowMs = now.getTime();
  const date = utcDate(now);
  cleanupMemory(nowMs);

  return isDailyAnonymousEvent(event)
    ? recordAnonymousEventInMemory(event, anonymousId, date, nowMs)
    : recordRunEventInMemory(event, anonymousId, date, nowMs);
}

async function expireKeys(redis: Redis, keys: string[]): Promise<void> {
  const pipeline = redis.pipeline();
  for (const key of keys) pipeline.expire(key, BETA_METRICS_RETENTION_SECONDS);
  await pipeline.exec();
}

async function recordAnonymousEventWithRedis(
  redis: Redis,
  event: DailyAnonymousEvent,
  anonymousId: string,
  date: string,
): Promise<RecordBetaEventResult> {
  const metrics = DAILY_EVENT_METRICS[event.event];
  const usersKey = dailyKey(metrics.users, date);
  const added = await redis.sadd(usersKey, anonymousId);
  const keys = [usersKey];

  if (added !== 0 && metrics.count) {
    const countKey = dailyKey(metrics.count, date);
    await redis.incr(countKey);
    keys.push(countKey);
  }
  await expireKeys(redis, keys);
  return { accepted: true, duplicate: added === 0, mode: "redis" };
}

async function recordRunEventWithRedis(
  redis: Redis,
  event: BetaRunEvent,
  anonymousId: string,
  date: string,
): Promise<RecordBetaEventResult> {
  const inserted = await redis.set(runIdempotencyKey(event), "1", {
    ex: BETA_METRICS_RETENTION_SECONDS,
    nx: true,
  });
  if (inserted !== "OK") return { accepted: true, duplicate: true, mode: "redis" };

  const metrics = RUN_EVENT_METRICS[event.event];
  const usersKey = dailyKey(metrics.users, date);
  const countKey = dailyKey(metrics.count, date);
  const keys = [usersKey, countKey];
  const pipeline = redis.pipeline();
  pipeline.sadd(usersKey, anonymousId);
  pipeline.incr(countKey);
  if (event.event === "diagnosis_feedback" && event.helpful) {
    const helpfulKey = dailyKey("diagnosis-helpful-count", date);
    pipeline.incr(helpfulKey);
    keys.push(helpfulKey);
  }
  await pipeline.exec();
  await expireKeys(redis, keys);
  return { accepted: true, duplicate: false, mode: "redis" };
}

async function recordWithRedis(
  redis: Redis,
  event: BetaEvent,
  anonymousId: string,
  now: Date,
): Promise<RecordBetaEventResult> {
  const date = utcDate(now);
  return isDailyAnonymousEvent(event)
    ? recordAnonymousEventWithRedis(redis, event, anonymousId, date)
    : recordRunEventWithRedis(redis, event, anonymousId, date);
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
