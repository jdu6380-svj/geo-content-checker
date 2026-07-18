import { timingSafeEqual } from "node:crypto";

import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

import {
  AnalysisIdentityConfigurationError,
  InvalidAnalysisClientIdError,
  resolveAnalysisIdentity,
} from "@/lib/server/analysis-identity";
import type { AnalysisRateLimitMode } from "@/lib/server/analysis-rate-limit";
import {
  ANALYSIS_OPERATION_LIMITS,
  AnalysisTokenConfigurationError,
  AnalysisTokenVerificationError,
  verifyAnalysisToken,
  type AnalysisOperation,
  type AnalysisTokenClaims,
} from "@/lib/server/analysis-token";

export type AnalysisOperationMode = AnalysisRateLimitMode | "fallback";

export interface AnalysisOperationAuthorization {
  runId: string;
  operation: AnalysisOperation;
  remaining: number;
  mode: AnalysisOperationMode;
  modelAllowed: boolean;
  expiresAt: number;
}

export type AnalysisOperationErrorCode =
  | "INVALID_CLIENT_ID"
  | "ANALYSIS_SESSION_REQUIRED"
  | "INVALID_ANALYSIS_TOKEN"
  | "SESSION_IDENTITY_MISMATCH"
  | "OPERATION_LIMIT_REACHED"
  | "AUTHORIZATION_UNAVAILABLE";

export class AnalysisOperationError extends Error {
  readonly code: AnalysisOperationErrorCode;
  readonly status: 400 | 401 | 403 | 429 | 503;
  readonly publicMessage: string;
  readonly retryAfter?: number;
  readonly mode?: AnalysisOperationMode;

  constructor(params: {
    code: AnalysisOperationErrorCode;
    status: 400 | 401 | 403 | 429 | 503;
    publicMessage: string;
    retryAfter?: number;
    mode?: AnalysisOperationMode;
    options?: ErrorOptions;
  }) {
    super(params.code, params.options);
    this.name = "AnalysisOperationError";
    this.code = params.code;
    this.status = params.status;
    this.publicMessage = params.publicMessage;
    this.retryAfter = params.retryAfter;
    this.mode = params.mode;
  }
}

interface OperationCounterResult {
  allowed: boolean;
  count: number;
  retryAfter: number;
}

interface MemorySessionUsage {
  expiresAt: number;
  counts: Record<AnalysisOperation, number>;
}

const ANALYSIS_TOKEN_HEADER = "x-geo-analysis-token";
const MAX_TOKEN_LENGTH = 8 * 1024;
const CONSUME_OPERATION_SCRIPT = `
local field = ARGV[1]
local limit = tonumber(ARGV[2])
local requestedTtl = tonumber(ARGV[3])
local current = tonumber(redis.call("HGET", KEYS[1], field) or "0")

if current + 1 > limit then
  local ttl = redis.call("TTL", KEYS[1])
  if ttl < 1 then
    ttl = requestedTtl
  end
  return {0, current, ttl}
end

local nextCount = redis.call("HINCRBY", KEYS[1], field, 1)
local ttl = redis.call("TTL", KEYS[1])
if ttl < 1 then
  redis.call("EXPIRE", KEYS[1], requestedTtl)
  ttl = requestedTtl
end
return {1, nextCount, ttl}
`;

const memoryUsage = new Map<string, MemorySessionUsage>();

let redisClient: Redis | null | undefined;
let lastMemoryCleanup = 0;

function getRedisClient(): Redis | null {
  if (redisClient !== undefined) return redisClient;

  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url && !token) {
    redisClient = null;
    return redisClient;
  }
  if (!url || !token) throw new Error("Redis configuration is incomplete");

  redisClient = new Redis({ url, token });
  return redisClient;
}

function isRedisQuotaExceeded(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /quota exceeded|exceeded[^\n]*quota|max(?:imum)? requests? limit|request quota/i.test(message);
}

function hashesMatch(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "hex");
  const rightBytes = Buffer.from(right, "hex");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function operationLimitError(
  claims: AnalysisTokenClaims,
  mode: AnalysisOperationMode,
): AnalysisOperationError {
  const retryAfter = Math.max(1, claims.expiresAt - Math.floor(Date.now() / 1_000));
  return new AnalysisOperationError({
    code: "OPERATION_LIMIT_REACHED",
    status: 429,
    publicMessage: "当前分析会话的该项操作次数已用完，请重新发起体检。",
    retryAfter,
    mode,
  });
}

function cleanupMemoryUsage(nowSeconds: number): void {
  if (nowSeconds - lastMemoryCleanup < 60 && memoryUsage.size < 2_000) return;

  for (const [runId, usage] of memoryUsage) {
    if (usage.expiresAt <= nowSeconds) memoryUsage.delete(runId);
  }
  lastMemoryCleanup = nowSeconds;
}

function consumeInMemory(
  claims: AnalysisTokenClaims,
  operation: AnalysisOperation,
  mode: Extract<AnalysisOperationMode, "memory" | "memory-quota" | "fallback">,
  modelAllowed: boolean,
): AnalysisOperationAuthorization {
  const nowSeconds = Math.floor(Date.now() / 1_000);
  cleanupMemoryUsage(nowSeconds);
  const usage = memoryUsage.get(claims.runId) ?? {
    expiresAt: claims.expiresAt,
    counts: { score: 0, predict: 0, diagnose: 0, patch: 0 },
  };
  const limit = ANALYSIS_OPERATION_LIMITS[operation];
  const current = usage.counts[operation];
  if (current + 1 > limit) throw operationLimitError(claims, mode);

  usage.counts[operation] = current + 1;
  memoryUsage.set(claims.runId, usage);
  return {
    runId: claims.runId,
    operation,
    remaining: limit - usage.counts[operation],
    mode,
    modelAllowed,
    expiresAt: claims.expiresAt,
  };
}

function parseRedisResult(raw: unknown): OperationCounterResult {
  if (!Array.isArray(raw) || raw.length !== 3) throw new Error("Invalid Redis response");
  const [allowedValue, count, retryAfter] = raw.map((value) => Number(value));
  if (![allowedValue, count, retryAfter].every(Number.isFinite)) {
    throw new Error("Invalid Redis response");
  }
  return {
    allowed: allowedValue === 1,
    count,
    retryAfter: Math.max(1, Math.ceil(retryAfter)),
  };
}

async function consumeWithRedis(
  redis: Redis,
  claims: AnalysisTokenClaims,
  operation: AnalysisOperation,
): Promise<AnalysisOperationAuthorization> {
  const limit = ANALYSIS_OPERATION_LIMITS[operation];
  const ttl = Math.max(1, claims.expiresAt - Math.floor(Date.now() / 1_000));
  const raw = await redis.eval(
    CONSUME_OPERATION_SCRIPT,
    [`geo:analysis-session:v1:usage:${claims.runId}`],
    [operation, String(limit), String(ttl)],
  );
  const result = parseRedisResult(raw);
  if (!result.allowed) {
    throw new AnalysisOperationError({
      code: "OPERATION_LIMIT_REACHED",
      status: 429,
      publicMessage: "当前分析会话的该项操作次数已用完，请重新发起体检。",
      retryAfter: result.retryAfter,
      mode: "redis",
    });
  }

  return {
    runId: claims.runId,
    operation,
    remaining: Math.max(0, limit - result.count),
    mode: "redis",
    modelAllowed: true,
    expiresAt: claims.expiresAt,
  };
}

async function consumeOperation(
  claims: AnalysisTokenClaims,
  operation: AnalysisOperation,
): Promise<AnalysisOperationAuthorization> {
  let redis: Redis | null;
  try {
    redis = getRedisClient();
  } catch {
    return consumeInMemory(
      claims,
      operation,
      process.env.NODE_ENV === "production" ? "fallback" : "memory",
      process.env.NODE_ENV !== "production",
    );
  }

  if (!redis) {
    return consumeInMemory(
      claims,
      operation,
      process.env.NODE_ENV === "production" ? "fallback" : "memory",
      process.env.NODE_ENV !== "production",
    );
  }

  try {
    return await consumeWithRedis(redis, claims, operation);
  } catch (error) {
    if (error instanceof AnalysisOperationError) throw error;
    if (process.env.NODE_ENV !== "production") {
      return consumeInMemory(claims, operation, "memory", true);
    }
    if (
      isRedisQuotaExceeded(error) &&
      process.env.REDIS_QUOTA_FAIL_OPEN?.trim().toLowerCase() === "true"
    ) {
      return consumeInMemory(claims, operation, "memory-quota", true);
    }
    return consumeInMemory(claims, operation, "fallback", false);
  }
}

function readToken(request: Request): string {
  const token = request.headers.get(ANALYSIS_TOKEN_HEADER)?.trim();
  if (!token) {
    throw new AnalysisOperationError({
      code: "ANALYSIS_SESSION_REQUIRED",
      status: 401,
      publicMessage: "请先创建分析会话后再提交内容。",
    });
  }
  if (token.length > MAX_TOKEN_LENGTH) {
    throw new AnalysisOperationError({
      code: "INVALID_ANALYSIS_TOKEN",
      status: 401,
      publicMessage: "分析会话无效或已过期，请重新发起体检。",
    });
  }
  return token;
}

export async function verifyAnalysisSession(
  request: Request,
): Promise<AnalysisTokenClaims> {
  let claims: AnalysisTokenClaims;
  try {
    claims = await verifyAnalysisToken(readToken(request));
  } catch (error) {
    if (error instanceof AnalysisOperationError) throw error;
    if (error instanceof AnalysisTokenConfigurationError) {
      throw new AnalysisOperationError({
        code: "AUTHORIZATION_UNAVAILABLE",
        status: 503,
        publicMessage: "分析授权服务暂时不可用，请稍后重试。",
        mode: "fallback",
      });
    }
    if (error instanceof AnalysisTokenVerificationError) {
      throw new AnalysisOperationError({
        code: "INVALID_ANALYSIS_TOKEN",
        status: 401,
        publicMessage: "分析会话无效或已过期，请重新发起体检。",
      });
    }
    throw error;
  }

  let identity;
  try {
    identity = resolveAnalysisIdentity(request);
  } catch (error) {
    if (error instanceof InvalidAnalysisClientIdError) {
      throw new AnalysisOperationError({
        code: "INVALID_CLIENT_ID",
        status: 400,
        publicMessage: "X-GEO-Client-ID 必须是有效的 UUID。",
      });
    }
    if (error instanceof AnalysisIdentityConfigurationError) {
      throw new AnalysisOperationError({
        code: "AUTHORIZATION_UNAVAILABLE",
        status: 503,
        publicMessage: "分析授权服务暂时不可用，请稍后重试。",
        mode: "fallback",
      });
    }
    throw error;
  }

  if (
    !hashesMatch(claims.deviceHash, identity.deviceHash) ||
    !hashesMatch(claims.ipHash, identity.ipHash)
  ) {
    throw new AnalysisOperationError({
      code: "SESSION_IDENTITY_MISMATCH",
      status: 403,
      publicMessage: "分析会话与当前设备不匹配，请重新发起体检。",
    });
  }

  return claims;
}

export async function authorizeAnalysisOperation(
  request: Request,
  operation: AnalysisOperation,
): Promise<AnalysisOperationAuthorization> {
  const claims = await verifyAnalysisSession(request);

  return consumeOperation(claims, operation);
}

export function analysisOperationHeaders(
  authorization: AnalysisOperationAuthorization,
): Record<string, string> {
  return {
    "Cache-Control": "no-store",
    "X-GEO-RateLimit-Mode": authorization.mode,
    "X-GEO-Operation-Remaining": String(authorization.remaining),
  };
}

export function analysisOperationErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof AnalysisOperationError)) return null;

  return NextResponse.json(
    { error: error.code, message: error.publicMessage },
    {
      status: error.status,
      headers: {
        "Cache-Control": "no-store",
        ...(error.mode ? { "X-GEO-RateLimit-Mode": error.mode } : {}),
        ...(error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {}),
        ...(error.status === 401 ? { "WWW-Authenticate": "Bearer" } : {}),
      },
    },
  );
}
