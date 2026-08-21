import { createHmac } from "node:crypto";

import { isStrongSecuritySecret } from "@/lib/server/security-config";

const CLIENT_ID_HEADER = "x-geo-client-id";
const DEVELOPMENT_BETA_EVENT_SECRET =
  "geo-content-checker-development-beta-event-hmac-secret-v1";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class BetaIdentityConfigurationError extends Error {
  constructor() {
    super("Beta identity is not configured");
    this.name = "BetaIdentityConfigurationError";
  }
}

export class InvalidBetaClientIdError extends Error {
  constructor() {
    super("X-GEO-Client-ID must be a valid UUID");
    this.name = "InvalidBetaClientIdError";
  }
}

function getBetaEventSecret(): string {
  const secret = process.env.BETA_EVENT_HMAC_SECRET?.trim();
  if (secret) {
    const conflictingSecrets = [
      process.env.RATE_LIMIT_SALT?.trim(),
      process.env.ANALYSIS_TOKEN_SECRET?.trim(),
    ];
    if (!isStrongSecuritySecret(secret) || conflictingSecrets.includes(secret)) {
      throw new BetaIdentityConfigurationError();
    }
    return secret;
  }
  if (process.env.NODE_ENV !== "production") return DEVELOPMENT_BETA_EVENT_SECRET;
  throw new BetaIdentityConfigurationError();
}

function hmac(domain: string, value: string): string {
  return createHmac("sha256", getBetaEventSecret())
    .update(`${domain}\0${value}`)
    .digest("hex");
}

export function resolveBetaAnonymousId(request: Request): string {
  const clientId = request.headers.get(CLIENT_ID_HEADER)?.trim().toLowerCase();
  if (!clientId || !UUID_PATTERN.test(clientId)) throw new InvalidBetaClientIdError();
  return hmac("beta-anonymous-id:v1", clientId);
}

export function hashBetaRunId(runId: string): string {
  return hmac("beta-analysis-run:v1", runId);
}
