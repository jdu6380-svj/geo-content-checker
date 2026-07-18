const CLIENT_ID_STORAGE_KEY = "geo:client-id:v1";
const ANALYSIS_TOKEN_STORAGE_KEY = "geo:analysis-token:v1";
const COMPRESSION_THRESHOLD_BYTES = 8 * 1024;
const CLIENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface PostGeoJsonOptions
  extends Omit<RequestInit, "body" | "headers" | "method"> {
  headers?: HeadersInit;
  includeAnalysisToken?: boolean;
}

export interface AnalysisSessionClientData {
  token: string;
  runId: string;
  expiresAt: string;
  operations: {
    score: number;
    predict: number;
    diagnose: number;
    patch: number;
  };
  rateLimitMode: string;
}

export type GeoBetaEvent =
  | { event: "visit" }
  | { event: "feedback_clicked" }
  | { event: "analysis_completed"; runId: string };

export type GeoConcurrencyPool = {
  schedule<T>(task: () => Promise<T>): Promise<T>;
};

let memoryClientId: string | null = null;
let memoryAnalysisToken: string | null = null;
let warmupRequest: Promise<void> | null = null;

function createUuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getGeoClientId(): string {
  if (memoryClientId) return memoryClientId;

  try {
    const stored = window.localStorage.getItem(CLIENT_ID_STORAGE_KEY)?.trim().toLowerCase();
    if (stored && CLIENT_ID_PATTERN.test(stored)) {
      memoryClientId = stored;
      return stored;
    }
    if (stored) window.localStorage.removeItem(CLIENT_ID_STORAGE_KEY);
  } catch {
    // Privacy-restricted browsers fall back to the in-memory identifier below.
  }

  memoryClientId = createUuid();
  try {
    window.localStorage.setItem(CLIENT_ID_STORAGE_KEY, memoryClientId);
  } catch {
    // The server will still receive the per-page in-memory identifier.
  }
  return memoryClientId;
}

export function setGeoAnalysisToken(token: string | null): void {
  const normalized = token?.trim() || null;
  memoryAnalysisToken = normalized;

  try {
    if (normalized) window.sessionStorage.setItem(ANALYSIS_TOKEN_STORAGE_KEY, normalized);
    else window.sessionStorage.removeItem(ANALYSIS_TOKEN_STORAGE_KEY);
  } catch {
    // The in-memory token keeps the current page session usable.
  }
}

function getGeoAnalysisToken(): string | null {
  if (memoryAnalysisToken) return memoryAnalysisToken;

  try {
    const stored = window.sessionStorage.getItem(ANALYSIS_TOKEN_STORAGE_KEY)?.trim();
    if (stored) {
      memoryAnalysisToken = stored;
      return stored;
    }
  } catch {
    // Storage may be disabled; use the in-memory value when available.
  }

  return null;
}

async function gzipJson(bytes: Uint8Array): Promise<ArrayBuffer> {
  const source = new Blob([bytes.slice().buffer]).stream();
  const compressed = source.pipeThrough(new CompressionStream("gzip"));
  return new Response(compressed).arrayBuffer();
}

export async function postGeoJson<TBody>(
  input: RequestInfo | URL,
  body: TBody,
  options: PostGeoJsonOptions = {},
): Promise<Response> {
  const {
    headers: providedHeaders,
    includeAnalysisToken = true,
    ...requestOptions
  } = options;
  const headers = new Headers(providedHeaders);
  const json = JSON.stringify(body);
  const bytes = new TextEncoder().encode(json);
  let requestBody: BodyInit = json;

  headers.set("Content-Type", "application/json");
  headers.set("X-GEO-Client-ID", getGeoClientId());
  headers.delete("X-GEO-Content-Encoding");

  if (includeAnalysisToken) {
    const token = getGeoAnalysisToken();
    if (token) headers.set("X-GEO-Analysis-Token", token);
    else headers.delete("X-GEO-Analysis-Token");
  } else {
    headers.delete("X-GEO-Analysis-Token");
  }

  if (bytes.byteLength > COMPRESSION_THRESHOLD_BYTES && "CompressionStream" in window) {
    try {
      requestBody = await gzipJson(bytes);
      headers.set("X-GEO-Content-Encoding", "gzip");
    } catch {
      requestBody = json;
      headers.delete("X-GEO-Content-Encoding");
    }
  }

  return fetch(input, {
    ...requestOptions,
    method: "POST",
    headers,
    body: requestBody,
    cache: requestOptions.cache ?? "no-store",
  });
}

export async function postGeoBetaEvent(event: GeoBetaEvent): Promise<void> {
  try {
    await postGeoJson("/api/beta-event", event, {
      includeAnalysisToken: event.event === "analysis_completed",
      keepalive: true,
    });
  } catch {
    // Metrics must never interrupt the analysis workflow.
  }
}

export function createGeoConcurrencyPool(concurrency: number): GeoConcurrencyPool {
  const limit = Math.max(1, Math.floor(concurrency));
  const queue: Array<() => void> = [];
  let activeCount = 0;

  async function acquire(): Promise<void> {
    if (activeCount < limit) {
      activeCount += 1;
      return;
    }

    await new Promise<void>((resolve) => {
      queue.push(() => {
        activeCount += 1;
        resolve();
      });
    });
  }

  function release(): void {
    activeCount = Math.max(0, activeCount - 1);
    queue.shift()?.();
  }

  return {
    async schedule<T>(task: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await task();
      } finally {
        release();
      }
    },
  };
}

const diagnosticPool = createGeoConcurrencyPool(2);

export function scheduleGeoDiagnostic<T>(task: () => Promise<T>): Promise<T> {
  return diagnosticPool.schedule(task);
}

export function warmGeoApi(): Promise<void> {
  if (!warmupRequest) {
    warmupRequest = postGeoJson(
      "/api/warmup",
      {},
      { includeAnalysisToken: false },
    )
      .then(() => undefined)
      .catch(() => undefined);
  }

  return warmupRequest;
}
