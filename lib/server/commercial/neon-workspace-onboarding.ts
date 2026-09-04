import { createHash } from "node:crypto";

import { CommercialDataUnavailableError } from "./domain";
import { getCommercialDatabaseUrl, getNeonSql } from "./neon-client";
import type {
  CommercialWorkspaceOnboardingRepository,
  CommercialWorkspaceRole,
} from "./workspace-onboarding";

function auditId(kind: string, workspaceId: string, subjectId: string): string {
  return `audit_${createHash("sha256").update(`${kind}:${workspaceId}:${subjectId}`).digest("hex").slice(0, 32)}`;
}

export class NeonCommercialWorkspaceOnboardingRepository implements CommercialWorkspaceOnboardingRepository {
  async inspect(workspaceId: string, subjectId: string) {
    const sql = getNeonSql();
    const rows = await sql`select workspace.id,
      member.role
      from workspaces as workspace
      left join workspace_members as member
        on member.workspace_id = workspace.id and member.subject_id = ${subjectId}
      where workspace.id = ${workspaceId}
      limit 1` as unknown as Array<{ id: string; role: CommercialWorkspaceRole | null }>;
    return { workspaceExists: Boolean(rows[0]), membershipRole: rows[0]?.role ?? null };
  }

  async ensure(input: { workspaceId: string; subjectId: string; role: CommercialWorkspaceRole }) {
    const sql = getNeonSql();
    const workspaceAuditId = auditId("workspace", input.workspaceId, input.subjectId);
    const memberAuditId = auditId("member", input.workspaceId, input.subjectId);
    try {
      const rows = await sql`with workspace as (
        insert into workspaces (id, created_at, created_by, run_limit)
        values (${input.workspaceId}, now(), ${input.subjectId}, 0)
        on conflict (id) do nothing
        returning id
      ), usage as (
        insert into usage_counters (workspace_id, consumed, reserved, updated_at)
        select workspace.id, 0, 0, now() from workspace
        on conflict (workspace_id) do nothing
      ), membership as (
        insert into workspace_members (workspace_id, subject_id, role, created_at)
        select workspace.id, ${input.subjectId}, ${input.role}, now() from workspace
        on conflict (workspace_id, subject_id) do update set role = workspace_members.role
        returning workspace_id, role
      ), workspace_audit as (
        insert into commercial_audit_events (event_id, workspace_id, actor_id, action, resource_id, created_at)
        select ${workspaceAuditId}, membership.workspace_id, ${input.subjectId}, 'commercial.workspace.onboarding_resolved', membership.workspace_id, now()
        from membership
        on conflict (event_id) do nothing
      ), member_audit as (
        insert into commercial_audit_events (event_id, workspace_id, actor_id, action, resource_id, created_at)
        select ${memberAuditId}, membership.workspace_id, ${input.subjectId}, 'commercial.workspace.membership_resolved', ${input.subjectId}, now()
        from membership
        on conflict (event_id) do nothing
      ) select role from membership` as unknown as Array<{ role: CommercialWorkspaceRole }>;
      if (!rows[0]) {
        const existing = await this.inspect(input.workspaceId, input.subjectId);
        if (existing.membershipRole) return { role: existing.membershipRole };
        throw new CommercialDataUnavailableError();
      }
      return rows[0];
    } catch (error) {
      if (error instanceof CommercialDataUnavailableError) throw error;
      throw new CommercialDataUnavailableError();
    }
  }
}

export function getNeonCommercialWorkspaceOnboardingRepository(): NeonCommercialWorkspaceOnboardingRepository | null {
  if (process.env.COMMERCIAL_DATA_ADAPTER !== "neon" || !getCommercialDatabaseUrl()) return null;
  return new NeonCommercialWorkspaceOnboardingRepository();
}
