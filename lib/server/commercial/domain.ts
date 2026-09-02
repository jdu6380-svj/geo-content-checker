import { z } from "zod";

export const commercialIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);

export const projectNameSchema = z.string().trim().min(1).max(120);

export const createProjectInputSchema = z.object({
  name: projectNameSchema,
}).strict();

export const createRunInputSchema = z.object({
  projectId: commercialIdSchema,
}).strict();

export type CommercialActor = {
  subjectId: string;
  workspaceId: string;
  role: "owner" | "member";
};

export type Project = {
  id: string;
  workspaceId: string;
  name: string;
  createdBy: string;
  createdAt: string;
};

export type AnalysisRun = {
  id: string;
  workspaceId: string;
  projectId: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  createdBy: string;
  createdAt: string;
  failureCode?: string | null;
  resultKey?: string | null;
};

export const COMMERCIAL_RUN_HISTORY_LIMIT = 20;

export type CommercialRunHistoryItem = Omit<AnalysisRun, "resultKey"> & {
  resultAvailable: boolean;
};

export function publicAnalysisRun(run: AnalysisRun): Omit<AnalysisRun, "resultKey"> {
  const { resultKey: _resultKey, ...publicRun } = run;
  return publicRun;
}

export function publicAnalysisRunHistory(run: AnalysisRun): CommercialRunHistoryItem {
  const { resultKey, ...publicRun } = run;
  return { ...publicRun, resultAvailable: Boolean(resultKey) };
}

export type IdempotencyRecord = {
  workspaceId: string;
  operation: "project.create" | "run.create" | "run.cancel";
  key: string;
  requestFingerprint: string;
  resourceId: string;
  createdAt: string;
};

export type UsageSnapshot = {
  workspaceId: string;
  consumed: number;
  limit: number;
};

export class CommercialValidationError extends Error {
  readonly code = "INVALID_REQUEST" as const;
  readonly status = 400 as const;

  constructor(message = "商业请求格式不正确。") {
    super(message);
    this.name = "CommercialValidationError";
  }
}

export class CommercialNotFoundError extends Error {
  readonly code = "NOT_FOUND" as const;
  readonly status = 404 as const;

  constructor(message = "请求的商业资源不存在。") {
    super(message);
    this.name = "CommercialNotFoundError";
  }
}

export class CommercialResultNotReadyError extends Error {
  readonly code = "RESULT_NOT_READY" as const;
  readonly status = 409 as const;

  constructor() {
    super("分析结果尚未生成。");
    this.name = "CommercialResultNotReadyError";
  }
}

export class CommercialIdempotencyConflictError extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT" as const;
  readonly status = 409 as const;

  constructor() {
    super("幂等键已用于不同请求。请使用新的幂等键。");
    this.name = "CommercialIdempotencyConflictError";
  }
}

export class CommercialQuotaExceededError extends Error {
  readonly code = "USAGE_QUOTA_EXCEEDED" as const;
  readonly status = 429 as const;

  constructor() {
    super("当前工作区的运行额度已用完。");
    this.name = "CommercialQuotaExceededError";
  }
}

export class CommercialRunNotCancellableError extends Error {
  readonly code = "RUN_NOT_CANCELLABLE" as const;
  readonly status = 409 as const;

  constructor() {
    super("正在分析或运行已结束，当前不可取消。");
    this.name = "CommercialRunNotCancellableError";
  }
}

export class CommercialRateLimitUnavailableError extends Error {
  readonly code = "RATE_LIMIT_UNAVAILABLE" as const;
  readonly status = 503 as const;

  constructor() {
    super("商业分析限流服务暂时不可用。");
    this.name = "CommercialRateLimitUnavailableError";
  }
}

export class CommercialRateLimitedError extends Error {
  readonly code = "RATE_LIMITED" as const;
  readonly status = 429 as const;
  readonly retryAfter: number;

  constructor(retryAfter = 60) {
    super("商业分析请求过于频繁，请稍后重试。");
    this.name = "CommercialRateLimitedError";
    this.retryAfter = Math.max(1, Math.min(86_400, Math.ceil(retryAfter)));
  }
}

export class CommercialAuthUnavailableError extends Error {
  readonly code = "AUTH_UNAVAILABLE" as const;
  readonly status = 503 as const;

  constructor() {
    super("商业身份服务尚未配置。");
    this.name = "CommercialAuthUnavailableError";
  }
}

export class CommercialUnauthenticatedError extends Error {
  readonly code = "UNAUTHENTICATED" as const;
  readonly status = 401 as const;

  constructor() {
    super("请先登录后再访问商业工作区。");
    this.name = "CommercialUnauthenticatedError";
  }
}

export class CommercialWorkspaceRequiredError extends Error {
  readonly code = "WORKSPACE_REQUIRED" as const;
  readonly status = 403 as const;

  constructor() {
    super("当前账户未绑定可用工作区。");
    this.name = "CommercialWorkspaceRequiredError";
  }
}

export class CommercialSignatureInvalidError extends Error {
  readonly code = "SIGNATURE_INVALID" as const;
  readonly status = 400 as const;

  constructor() {
    super("签名校验失败。");
    this.name = "CommercialSignatureInvalidError";
  }
}

export class CommercialPaymentUnavailableError extends Error {
  readonly code = "PAYMENT_UNAVAILABLE" as const;
  readonly status = 503 as const;

  constructor() {
    super("支付服务尚未配置。");
    this.name = "CommercialPaymentUnavailableError";
  }
}

export class CommercialSubscriptionManagementUnavailableError extends Error {
  readonly code = "SUBSCRIPTION_MANAGEMENT_UNAVAILABLE" as const;
  readonly status = 409 as const;

  constructor() {
    super("当前工作区没有可管理的有效订阅。");
    this.name = "CommercialSubscriptionManagementUnavailableError";
  }
}

export class CommercialPaymentResponseInvalidError extends Error {
  readonly code = "PAYMENT_RESPONSE_INVALID" as const;
  readonly status = 502 as const;

  constructor() {
    super("支付服务返回了无法验证的数据。");
    this.name = "CommercialPaymentResponseInvalidError";
  }
}

export class CommercialDataUnavailableError extends Error {
  readonly code = "DATA_UNAVAILABLE" as const;
  readonly status = 503 as const;

  constructor() {
    super("商业数据服务尚未配置。");
    this.name = "CommercialDataUnavailableError";
  }
}

export class CommercialExecutionUnavailableError extends Error {
  readonly code = "EXECUTION_UNAVAILABLE" as const;
  readonly status = 503 as const;

  constructor() {
    super("商业分析执行器尚未配置。");
    this.name = "CommercialExecutionUnavailableError";
  }
}

export class CommercialExecutionFailedError extends Error {
  readonly code = "EXECUTION_FAILED" as const;
  readonly status = 500 as const;

  constructor() {
    super("商业分析执行失败。");
    this.name = "CommercialExecutionFailedError";
  }
}

export class CommercialExecutionRetryableError extends Error {
  readonly code = "EXECUTION_RETRYABLE" as const;
  readonly status = 503 as const;
  readonly retryable = true as const;

  constructor() {
    super("商业分析暂时不可用，请稍后重试。");
    this.name = "CommercialExecutionRetryableError";
  }
}

export class CommercialExecutionInvalidOutputError extends Error {
  readonly code = "EXECUTION_INVALID_OUTPUT" as const;
  readonly status = 502 as const;
  readonly retryable = false as const;

  constructor() {
    super("商业分析返回了无法验证的结果。");
    this.name = "CommercialExecutionInvalidOutputError";
  }
}
