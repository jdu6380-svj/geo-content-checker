import { createHmac } from "node:crypto";

const CLIENT_ID_HEADER = "x-geo-client-id";
const DEVELOPMENT_RATE_LIMIT_SALT =
  "geo-content-checker-development-rate-limit-salt-v1";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AnalysisIdentitySource = "client-id" | "user-agent";

export interface AnalysisIdentity {
  ipHash: string;
  deviceHash: string;
  source: AnalysisIdentitySource;
  clientId?: string;
}

export class AnalysisIdentityConfigurationError extends Error {
  constructor() {
    super("Analysis identity is not configured");
    this.name = "AnalysisIdentityConfigurationError";
  }
}

export class InvalidAnalysisClientIdError extends Error {
  constructor() {
    super("X-GEO-Client-ID must be a valid UUID");
    this.name = "InvalidAnalysisClientIdError";
  }
}

function firstForwardedValue(value: string | null): string | undefined {
  const first = value
    ?.split(",", 1)[0]
    ?.trim()
    .replace(/^"|"$/g, "");

  return first || undefined;
}

function readRequestIp(headers: Headers): string {
  const forwardedIp =
    firstForwardedValue(headers.get("x-vercel-forwarded-for")) ??
    firstForwardedValue(headers.get("x-forwarded-for")) ??
    firstForwardedValue(headers.get("x-real-ip"));

  return (forwardedIp ?? "local").toLowerCase().slice(0, 128);
}

function readClientId(headers: Headers): string | undefined {
  const value = headers.get(CLIENT_ID_HEADER)?.trim().toLowerCase();

  if (!value) return undefined;
  if (!UUID_PATTERN.test(value)) throw new InvalidAnalysisClientIdError();

  return value;
}

function getRateLimitSalt(): string {
  const configuredSalt = process.env.RATE_LIMIT_SALT?.trim();

  if (configuredSalt) return configuredSalt;
  if (process.env.NODE_ENV !== "production") return DEVELOPMENT_RATE_LIMIT_SALT;

  throw new AnalysisIdentityConfigurationError();
}

function hmac(value: string, salt: string): string {
  return createHmac("sha256", salt).update(value).digest("hex");
}

export function resolveAnalysisIdentity(request: Request): AnalysisIdentity {
  const salt = getRateLimitSalt();
  const ip = readRequestIp(request.headers);
  const clientId = readClientId(request.headers);
  const userAgent = (request.headers.get("user-agent")?.trim() || "unknown").slice(0, 512);
  const source: AnalysisIdentitySource = clientId ? "client-id" : "user-agent";
  const deviceIdentity = clientId
    ? `device:client-id:v1\0${ip}\0${clientId}`
    : `device:user-agent:v1\0${ip}\0${userAgent}`;

  return {
    ipHash: hmac(`ip:v1\0${ip}`, salt),
    deviceHash: hmac(deviceIdentity, salt),
    source,
    ...(clientId ? { clientId } : {}),
  };
}
