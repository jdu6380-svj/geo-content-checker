import { randomUUID } from "node:crypto";

import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";

import { isStrongSecuritySecret } from "@/lib/server/security-config";

export const ANALYSIS_TOKEN_LIFETIME_SECONDS = 30 * 60;
export const ANALYSIS_TOKEN_ISSUER = "geo-content-checker";
export const ANALYSIS_TOKEN_AUDIENCE = "geo-analysis-api";
export const ANALYSIS_OPERATION_LIMITS = {
  score: 1,
  predict: 1,
  diagnose: 10,
  patchAdvice: 1,
  patchContent: 1,
} as const;

export type AnalysisOperation = keyof typeof ANALYSIS_OPERATION_LIMITS;

export interface AnalysisTokenClaims {
  version: 2;
  runId: string;
  deviceHash: string;
  ipHash: string;
  operations: typeof ANALYSIS_OPERATION_LIMITS;
  subject: string;
  tokenId: string;
  issuedAt: number;
  expiresAt: number;
}

export interface IssuedAnalysisToken {
  token: string;
  runId: string;
  expiresAt: string;
  operations: typeof ANALYSIS_OPERATION_LIMITS;
}

export class AnalysisTokenConfigurationError extends Error {
  constructor() {
    super("Analysis tokens are not configured");
    this.name = "AnalysisTokenConfigurationError";
  }
}

export class AnalysisTokenVerificationError extends Error {
  constructor(options?: ErrorOptions) {
    super("Analysis token is invalid", options);
    this.name = "AnalysisTokenVerificationError";
  }
}

const DEVELOPMENT_TOKEN_SECRET =
  "geo-content-checker-development-analysis-token-secret-v1";
const hashSchema = z.string().regex(/^[0-9a-f]{64}$/);
const tokenPayloadSchema = z.object({
  version: z.literal(2),
  runId: z.string().uuid(),
  deviceHash: hashSchema,
  ipHash: hashSchema,
  operations: z.object({
    score: z.literal(1),
    predict: z.literal(1),
    diagnose: z.literal(10),
    patchAdvice: z.literal(1),
    patchContent: z.literal(1),
  }),
  sub: z.string().uuid(),
  jti: z.string().uuid(),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive(),
});

function getTokenSecret(): Uint8Array {
  const configuredSecret = process.env.ANALYSIS_TOKEN_SECRET?.trim();

  if (configuredSecret) {
    if (
      !isStrongSecuritySecret(configuredSecret) ||
      configuredSecret === process.env.RATE_LIMIT_SALT?.trim()
    ) {
      throw new AnalysisTokenConfigurationError();
    }
    return new TextEncoder().encode(configuredSecret);
  }
  if (process.env.NODE_ENV !== "production") {
    return new TextEncoder().encode(DEVELOPMENT_TOKEN_SECRET);
  }

  throw new AnalysisTokenConfigurationError();
}

export async function issueAnalysisToken(
  identity: { deviceHash: string; ipHash: string },
  now: Date = new Date(),
): Promise<IssuedAnalysisToken> {
  const runId = randomUUID();
  const issuedAt = Math.floor(now.getTime() / 1_000);
  const expiresAt = issuedAt + ANALYSIS_TOKEN_LIFETIME_SECONDS;
  const token = await new SignJWT({
    version: 2,
    runId,
    deviceHash: identity.deviceHash,
    ipHash: identity.ipHash,
    operations: ANALYSIS_OPERATION_LIMITS,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ANALYSIS_TOKEN_ISSUER)
    .setAudience(ANALYSIS_TOKEN_AUDIENCE)
    .setSubject(runId)
    .setJti(runId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(getTokenSecret());

  return {
    token,
    runId,
    expiresAt: new Date(expiresAt * 1_000).toISOString(),
    operations: ANALYSIS_OPERATION_LIMITS,
  };
}

export async function verifyAnalysisToken(token: string): Promise<AnalysisTokenClaims> {
  let payload: Awaited<ReturnType<typeof jwtVerify>>["payload"];

  try {
    ({ payload } = await jwtVerify(token, getTokenSecret(), {
      algorithms: ["HS256"],
      issuer: ANALYSIS_TOKEN_ISSUER,
      audience: ANALYSIS_TOKEN_AUDIENCE,
    }));
  } catch (error) {
    if (error instanceof AnalysisTokenConfigurationError) throw error;
    throw new AnalysisTokenVerificationError({
      cause: error instanceof Error ? error : undefined,
    });
  }

  const parsed = tokenPayloadSchema.safeParse(payload);
  if (!parsed.success || parsed.data.sub !== parsed.data.runId || parsed.data.jti !== parsed.data.runId) {
    throw new AnalysisTokenVerificationError();
  }

  return {
    version: parsed.data.version,
    runId: parsed.data.runId,
    deviceHash: parsed.data.deviceHash,
    ipHash: parsed.data.ipHash,
    operations: parsed.data.operations,
    subject: parsed.data.sub,
    tokenId: parsed.data.jti,
    issuedAt: parsed.data.iat,
    expiresAt: parsed.data.exp,
  };
}
