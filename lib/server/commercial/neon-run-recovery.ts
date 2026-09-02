import { CommercialIdempotencyConflictError, CommercialNotFoundError, type AnalysisRun, type CommercialActor } from "./domain";
import { getNeonSql } from "./neon-client";
import {
  CommercialRunRecoveryConflictError,
  reconciliationFor,
  type CommercialRunRecoveryRepository,
  type RunRecoveryActionName,
  type RunRecoverySnapshot,
  type RunUsageState,
  type SafeRunObservation,
  type SafeRunRecoveryAction,
} from "./run-recovery";

type RecoveryRow = { action_id: string; run_id: string; action: RunRecoveryActionName; status: "completed"; created_at: string | Date; request_fingerprint: string };
type ObservationRow = { id: string; status: AnalysisRun["status"]; usage_state: RunUsageState; result_recorded: boolean; created_at: string | Date };

function iso(value: string | Date): string { return value instanceof Date ? value.toISOString() : new Date(value).toISOString(); }
function uniqueViolation(error: unknown): boolean { return typeof error === "object" && error !== null && "code" in error && error.code === "23505"; }
function safeAction(row: RecoveryRow): SafeRunRecoveryAction { return { id: row.action_id, runId: row.run_id, action: row.action, status: row.status, createdAt: iso(row.created_at) }; }

export class NeonCommercialRunRecoveryRepository implements CommercialRunRecoveryRepository {
  async assertOwner(actor: CommercialActor): Promise<void> {
    const sql = getNeonSql();
    const rows = await sql`select 1 from workspace_members where workspace_id = ${actor.workspaceId} and subject_id = ${actor.subjectId} and role = 'owner' limit 1` as unknown as unknown[];
    if (!rows[0]) throw Object.assign(new Error("仅工作区所有者可执行此操作。"), { code: "FORBIDDEN", status: 403 });
  }

  async list(workspaceId: string): Promise<RunRecoverySnapshot> {
    const sql = getNeonSql();
    const rows = await sql`select id, status, usage_state, (result_key is not null) as result_recorded, created_at from analysis_runs where workspace_id = ${workspaceId} order by created_at desc limit 50` as unknown as ObservationRow[];
    const usage = await sql`select reserved from usage_counters where workspace_id = ${workspaceId} limit 1` as unknown as Array<{ reserved: number | string }>;
    const runs: SafeRunObservation[] = rows.map((row) => {
      const base = { runId: row.id, status: row.status, usageState: row.usage_state, resultRecorded: Boolean(row.result_recorded), createdAt: iso(row.created_at) };
      return { ...base, reconciliation: reconciliationFor(base) };
    });
    return { runs, reservedCount: Number(usage[0]?.reserved ?? 0), observedReservedRuns: runs.filter((run) => run.usageState === "reserved").length, orphanBlobPolicy: "manual_infrastructure_reconciliation" };
  }

  private async existing(workspaceId: string, idempotencyKey: string): Promise<RecoveryRow | null> {
    const sql = getNeonSql();
    const rows = await sql`select action_id, run_id, action, status, created_at, request_fingerprint from commercial_run_recovery_actions where workspace_id = ${workspaceId} and idempotency_key = ${idempotencyKey} limit 1` as unknown as RecoveryRow[];
    return rows[0] ?? null;
  }

  async recover(input: { id: string; workspaceId: string; actorId: string; runId: string; action: RunRecoveryActionName; idempotencyKey: string; requestFingerprint: string }): Promise<SafeRunRecoveryAction | null> {
    const replay = await this.existing(input.workspaceId, input.idempotencyKey);
    if (replay) {
      if (replay.request_fingerprint !== input.requestFingerprint) throw new CommercialIdempotencyConflictError();
      return safeAction(replay);
    }
    const sql = getNeonSql();
    try {
      const rows = await sql`with claimed as (
        select id, workspace_id, status, usage_state
        from analysis_runs
        where id = ${input.runId} and workspace_id = ${input.workspaceId}
          and usage_state = 'reserved'
          and result_key is null
          and ((${input.action} = 'cancel_and_release' and status in ('queued', 'running')) or (${input.action} = 'release_reservation' and status in ('failed', 'cancelled')))
        for update
      ), released as (
        update usage_counters as usage set reserved = usage.reserved - 1, updated_at = now()
        from claimed where usage.workspace_id = claimed.workspace_id and usage.reserved > 0
        returning usage.workspace_id
      ), repaired as (
        update analysis_runs as run
        set status = case when ${input.action} = 'cancel_and_release' then 'cancelled' else run.status end,
            usage_state = 'released',
            failure_code = case when ${input.action} = 'cancel_and_release' then 'OPERATOR_CANCELLED' else run.failure_code end,
            completed_at = case when ${input.action} = 'cancel_and_release' then now() else run.completed_at end
        from released where run.id = ${input.runId} and run.workspace_id = released.workspace_id
        returning run.id, run.workspace_id
      ), recorded as (
        insert into commercial_run_recovery_actions (action_id, workspace_id, actor_id, run_id, idempotency_key, request_fingerprint, action, status, created_at)
        select ${input.id}, repaired.workspace_id, ${input.actorId}, repaired.id, ${input.idempotencyKey}, ${input.requestFingerprint}, ${input.action}, 'completed', now() from repaired
        returning action_id, run_id, action, status, created_at, request_fingerprint
      ), audited as (
        insert into commercial_audit_events (event_id, workspace_id, actor_id, action, resource_id, created_at)
        select ${`audit_${input.id}`}, ${input.workspaceId}, ${input.actorId}, ${`commercial.run.${input.action}`}, recorded.run_id, now() from recorded
        on conflict (event_id) do nothing
      ) select action_id, run_id, action, status, created_at, request_fingerprint from recorded` as unknown as RecoveryRow[];
      if (rows[0]) return safeAction(rows[0]);
    } catch (error) {
      if (!uniqueViolation(error)) throw error;
      const concurrent = await this.existing(input.workspaceId, input.idempotencyKey);
      if (concurrent?.request_fingerprint !== input.requestFingerprint) throw new CommercialIdempotencyConflictError();
      if (concurrent) return safeAction(concurrent);
    }
    const run = await sql`select 1 from analysis_runs where id = ${input.runId} and workspace_id = ${input.workspaceId} limit 1` as unknown as unknown[];
    if (!run[0]) throw new CommercialNotFoundError();
    throw new CommercialRunRecoveryConflictError();
  }
}
