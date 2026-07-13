import { gunzip } from "node:zlib";

export const GEO_COMPRESSED_BODY_LIMIT_BYTES = 64 * 1024;
export const GEO_DECOMPRESSED_BODY_LIMIT_BYTES = 128 * 1024;

export type GeoRequestBodyErrorCode =
  | "INVALID_JSON"
  | "INVALID_COMPRESSED_BODY"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_CONTENT_ENCODING";

export class GeoRequestBodyError extends Error {
  readonly code: GeoRequestBodyErrorCode;
  readonly status: 400 | 413;
  readonly publicMessage: string;

  constructor(
    code: GeoRequestBodyErrorCode,
    status: 400 | 413,
    publicMessage: string,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = "GeoRequestBodyError";
    this.code = code;
    this.status = status;
    this.publicMessage = publicMessage;
  }
}

function payloadTooLarge(): GeoRequestBodyError {
  return new GeoRequestBodyError(
    "PAYLOAD_TOO_LARGE",
    413,
    "请求内容超过允许的大小。",
  );
}

function invalidJson(options?: ErrorOptions): GeoRequestBodyError {
  return new GeoRequestBodyError(
    "INVALID_JSON",
    400,
    "请求内容不是有效的 JSON。",
    options,
  );
}

function declaredBodyLength(request: Request): number | null {
  const value = request.headers.get("content-length");
  if (!value) return null;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

async function readBodyWithLimit(request: Request, limit: number): Promise<Buffer> {
  const declaredLength = declaredBodyLength(request);
  if (declaredLength !== null && declaredLength > limit) throw payloadTooLarge();
  if (!request.body) return Buffer.alloc(0);

  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value?.byteLength) continue;

    totalBytes += value.byteLength;
    if (totalBytes > limit) {
      await reader.cancel().catch(() => undefined);
      throw payloadTooLarge();
    }

    chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
  }

  return Buffer.concat(chunks, totalBytes);
}

function exceededGunzipLimit(error: Error): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ERR_BUFFER_TOO_LARGE" || /maxOutputLength|larger than/i.test(error.message);
}

function gunzipWithLimit(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    gunzip(
      input,
      { maxOutputLength: GEO_DECOMPRESSED_BODY_LIMIT_BYTES },
      (error, output) => {
        if (error) {
          if (exceededGunzipLimit(error)) {
            reject(payloadTooLarge());
            return;
          }
          reject(
            new GeoRequestBodyError(
              "INVALID_COMPRESSED_BODY",
              400,
              "gzip 请求体损坏，无法解压。",
              { cause: error },
            ),
          );
          return;
        }

        if (output.byteLength > GEO_DECOMPRESSED_BODY_LIMIT_BYTES) {
          reject(payloadTooLarge());
          return;
        }
        resolve(output);
      },
    );
  });
}

function decodeJson(bytes: Buffer): unknown {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw invalidJson({ cause: error instanceof Error ? error : undefined });
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw invalidJson({ cause: error instanceof Error ? error : undefined });
  }
}

export async function readGeoJsonBody(request: Request): Promise<unknown> {
  const encoding = request.headers
    .get("x-geo-content-encoding")
    ?.trim()
    .toLowerCase();

  if (encoding && encoding !== "gzip" && encoding !== "identity") {
    throw new GeoRequestBodyError(
      "UNSUPPORTED_CONTENT_ENCODING",
      400,
      "不支持的请求压缩格式。",
    );
  }

  if (encoding === "gzip") {
    const compressed = await readBodyWithLimit(request, GEO_COMPRESSED_BODY_LIMIT_BYTES);
    return decodeJson(await gunzipWithLimit(compressed));
  }

  return decodeJson(await readBodyWithLimit(request, GEO_DECOMPRESSED_BODY_LIMIT_BYTES));
}
