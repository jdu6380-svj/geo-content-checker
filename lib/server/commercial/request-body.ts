import { CommercialValidationError } from "./domain";

/** Small JSON commands (projects, onboarding, billing intents) stay bounded. */
export const COMMERCIAL_JSON_BODY_LIMIT_BYTES = 64 * 1024;
/** The analysis schema allows 500k characters, so allow room for UTF-8 encoding. */
export const COMMERCIAL_ANALYZE_BODY_LIMIT_BYTES = 2 * 1024 * 1024;

function invalidJson(message = "请求内容不是有效的 JSON。"): CommercialValidationError {
  return new CommercialValidationError(message);
}

function allowedOrigins(request: Request): Set<string> {
  const origins = new Set<string>();
  try {
    origins.add(new URL(request.url).origin);
  } catch {
    // The platform normally supplies an absolute URL; malformed requests fail below.
  }
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    try {
      const parsed = new URL(configured);
      if (!parsed.username && !parsed.password && (parsed.protocol === "https:" || parsed.protocol === "http:")) origins.add(parsed.origin);
    } catch {
      // Invalid app configuration is handled by the release/readiness checks.
    }
  }
  return origins;
}

/** Reject browser cross-site writes while allowing non-browser/fake clients without Origin. */
export function assertCommercialRequestOrigin(request: Request): void {
  const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (fetchSite === "cross-site") throw invalidJson("请求来源不受支持。");

  const origin = request.headers.get("origin")?.trim();
  if (!origin) return;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw invalidJson("请求来源不受支持。");
  }
  if (parsed.username || parsed.password || (parsed.protocol !== "https:" && parsed.protocol !== "http:") || !allowedOrigins(request).has(parsed.origin)) {
    throw invalidJson("请求来源不受支持。");
  }
}

function readDeclaredLength(request: Request): number | null {
  const raw = request.headers.get("content-length");
  if (raw === null) return null;
  const value = raw.trim();
  if (!/^\d+$/.test(value)) throw invalidJson("请求头格式不正确。");
  const length = Number(value);
  if (!Number.isSafeInteger(length)) throw invalidJson("请求头格式不正确。");
  return length;
}

async function readBytes(request: Request, limit: number): Promise<Uint8Array> {
  const declaredLength = readDeclaredLength(request);
  if (declaredLength !== null && declaredLength > limit) {
    throw invalidJson("请求内容超过允许的大小。");
  }
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      if (!next.value?.byteLength) continue;
      total += next.value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        throw invalidJson("请求内容超过允许的大小。");
      }
      chunks.push(next.value);
    }
  } catch (error) {
    if (error instanceof CommercialValidationError) throw error;
    throw invalidJson("请求内容无法读取。");
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readCommercialJsonBody(
  request: Request,
  limit = COMMERCIAL_JSON_BODY_LIMIT_BYTES,
): Promise<unknown> {
  assertCommercialRequestOrigin(request);
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    throw invalidJson("请求内容类型不受支持。");
  }
  const contentEncoding = request.headers.get("content-encoding")?.trim().toLowerCase();
  if (contentEncoding && contentEncoding !== "identity") {
    throw invalidJson("请求内容编码不受支持。");
  }

  const bytes = await readBytes(request, limit);
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!text.trim()) throw new Error("empty body");
    return JSON.parse(text) as unknown;
  } catch {
    throw invalidJson();
  }
}
