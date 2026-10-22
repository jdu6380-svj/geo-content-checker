import { Buffer } from "node:buffer";

export { isHttpsUrl, isValidSupportEmail } from "../feedback-config.ts";

export const MIN_SECURITY_SECRET_BYTES = 32;

export function isStrongSecuritySecret(value: string | undefined): boolean {
  const normalized = value?.trim();
  return Boolean(
    normalized && Buffer.byteLength(normalized, "utf8") >= MIN_SECURITY_SECRET_BYTES,
  );
}

export function areDistinctSecuritySecrets(
  rateLimitSalt: string | undefined,
  analysisTokenSecret: string | undefined,
): boolean {
  const salt = rateLimitSalt?.trim();
  const tokenSecret = analysisTokenSecret?.trim();
  return Boolean(
    isStrongSecuritySecret(salt) &&
      isStrongSecuritySecret(tokenSecret) &&
      salt !== tokenSecret,
  );
}
