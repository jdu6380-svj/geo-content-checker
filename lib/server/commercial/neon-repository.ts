import {
  CommercialDataUnavailableError,
  CommercialIdempotencyConflictError,
  CommercialNotFoundError,
  CommercialQuotaExceededError,
  CommercialRunNotCancellableError,
  commercialIdSchema,
  COMMERCIAL_RUN_HISTORY_LIMIT,
  type AnalysisRun,
  type CommercialActor,
  type IdempotencyRecord,
  type Project,
  type UsageSnapshot,
} from "./domain";
import { getNeonSql } from "./neon-client";
import type { CommercialRepository } from "./repository";

type SqlClient = ReturnType<typeof getNeonSql>;
type ProjectRow = {
  id: string;
  workspace_id: string;
  name: string;
  created_by: string;
  created_at: string | Date;
};
type RunRow = {
  id: string;
  workspace_id: string;
  project_id: string;
  status: AnalysisRun["status"];
  created_by: string;
  created_at: string | Date;
  failure_code?: string | null;
  result_key?: string | null;
};

function getSql(): SqlClient {
  return getNeonSql();
}

function paymentProviderMode(): "alipay" | "stripe" | "unknown" {
  const provider = process.env.COMMERCIAL_PAYMENT_PROVIDER?.trim();
  return provider === "alipay" || provider === "stripe" ? provider : "unknown";
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function projectFromRow(row: ProjectRow): Project {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
  };
}

function runFromRow(row: RunRow): AnalysisRun {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    status: row.status,
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
    failureCode: row.failure_code ?? null,
    resultKey: row.result_key ?? null,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export class NeonCommercialRepository implements CommercialRepository {
  private async assertMember(actor: CommercialActor): Promise<void> {
    const sql = getSql();
    const rows = (await sql`
      select 1
      from workspace_members
      where workspace_id = ${actor.workspaceId} and subject_id = ${actor.subjectId}
      limit 1
    `) as unknown as Array<{ "?column?": number }>;
    if (!rows[0]) throw new CommercialNotFoundError("工作区不存在或当前账户无权访问。");
  }

  async verifyActor(actor: CommercialActor): Promise<void> {
    await this.assertMember(actor);
  }

  async listProjects(actor: CommercialActor): Promise<Project[]> {
    await this.assertMember(actor);
    const sql = getSql();
    const rows = (await sql`
      select id, workspace_id, name, created_by, created_at
      from projects
      where workspace_id = ${actor.workspaceId}
      order by created_at asc
    `) as unknown as ProjectRow[];
    return rows.map(projectFromRow);
  }

  async getIdempotency(
    record: Pick<IdempotencyRecord, "workspaceId" | "operation" | "key">,
  ): Promise<IdempotencyRecord | null> {
    const sql = getSql();
    const rows = (await sql`
      select workspace_id as "workspaceId", operation, idempotency_key as key,
             request_fingerprint as "requestFingerprint", resource_id as "resourceId", created_at as "createdAt"
      from idempotency_keys
      where workspace_id = ${record.workspaceId}
        and operation = ${record.operation}
        and idempotency_key = ${record.key}
      limit 1
    `) as unknown as IdempotencyRecord[];
    return rows[0] ?? null;
  }

  async createProject(
    actor: CommercialActor,
    name: string,
    requestFingerprint: string,
    idempotencyKey?: string,
  ): Promise<Project> {
    await this.assertMember(actor);
    const sql = getSql();
    if (idempotencyKey) {
      const existing = await this.getIdempotency({ workspaceId: actor.workspaceId, operation: "project.create", key: idempotencyKey });
      if (existing) {
        if (existing.requestFingerprint !== requestFingerprint) throw new CommercialIdempotencyConflictError();
        const rows = (await sql`select id, workspace_id, name, created_by, created_at from projects where id = ${existing.resourceId}`) as unknown as ProjectRow[];
        if (rows[0]) return projectFromRow(rows[0]);
        throw new CommercialDataUnavailableError();
      }
    }

    const projectId = `project_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    try {
      const rows = (await sql`insert into projects (id, workspace_id, name, created_by, created_at)
        values (${projectId}, ${actor.workspaceId}, ${name}, ${actor.subjectId}, ${now}::timestamptz)
        returning id, workspace_id, name, created_by, created_at`) as unknown as ProjectRow[];
      if (idempotencyKey) {
        await sql`insert into idempotency_keys (workspace_id, operation, idempotency_key, request_fingerprint, resource_id, created_at)
          values (${actor.workspaceId}, 'project.create', ${idempotencyKey}, ${requestFingerprint}, ${projectId}, ${now}::timestamptz)`;
      }
      return projectFromRow(rows[0]);
    } catch (error) {
      if (isUniqueViolation(error) && idempotencyKey) {
        const existing = await this.getIdempotency({ workspaceId: actor.workspaceId, operation: "project.create", key: idempotencyKey });
        if (existing?.requestFingerprint !== requestFingerprint) throw new CommercialIdempotencyConflictError();
        if (existing) {
          const rows = (await sql`select id, workspace_id, name, created_by, created_at from projects where id = ${existing.resourceId}`) as unknown as ProjectRow[];
          if (rows[0]) return projectFromRow(rows[0]);
        }
      }
      throw new CommercialDataUnavailableError();
    }
  }

  async createRun(
    actor: CommercialActor,
    projectId: string,
    requestFingerprint: string,
    idempotencyKey?: string,
  ): Promise<AnalysisRun> {
    const sql = getSql();
    const providerMode = paymentProviderMode();
    await this.assertMember(actor);
    const projectRows = (await sql`select id from projects where id = ${projectId} and workspace_id = ${actor.workspaceId}`) as unknown as Array<{ id: string }>;
    if (!projectRows[0]) throw new CommercialNotFoundError("项目不存在。");
    if (idempotencyKey) {
      const existing = await this.getIdempotency({ workspaceId: actor.workspaceId, operation: "run.create", key: idempotencyKey });
      if (existing) {
        if (existing.requestFingerprint !== requestFingerprint) throw new CommercialIdempotencyConflictError();
        const rows = (await sql`select id, workspace_id, project_id, status, created_by, created_at from analysis_runs where id = ${existing.resourceId}`) as unknown as RunRow[];
        if (rows[0]) return runFromRow(rows[0]);
        throw new CommercialDataUnavailableError();
      }
    }

    const runId = `run_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    let rows: RunRow[];
    try {
      rows = idempotencyKey
      ? (await sql`with reserved as (
          update usage_counters as usage set reserved = usage.reserved + 1, updated_at = ${now}::timestamptz
          from workspaces as workspace
          left join subscriptions as subscription on subscription.workspace_id = workspace.id
          where usage.workspace_id = ${actor.workspaceId}
            and workspace.id = usage.workspace_id
            and (
              (${providerMode} = 'alipay' and exists (
                select 1 from payment_entitlements as entitlement
                where entitlement.workspace_id = usage.workspace_id
                  and entitlement.status = 'granted'
                  and entitlement.run_limit > 0
              ))
              or (${providerMode} = 'stripe'
                and subscription.workspace_id = usage.workspace_id
                and subscription.status in ('active', 'trialing')
                and subscription.current_period_end > now()
                and subscription.entitlement_run_limit = workspace.run_limit)
            )
            and workspace.run_limit > 0
            and usage.consumed + usage.reserved < workspace.run_limit
            and not exists (
              select 1 from idempotency_keys
              where workspace_id = usage.workspace_id and operation = 'run.create' and idempotency_key = ${idempotencyKey}
            )
            returning usage.workspace_id
        ), inserted as (
          insert into analysis_runs (id, workspace_id, project_id, status, created_by, created_at, usage_state)
          select ${runId}, ${actor.workspaceId}, ${projectId}, 'queued', ${actor.subjectId}, ${now}::timestamptz, 'reserved' from reserved
          returning id, workspace_id, project_id, status, created_by, created_at
        ), recorded as (
          insert into idempotency_keys (workspace_id, operation, idempotency_key, request_fingerprint, resource_id, created_at)
          select ${actor.workspaceId}, 'run.create', ${idempotencyKey}, ${requestFingerprint}, id, ${now}::timestamptz from inserted
          returning resource_id
        ) select inserted.* from inserted join recorded on recorded.resource_id = inserted.id`) as unknown as RunRow[]
      : (await sql`with reserved as (
          update usage_counters as usage set reserved = usage.reserved + 1, updated_at = ${now}::timestamptz
          from workspaces as workspace
          left join subscriptions as subscription on subscription.workspace_id = workspace.id
          where usage.workspace_id = ${actor.workspaceId}
            and workspace.id = usage.workspace_id
            and (
              (${providerMode} = 'alipay' and exists (
                select 1 from payment_entitlements as entitlement
                where entitlement.workspace_id = usage.workspace_id
                  and entitlement.status = 'granted'
                  and entitlement.run_limit > 0
              ))
              or (${providerMode} = 'stripe'
                and subscription.workspace_id = usage.workspace_id
                and subscription.status in ('active', 'trialing')
                and subscription.current_period_end > now()
                and subscription.entitlement_run_limit = workspace.run_limit)
            )
            and workspace.run_limit > 0
            and usage.consumed + usage.reserved < workspace.run_limit
          returning usage.workspace_id
        ) insert into analysis_runs (id, workspace_id, project_id, status, created_by, created_at, usage_state)
        select ${runId}, ${actor.workspaceId}, ${projectId}, 'queued', ${actor.subjectId}, ${now}::timestamptz, 'reserved' from reserved
        returning id, workspace_id, project_id, status, created_by, created_at`) as unknown as RunRow[];
    } catch (error) {
      if (isUniqueViolation(error) && idempotencyKey) {
        const existing = await this.getIdempotency({ workspaceId: actor.workspaceId, operation: "run.create", key: idempotencyKey });
        if (existing?.requestFingerprint !== requestFingerprint) throw new CommercialIdempotencyConflictError();
        if (existing) {
          const replay = (await sql`select id, workspace_id, project_id, status, created_by, created_at from analysis_runs where id = ${existing.resourceId}`) as unknown as RunRow[];
          if (replay[0]) return runFromRow(replay[0]);
        }
      }
      throw new CommercialDataUnavailableError();
    }
    if (!rows[0]) throw new CommercialQuotaExceededError();
    return runFromRow(rows[0]);
  }

  async cancelQueuedRun(
    actor: CommercialActor,
    runId: string,
    requestFingerprint: string,
    idempotencyKey: string,
  ): Promise<AnalysisRun> {
    await this.assertMember(actor);
    const sql = getSql();
    const existing = await this.getIdempotency({ workspaceId: actor.workspaceId, operation: "run.cancel", key: idempotencyKey });
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) throw new CommercialIdempotencyConflictError();
      const replay = (await sql`
        select id, workspace_id, project_id, status, created_by, created_at, failure_code, result_key
        from analysis_runs
        where id = ${existing.resourceId} and workspace_id = ${actor.workspaceId}
        limit 1
      `) as unknown as RunRow[];
      if (replay[0]) return runFromRow(replay[0]);
      throw new CommercialDataUnavailableError();
    }

    const scopedRun = (await sql`
      select runs.id, runs.workspace_id, runs.project_id, runs.status, runs.created_by, runs.created_at, runs.failure_code, runs.result_key
      from analysis_runs as runs
      join projects on projects.id = runs.project_id and projects.workspace_id = runs.workspace_id
      where runs.id = ${runId} and runs.workspace_id = ${actor.workspaceId}
      limit 1
    `) as unknown as RunRow[];
    if (!scopedRun[0]) throw new CommercialNotFoundError("运行记录不存在。");
    if (scopedRun[0].status !== "queued" || scopedRun[0].result_key) throw new CommercialRunNotCancellableError();

    try {
      const rows = (await sql`
        with candidate as (
          select runs.id, runs.workspace_id
          from analysis_runs as runs
          join projects on projects.id = runs.project_id and projects.workspace_id = runs.workspace_id
          where runs.id = ${runId}
            and runs.workspace_id = ${actor.workspaceId}
            and runs.status = 'queued'
            and runs.result_key is null
          for update
        ), settled as (
          update usage_counters as usage
          set reserved = usage.reserved - 1, updated_at = now()
          from candidate
          where usage.workspace_id = candidate.workspace_id and usage.reserved > 0
          returning usage.workspace_id
        ), cancelled as (
          update analysis_runs as runs
          set status = 'cancelled',
              failure_code = 'USER_CANCELLED',
              usage_state = 'released',
              completed_at = now()
          from settled
          where runs.id = ${runId}
            and runs.workspace_id = ${actor.workspaceId}
            and runs.status = 'queued'
          returning runs.id, runs.workspace_id, runs.project_id, runs.status, runs.created_by, runs.created_at, runs.failure_code, runs.result_key
        ), recorded as (
          insert into idempotency_keys (workspace_id, operation, idempotency_key, request_fingerprint, resource_id, created_at)
          select ${actor.workspaceId}, 'run.cancel', ${idempotencyKey}, ${requestFingerprint}, cancelled.id, now() from cancelled
          returning resource_id
        )
        select cancelled.* from cancelled join recorded on recorded.resource_id = cancelled.id
      `) as unknown as RunRow[];
      if (rows[0]) return runFromRow(rows[0]);
    } catch (error) {
      if (isUniqueViolation(error)) {
        const replay = await this.getIdempotency({ workspaceId: actor.workspaceId, operation: "run.cancel", key: idempotencyKey });
        if (replay?.requestFingerprint !== requestFingerprint) throw new CommercialIdempotencyConflictError();
        if (replay) {
          const rows = (await sql`
            select id, workspace_id, project_id, status, created_by, created_at, failure_code, result_key
            from analysis_runs
            where id = ${replay.resourceId} and workspace_id = ${actor.workspaceId}
            limit 1
          `) as unknown as RunRow[];
          if (rows[0]) return runFromRow(rows[0]);
        }
      }
      if (error instanceof CommercialIdempotencyConflictError) throw error;
      throw new CommercialDataUnavailableError();
    }
    throw new CommercialRunNotCancellableError();
  }

  async getUsage(actor: CommercialActor): Promise<UsageSnapshot> {
    const sql = getSql();
    const providerMode = paymentProviderMode();
    await this.assertMember(actor);
    const rows = (await sql`
      select u.consumed,
        case
          when ${providerMode} = 'alipay'
            and exists (
              select 1 from payment_entitlements as entitlement
              where entitlement.workspace_id = u.workspace_id
                and entitlement.status = 'granted'
                and entitlement.run_limit > 0
            )
            then w.run_limit
          when ${providerMode} = 'stripe'
            and s.status in ('active', 'trialing')
            and s.current_period_end > now()
            and s.entitlement_run_limit = w.run_limit
            then w.run_limit
          else 0
        end as run_limit
      from usage_counters u
      join workspaces w on w.id = u.workspace_id
      left join subscriptions s on s.workspace_id = u.workspace_id
      where u.workspace_id = ${actor.workspaceId}
    `) as unknown as Array<{ consumed: number; run_limit: number }>;
    const row = rows[0];
    if (!row) throw new CommercialDataUnavailableError();
    return { workspaceId: actor.workspaceId, consumed: Number(row.consumed), limit: Number(row.run_limit) };
  }

  async getRun(actor: CommercialActor, runId: string): Promise<AnalysisRun | null> {
    await this.assertMember(actor);
    const sql = getSql();
    const rows = (await sql`
      select id, workspace_id, project_id, status, created_by, created_at, failure_code, result_key
      from analysis_runs
      where id = ${runId} and workspace_id = ${actor.workspaceId}
      limit 1
    `) as unknown as RunRow[];
    return rows[0] ? runFromRow(rows[0]) : null;
  }

  async listRuns(actor: CommercialActor, projectId: string): Promise<AnalysisRun[]> {
    await this.assertMember(actor);
    const sql = getSql();
    const rows = (await sql`
      select runs.id, runs.workspace_id, runs.project_id, runs.status, runs.created_by, runs.created_at,
             runs.failure_code, runs.result_key
      from analysis_runs as runs
      join projects on projects.id = runs.project_id and projects.workspace_id = runs.workspace_id
      where runs.workspace_id = ${actor.workspaceId}
        and runs.project_id = ${projectId}
      order by runs.created_at desc, runs.id desc
      limit ${COMMERCIAL_RUN_HISTORY_LIMIT}
    `) as unknown as RunRow[];
    return rows.map(runFromRow);
  }

  async transitionRun(
    actor: CommercialActor,
    runId: string,
    from: AnalysisRun["status"],
    to: AnalysisRun["status"],
    update: { failureCode?: string | null; resultKey?: string | null } = {},
  ): Promise<AnalysisRun | null> {
    await this.assertMember(actor);
    if (to === "succeeded" && (from !== "running" || !update.resultKey)) return null;
    if (from === "queued" && to !== "running" && to !== "failed" && to !== "cancelled") return null;
    if (from === "running" && to !== "succeeded" && to !== "failed" && to !== "cancelled") return null;
    const sql = getSql();
    const terminal = to === "succeeded" || to === "failed" || to === "cancelled";
    const rows = terminal
      ? (await sql`with claimed as (
          select id, workspace_id
          from analysis_runs
          where id = ${runId} and workspace_id = ${actor.workspaceId} and status = ${from}
          for update
        ), settled as (
          update usage_counters as usage
          set consumed = usage.consumed + case when ${to} = 'succeeded' then 1 else 0 end,
              reserved = usage.reserved - 1,
              updated_at = now()
          from claimed
          where usage.workspace_id = claimed.workspace_id
            and usage.reserved > 0
          returning usage.workspace_id
        )
        update analysis_runs
        set status = ${to},
            failure_code = ${update.failureCode ?? null},
            result_key = ${update.resultKey ?? null},
            usage_state = case when ${to} = 'succeeded' then 'charged' else 'released' end,
            completed_at = now()
        where id = ${runId} and workspace_id = ${actor.workspaceId} and status = ${from}
          and exists (select 1 from settled where settled.workspace_id = analysis_runs.workspace_id)
        returning id, workspace_id, project_id, status, created_by, created_at, failure_code, result_key`) as unknown as RunRow[]
      : (await sql`
        update analysis_runs
        set status = ${to},
            failure_code = ${update.failureCode ?? null},
            result_key = ${update.resultKey ?? null},
            started_at = case when ${to} = 'running' then coalesce(started_at, now()) else started_at end
        where id = ${runId} and workspace_id = ${actor.workspaceId} and status = ${from}
        returning id, workspace_id, project_id, status, created_by, created_at, failure_code, result_key
      `) as unknown as RunRow[];
    return rows[0] ? runFromRow(rows[0]) : null;
  }

  async getRunWorkspace(runId: string): Promise<string | null> {
    const sql = getSql();
    const rows = (await sql`
      select workspace_id
      from analysis_runs
      where id = ${runId}
      limit 1
    `) as unknown as Array<{ workspace_id: string }>;
    return rows[0]?.workspace_id ?? null;
  }
}

export function getNeonCommercialRepository(): NeonCommercialRepository | null {
  return process.env.DATABASE_URL?.trim() ? new NeonCommercialRepository() : null;
}

export type WorkspaceProvisioningInput = {
  workspaceId: string;
  ownerSubjectId: string;
  runLimit: number;
};

/**
 * Explicit provisioning contract for an operator-controlled Clerk org.
 * Request paths never call this function; unknown workspaces remain denied.
 */
export async function ensureNeonWorkspaceProvisioned(input: WorkspaceProvisioningInput): Promise<void> {
  if (process.env.COMMERCIAL_PROVISION_CONFIRM !== "true") {
    throw new CommercialDataUnavailableError();
  }
  if (
    !commercialIdSchema.safeParse(input.workspaceId).success ||
    !commercialIdSchema.safeParse(input.ownerSubjectId).success ||
    !Number.isSafeInteger(input.runLimit) ||
    input.runLimit < 1
  ) {
    throw new CommercialDataUnavailableError();
  }
  const sql = getSql();
  const now = new Date().toISOString();
  await sql`
    insert into workspaces (id, created_at, created_by, run_limit)
    values (${input.workspaceId}, ${now}::timestamptz, ${input.ownerSubjectId}, ${input.runLimit})
    on conflict (id) do update set run_limit = excluded.run_limit
  `;
  await sql`
    insert into workspace_members (workspace_id, subject_id, role, created_at)
    values (${input.workspaceId}, ${input.ownerSubjectId}, 'owner', ${now}::timestamptz)
    on conflict (workspace_id, subject_id) do nothing
  `;
  await sql`
    insert into usage_counters (workspace_id, consumed, updated_at)
    values (${input.workspaceId}, 0, ${now}::timestamptz)
    on conflict (workspace_id) do nothing
  `;
}
