export type CommercialProject = {
  id: string;
  workspaceId: string;
  name: string;
  createdBy: string;
  createdAt: string;
};

export type CommercialUsage = {
  workspaceId: string;
  consumed: number;
  limit: number;
  accessMode?: "beta" | "paid" | "none";
  accessExpiresAt?: string | null;
};

export type CommercialProjectList = {
  projects: CommercialProject[];
  usage: CommercialUsage;
  history: CommercialProjectHistory[];
};

export type CommercialRunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type CommercialRun = {
  id: string;
  workspaceId: string;
  projectId: string;
  status: CommercialRunStatus;
  createdBy: string;
  createdAt: string;
  failureCode?: string | null;
};

export type CommercialRunHistoryItem = CommercialRun & { resultAvailable: boolean };

export type CommercialProjectHistory = {
  projectId: string;
  runs: CommercialRunHistoryItem[];
};

export type CommercialAnalysisResult = {
  source: "deterministic" | "model";
  contentDigest: string;
  contentLength: number;
  score: number;
  diagnostics: { status: "available"; issueCount: number };
  patch: { status: "generated" | "not_generated" };
  analysis: {
    scoring: { totalScore: number; dimensions: Record<string, unknown> };
    questions: { questions: string[] };
    diagnostics: Array<Record<string, unknown>>;
    patch: { mode: string; markdown: string; actions: Array<Record<string, unknown>> };
  };
};

export type CommercialSubscription = {
  status: string;
  currentPeriodEnd: string | null;
  updatedAt: string;
  eventCreated?: number;
  entitlementRunLimit?: number;
};

export class CommercialApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "CommercialApiError";
  }
}

const SAFE_MESSAGES: Record<string, string> = {
  AUTH_UNAVAILABLE: "身份服务尚未配置，工作台暂不可用。",
  UNAUTHENTICATED: "请先登录后访问工作台。",
  WORKSPACE_REQUIRED: "当前账户尚未绑定可用工作区。",
  DATA_UNAVAILABLE: "商业数据服务暂不可用，请稍后重试。",
  INVALID_REQUEST: "请检查项目名称后重试。",
  IDEMPOTENCY_CONFLICT: "请求已被其他操作占用，请稍后重试。",
  USAGE_QUOTA_EXCEEDED: "当前工作区额度已用完。",
  RUN_NOT_CANCELLABLE: "运行正在分析或已经结束，当前不可取消。",
  NOT_FOUND: "请求的项目不存在。",
  RESULT_NOT_READY: "分析结果尚未生成，请稍后刷新状态。",
  EXECUTION_UNAVAILABLE: "分析执行器尚未配置。",
  EXECUTION_RETRYABLE: "分析服务暂时不可用，请稍后重试。",
  EXECUTION_FAILED: "分析执行失败，可重新提交。",
  EXECUTION_INVALID_OUTPUT: "分析结果无法验证，请重新提交。",
  TIMEOUT: "分析等待超时，请刷新或稍后重试。",
  NETWORK_TIMEOUT: "请求超时，请检查网络后重试。",
  PAYMENT_UNAVAILABLE: "支付服务尚未配置。",
  PAYMENT_RETRY: "支付状态正在处理中，请稍后重试。",
  SUBSCRIPTION_MANAGEMENT_UNAVAILABLE: "当前没有可管理的有效订阅。",
  PAYMENT_RESPONSE_INVALID: "订阅管理链接暂时不可用，请稍后重试。",
};

function safeMessage(code: string): string {
  return SAFE_MESSAGES[code] ?? "商业工作台暂不可用，请稍后重试。";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseProject(value: unknown): CommercialProject | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    typeof value.workspaceId !== "string" ||
    typeof value.name !== "string" ||
    typeof value.createdBy !== "string" ||
    typeof value.createdAt !== "string"
  ) return null;
  return {
    id: value.id,
    workspaceId: value.workspaceId,
    name: value.name,
    createdBy: value.createdBy,
    createdAt: value.createdAt,
  };
}

function parseUsage(value: unknown): CommercialUsage | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.workspaceId !== "string" ||
    typeof value.consumed !== "number" ||
    !Number.isSafeInteger(value.consumed) ||
    typeof value.limit !== "number" ||
    !Number.isSafeInteger(value.limit)
  ) return null;
  const accessModes = ["beta", "paid", "none"];
  if (value.accessMode !== undefined && (typeof value.accessMode !== "string" || !accessModes.includes(value.accessMode))) return null;
  if (value.accessExpiresAt !== undefined && value.accessExpiresAt !== null && typeof value.accessExpiresAt !== "string") return null;
  return {
    workspaceId: value.workspaceId,
    consumed: value.consumed,
    limit: value.limit,
    ...(value.accessMode !== undefined ? { accessMode: value.accessMode as CommercialUsage["accessMode"] } : {}),
    ...(value.accessExpiresAt !== undefined ? { accessExpiresAt: value.accessExpiresAt as string | null } : {}),
  };
}

function parseSubscription(value: unknown): CommercialSubscription | null {
  if (!isRecord(value) || typeof value.status !== "string" ||
    (value.currentPeriodEnd !== null && typeof value.currentPeriodEnd !== "string") || typeof value.updatedAt !== "string") return null;
  return value as CommercialSubscription;
}

function parseRun(value: unknown): CommercialRun | null {
  if (!isRecord(value)) return null;
  const statuses: CommercialRunStatus[] = ["queued", "running", "succeeded", "failed", "cancelled"];
  if (
    typeof value.id !== "string" || typeof value.workspaceId !== "string" || typeof value.projectId !== "string" ||
    typeof value.status !== "string" || !statuses.includes(value.status as CommercialRunStatus) ||
    typeof value.createdBy !== "string" || typeof value.createdAt !== "string"
  ) return null;
  return {
    id: value.id,
    workspaceId: value.workspaceId,
    projectId: value.projectId,
    status: value.status as CommercialRunStatus,
    createdBy: value.createdBy,
    createdAt: value.createdAt,
    failureCode: typeof value.failureCode === "string" ? value.failureCode : value.failureCode === null ? null : undefined,
  };
}

function parseRunHistory(value: unknown): CommercialRunHistoryItem | null {
  if (!isRecord(value) || typeof value.resultAvailable !== "boolean") return null;
  const run = parseRun(value);
  return run ? { ...run, resultAvailable: value.resultAvailable } : null;
}

function parseProjectHistory(value: unknown): CommercialProjectHistory | null {
  if (!isRecord(value) || typeof value.projectId !== "string" || !Array.isArray(value.runs)) return null;
  const runs = value.runs.map(parseRunHistory);
  return runs.some((run) => run === null) ? null : { projectId: value.projectId, runs: runs as CommercialRunHistoryItem[] };
}

function parseAnalysisResult(value: unknown): CommercialAnalysisResult | null {
  if (!isRecord(value) || (value.source !== "deterministic" && value.source !== "model") ||
    typeof value.contentDigest !== "string" || typeof value.contentLength !== "number" ||
    !Number.isSafeInteger(value.contentLength) || typeof value.score !== "number" ||
    !isRecord(value.diagnostics) || value.diagnostics.status !== "available" ||
    typeof value.diagnostics.issueCount !== "number" || !isRecord(value.patch) ||
    (value.patch.status !== "generated" && value.patch.status !== "not_generated") || !isRecord(value.analysis)) return null;
  const analysis = value.analysis;
  if (!isRecord(analysis.scoring) || typeof analysis.scoring.totalScore !== "number" || !isRecord(analysis.scoring.dimensions) ||
    !isRecord(analysis.questions) || !Array.isArray(analysis.questions.questions) || analysis.questions.questions.length !== 5 ||
    analysis.questions.questions.some((question) => typeof question !== "string") || !Array.isArray(analysis.diagnostics) ||
    !isRecord(analysis.patch) || typeof analysis.patch.mode !== "string" || typeof analysis.patch.markdown !== "string" ||
    !Array.isArray(analysis.patch.actions)) return null;
  return value as unknown as CommercialAnalysisResult;
}

async function parseResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  let response: Response;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15_000);
  try {
    response = await fetch(input, { ...init, cache: "no-store", signal: init?.signal ?? controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new CommercialApiError("NETWORK_TIMEOUT", 503, safeMessage("NETWORK_TIMEOUT"));
    }
    throw new CommercialApiError("NETWORK_UNAVAILABLE", 503, "商业工作台暂不可用，请稍后重试。");
  } finally {
    window.clearTimeout(timeout);
  }
  const payload = await parseResponse(response);
  if (!response.ok) {
    const code = isRecord(payload) && typeof payload.error === "string" ? payload.error : "INTERNAL_ERROR";
    throw new CommercialApiError(code, response.status, safeMessage(code));
  }
  return payload as T;
}

export async function listCommercialProjects(): Promise<CommercialProjectList> {
  const payload = await requestJson<unknown>("/api/commercial/projects");
  if (!isRecord(payload) || !Array.isArray(payload.projects)) {
    throw new CommercialApiError("INVALID_RESPONSE", 502, "项目列表返回了无法验证的数据。");
  }
  const projects = payload.projects.map(parseProject);
  const usage = parseUsage(payload.usage);
  const history = Array.isArray(payload.history) ? payload.history.map(parseProjectHistory) : [];
  const projectIds = new Set(projects.filter((project): project is CommercialProject => project !== null).map((project) => project.id));
  if (projects.some((project) => project === null) || !usage || history.some((entry) => entry === null || !projectIds.has(entry.projectId))) {
    throw new CommercialApiError("INVALID_RESPONSE", 502, "项目列表返回了无法验证的数据。");
  }
  return { projects: projects as CommercialProject[], usage, history: history as CommercialProjectHistory[] };
}

export function createCommercialIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `project-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function createCommercialProject(name: string): Promise<CommercialProject> {
  const payload = await requestJson<unknown>("/api/commercial/projects", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": createCommercialIdempotencyKey(),
    },
    body: JSON.stringify({ name }),
  });
  const project = isRecord(payload) ? parseProject(payload.project) : null;
  if (!project) throw new CommercialApiError("INVALID_RESPONSE", 502, "项目创建返回了无法验证的数据。");
  return project;
}

export async function launchCommercialAnalysis(
  projectId: string,
  input: { title: string; content: string; publishedAt?: string },
  idempotencyKey = createCommercialIdempotencyKey(),
): Promise<CommercialRun> {
  const payload = await requestJson<unknown>(`/api/commercial/projects/${encodeURIComponent(projectId)}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(input),
  });
  const run = isRecord(payload) ? parseRun(payload.run) : null;
  if (!run) throw new CommercialApiError("INVALID_RESPONSE", 502, "分析启动返回了无法验证的数据。");
  return run;
}

export async function getCommercialRun(runId: string): Promise<CommercialRun> {
  const payload = await requestJson<unknown>(`/api/commercial/runs/${encodeURIComponent(runId)}`);
  const run = isRecord(payload) ? parseRun(payload.run) : null;
  if (!run) throw new CommercialApiError("INVALID_RESPONSE", 502, "运行状态返回了无法验证的数据。");
  return run;
}

export async function cancelCommercialRun(
  runId: string,
  idempotencyKey = createCommercialIdempotencyKey(),
): Promise<CommercialRun> {
  const payload = await requestJson<unknown>(`/api/commercial/runs/${encodeURIComponent(runId)}/cancel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ intent: "cancel" }),
  });
  const run = isRecord(payload) ? parseRun(payload.run) : null;
  if (!run) throw new CommercialApiError("INVALID_RESPONSE", 502, "取消运行返回了无法验证的数据。");
  return run;
}

export async function getCommercialResult(runId: string): Promise<CommercialAnalysisResult> {
  let response: Response;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15_000);
  try {
    response = await fetch(`/api/commercial/runs/${encodeURIComponent(runId)}/result`, { cache: "no-store", signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new CommercialApiError("NETWORK_TIMEOUT", 503, safeMessage("NETWORK_TIMEOUT"));
    }
    throw new CommercialApiError("NETWORK_UNAVAILABLE", 503, "商业工作台暂不可用，请稍后重试。");
  } finally {
    window.clearTimeout(timeout);
  }
  if (!response.ok) {
    const payload = await parseResponse(response);
    const code = isRecord(payload) && typeof payload.error === "string" ? payload.error : "INTERNAL_ERROR";
    throw new CommercialApiError(code, response.status, safeMessage(code));
  }
  let payload: unknown;
  try {
    payload = JSON.parse(await response.text());
  } catch {
    throw new CommercialApiError("INVALID_RESPONSE", 502, "分析结果返回了无法验证的数据。");
  }
  const result = parseAnalysisResult(payload);
  if (!result) throw new CommercialApiError("INVALID_RESPONSE", 502, "分析结果返回了无法验证的数据。");
  return result;
}

export async function getCommercialSubscription(): Promise<CommercialSubscription | null> {
  const payload = await requestJson<unknown>("/api/stripe/subscription");
  if (!isRecord(payload) || payload.subscription === null) {
    if (isRecord(payload) && payload.subscription === null) return null;
    throw new CommercialApiError("INVALID_RESPONSE", 502, "订阅状态返回了无法验证的数据。");
  }
  const subscription = parseSubscription(payload.subscription);
  if (!subscription) throw new CommercialApiError("INVALID_RESPONSE", 502, "订阅状态返回了无法验证的数据。");
  return subscription;
}

export type CommercialPlan = { key: string; amount: string; runLimit: number };

export async function listCommercialPlans(): Promise<CommercialPlan[]> {
  const payload = await requestJson<unknown>("/api/alipay/plans");
  if (!isRecord(payload) || !Array.isArray(payload.plans) || payload.plans.some((plan) => !isRecord(plan) || typeof plan.key !== "string" || typeof plan.amount !== "string" || !Number.isSafeInteger(plan.runLimit) || Number(plan.runLimit) <= 0)) {
    throw new CommercialApiError("INVALID_RESPONSE", 502, "套餐信息返回了无法验证的数据。");
  }
  return payload.plans as CommercialPlan[];
}

export async function createCommercialCheckout(plan: string): Promise<{ checkoutUrl: string }> {
  const provider = process.env.NEXT_PUBLIC_COMMERCIAL_PAYMENT_PROVIDER?.trim();
  if (provider !== "alipay") {
    throw new CommercialApiError("PAYMENT_UNAVAILABLE", 503, safeMessage("PAYMENT_UNAVAILABLE"));
  }
  const payload = await requestJson<unknown>("/api/alipay/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": createCommercialIdempotencyKey() },
    body: JSON.stringify({ plan }),
  });
  if (!isRecord(payload) || typeof payload.checkoutUrl !== "string") {
    throw new CommercialApiError("INVALID_RESPONSE", 502, "支付跳转返回了无法验证的数据。");
  }
  try {
    if (new URL(payload.checkoutUrl).protocol !== "https:") throw new Error("insecure checkout URL");
  } catch {
    throw new CommercialApiError("INVALID_RESPONSE", 502, "支付跳转返回了无法验证的数据。");
  }
  return { checkoutUrl: payload.checkoutUrl };
}

export async function createCommercialPortal(): Promise<{ portalUrl: string }> {
  const payload = await requestJson<unknown>("/api/stripe/portal", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": createCommercialIdempotencyKey() },
    body: JSON.stringify({ intent: "manage" }),
  });
  if (!isRecord(payload) || typeof payload.portalUrl !== "string") {
    throw new CommercialApiError("INVALID_RESPONSE", 502, "订阅管理链接返回了无法验证的数据。");
  }
  try {
    if (new URL(payload.portalUrl).protocol !== "https:") throw new Error("insecure portal URL");
  } catch {
    throw new CommercialApiError("INVALID_RESPONSE", 502, "订阅管理链接返回了无法验证的数据。");
  }
  return { portalUrl: payload.portalUrl };
}
