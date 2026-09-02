# Staging launch operator runbook

## Status and authority

This runbook applies only to the code-frozen release candidate. It does not authorize Preview, production, B.1, B.2, Merge, deployment, or a real provider call by itself. Every step is fail-closed: stop on any unexpected exit code, response shape, status, entitlement, ownership result, or audit gap.

Only the named release owner may approve configuration injection. Only the database operator may approve migration and provisioning. Only the staging acceptance owner may authorize the ephemeral smoke credential and the real staging smoke. Record approvals outside the repository in the controlled release system.

Never print, paste into tickets, commit, or persist secret values, tokens, cookies, authorization headers, database URLs, provider responses, user content, prompts, Stripe identifiers, Blob paths, or model errors. Evidence may contain only the step name, endpoint label, HTTP status, stable error code, `PASS`/`FAIL`, timestamp, candidate reference, and approving role.

## Credential-name inventory

Before injecting values, the release owner must confirm that the controlled staging secret store has an owner, expiry/rotation plan, and recipient for each applicable variable name. Check names only; do not print values.

| Group | Required variable names |
| --- | --- |
| Application and public configuration | `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_FEEDBACK_URL`, `NEXT_PUBLIC_SUPPORT_EMAIL` |
| Clerk and workspace binding | `CLERK_SECRET_KEY`, `COMMERCIAL_WORKSPACE_BOOTSTRAP`, `COMMERCIAL_CLERK_ORG_WORKSPACE_MAP` (optional legacy map), `COMMERCIAL_AUTH_ADAPTER` |
| Neon and commercial data | `DATABASE_URL`, `COMMERCIAL_DATA_ADAPTER`, `COMMERCIAL_PAYMENT_EVENT_STORE` |
| Alipay and entitlement | `COMMERCIAL_PAYMENT_PROVIDER`, `NEXT_PUBLIC_COMMERCIAL_PAYMENT_PROVIDER`, `ALIPAY_APP_ID`, `ALIPAY_PRIVATE_KEY`, `ALIPAY_PUBLIC_KEY`, `ALIPAY_GATEWAY_URL`, `ALIPAY_NOTIFY_URL`, `ALIPAY_RETURN_URL`, `ALIPAY_PLAN_AMOUNT_MAP`, `ALIPAY_PLAN_RUN_LIMIT_MAP`, `ALIPAY_FIRST_PURCHASE_PLAN` |
| Private result storage | `BLOB_READ_WRITE_TOKEN`, `COMMERCIAL_STORAGE_ADAPTER` |
| OpenAI-compatible execution | `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `COMMERCIAL_EXECUTOR` |
| Rate limit, audit, and observation | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `REDIS_QUOTA_FAIL_OPEN`, `RATE_LIMIT_SALT`, `ANALYSIS_TOKEN_SECRET`, `BETA_EVENT_HMAC_SECRET`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, `COMMERCIAL_TELEMETRY` |

The staging adapters must resolve to Clerk, Neon, Neon billing event storage, Vercel Blob, and the OpenAI-compatible executor. `COMMERCIAL_WORKSPACE_BOOTSTRAP=clerk-org` enables the explicit admin-only onboarding bootstrap; `COMMERCIAL_CLERK_ORG_WORKSPACE_MAP` is optional for already provisioned legacy workspaces. `COMMERCIAL_RUN_LIMIT` must remain unset; quota comes from the persisted workspace entitlement.

Commercial telemetry is optional and defaults to no-op. With `COMMERCIAL_TELEMETRY=console`, it emits only `commercial_run` and `commercial_operation` events containing hashed workspace/resource/request references, allowlisted operation/lifecycle stages, status, bounded duration, and a stable error code. Operation coverage includes quota reservation/charge/release, private result reads, payment availability, onboarding, and operator recovery. It must never include article text, report/result data, Blob keys, payment identifiers or signatures, credentials, or raw provider/database errors; telemetry sink failures are ignored and never change the commercial response.

Both payment provider selectors must equal `alipay`. All Stripe variables must remain unset to prevent mixed-provider startup. Evidence records may contain variable names and PASS/FAIL status only; never include an Alipay private/public key or certificate body, signature, order identifier, callback payload, or provider response.

The following are one-shot operator inputs and must never remain in the deployed runtime: `COMMERCIAL_MIGRATION_CONFIRM`, `COMMERCIAL_PROVISION_CONFIRM`, `COMMERCIAL_PROVISION_WORKSPACE_ID`, `COMMERCIAL_PROVISION_OWNER_SUBJECT_ID`, `COMMERCIAL_PROVISION_RUN_LIMIT`, `STAGING_SMOKE_CONFIRM`, `STAGING_BASE_URL`, `STAGING_SMOKE_PLAN`, `STAGING_SMOKE_MAX_POLLS`, `STAGING_SMOKE_POLL_MS`, `STAGING_SMOKE_AUTHORIZATION`, and `STAGING_SMOKE_COOKIE`.

## Launch sequence

Execute the steps in order. A failed step blocks every later step. Do not retry until the owner has classified the failure and confirmed that retry cannot duplicate a migration, provisioning change, checkout, webhook transition, run, or usage reservation.

### 1. Frozen-candidate and configuration preflight

- Human authorization: release owner confirms the candidate reference and approves staging-only credential injection.
- Command: `node scripts/check-staging-config.mjs` (or the controlled release wrapper that invokes this script)
- Expected safe output: variable names followed by `PASS` and a final `STAGING CONFIG VALID`; no values.
- Stop if: any `FAIL`, any secret value appears, an adapter is memory/deterministic, `COMMERCIAL_RUN_LIMIT` is set, mappings disagree, a URL is not HTTPS, or one-shot inputs are orphaned.
- Evidence: candidate reference, command exit code, safe status lines, timestamp, and release-owner role only.

### 2. Commercial schema migration

- Human authorization: database operator confirms a recoverable backup/restore point and explicitly enables `COMMERCIAL_MIGRATION_CONFIRM` for this invocation.
- Command/evidence path: run `COMMERCIAL_MIGRATION_CONFIRM=true npm run commercial:migrate` with `DATABASE_URL` injected for one invocation; this worktree does not auto-run migrations.
- Expected safe output: the number of applied commercial migration statements; no database URL or statement payload.
- Stop if: confirmation or `DATABASE_URL` is absent, backup ownership is unclear, any statement fails, or output contains a credential.
- After the command: immediately remove `COMMERCIAL_MIGRATION_CONFIRM`. Do not run ad hoc rollback SQL; a failed migration requires database-owner review and the approved restore procedure.

### 3. Clerk organization and workspace onboarding

- Human authorization: the release owner confirms that Clerk organizations are enabled and that the database operator has approved the explicit `clerk-org` bootstrap policy. No client-provided workspace id is accepted.
- Command/evidence path: open `/sign-in` or `/sign-up`, complete the controlled Clerk flow, then continue to `/onboarding`. The page must show an organization selector and a workspace state rather than a fake dashboard.
- Expected safe output: `organization_required`, `bootstrap_required`, `membership_required`, or `ready` state only. An `org:admin` may submit `{ "intent": "setup" }` once; the service creates a deterministic workspace id, owner membership, zero-quota usage row, and audit records idempotently. An `org:member` without a persisted `workspace_members` row cannot self-join or elevate.
- Stop if: `/onboarding` accepts `workspaceId`/`orgId` from the URL or body, an unknown org silently maps to a shared workspace, a member can self-provision, a workspace is created with nonzero/guessed quota, or a repeat request creates duplicate rows/audits.

### 4. One-shot workspace provisioning

- Human authorization: database operator and workspace owner approve the Clerk org-to-workspace mapping, owner subject, and persisted run limit. Inject the `COMMERCIAL_PROVISION_*` inputs only for this invocation.
- Command/evidence path: use the admin-only `/onboarding` setup flow when `COMMERCIAL_WORKSPACE_BOOTSTRAP=clerk-org` is explicitly enabled. Any separate operator provisioning procedure must be supplied and approved outside this repository before use; this worktree does not provide or auto-run such a command, and it never auto-provisions from ordinary project/run requests.
- Expected safe output: `Commercial workspace provisioning completed.` without workspace, subject, quota, or connection values.
- Stop if: the workspace is neither covered by the approved legacy map nor created through the explicit `clerk-org` onboarding policy, the member/role or run limit is unapproved, the command reports a stable blocking code, or any identifier/value is printed.
- After the command: remove every `COMMERCIAL_PROVISION_*` variable. Provisioning is idempotent but is not a general request-path fallback and must not be automatically retried.

### 5. Post-operation configuration and release gates

- Human authorization: release owner confirms all one-shot migration/provisioning inputs are removed.
- Commands: `node scripts/check-staging-config.mjs`, then `npm run release:check`.
- Expected safe output: staging ends with `STAGING CONFIG VALID`; release exits successfully without printing values.
- Stop if: either command fails, a one-shot input remains, or release and staging disagree. Do not bypass a check to continue.

### 6. Health and Clerk workspace/member boundary

- Human authorization: staging acceptance owner authorizes read-only health and authenticated identity checks against the approved HTTPS staging origin.
- Command/evidence path: the authorized `node scripts/staging-smoke.mjs` begins with `health/readiness` and `clerk/workspace` after its own config check.
- Expected safe output: endpoint labels with `PASS` and HTTP status only. Health must be `ok` with every readiness check true. The authenticated actor must resolve to the expected workspace and a persisted `workspace_members` row.
- The legacy anonymous execution routes (`/api/analysis-session`, `/api/evaluate-scoring`, `/api/predict-questions`, `/api/qa-diagnostic`, `/api/generate-patches`, and `/api/warmup`) must return `401 AUTHENTICATION_REQUIRED` before parsing content or invoking a provider. Real execution is available only through the authenticated project-level commercial analyze route, which derives workspace/project ownership server-side and requires persisted membership and available entitlement/quota.
- Stop if: health is degraded, auth is unavailable, org mapping is missing, membership is absent, an anonymous request returns anything other than the stable migration rejection, the commercial analyze route accepts an unowned project or lacks entitlement/quota enforcement, or a cross-workspace request is not rejected.

### 7. Alipay checkout, notify, refund, reconciliation, and quota

- Human authorization: billing owner approves the one-time Alipay plan-to-amount mapping, merchant account, settlement account, and refund/statement owners. A separate operator records notify delivery evidence without copying payloads.
- Command/evidence path: the provider-neutral smoke path checks checkout HTTPS, entitlement expiry, usage quota, and safe response fields. Alipay notify/replay, refund/query, and reconciliation are verified only through the controlled merchant console or approved staging adapter once those routes are wired.
- Expected safe output: only endpoint labels, HTTP status, stable error codes, and `PASS`/`FAIL`. No customer, subscription, price, session, workspace, or webhook payload is printed.
- Stop if: checkout URL is not HTTPS; the client can select an unapproved amount or identity; RSA2 verification fails; duplicate or out-of-order notify changes entitlement incorrectly; refund/statement mismatch is ignored; closed/refunded/unknown status grants quota; or merchant credentials are missing.

### 8. Commercial run, private result, Blob, and AI executor

- Human authorization: staging acceptance owner approves a non-sensitive test document and confirms model cost/retry limits.
- Precondition: a persisted workspace entitlement with available quota must already exist from the approved checkout/notify flow or controlled provisioning. The smoke checkout call only validates the HTTPS cashier URL; it does not grant quota or make the subsequent run admissible by itself.
- Command/evidence path: `node scripts/staging-smoke.mjs` creates a project, launches one commercial run, polls `queued`/`running` to a terminal state, reads the private result, and performs the quota refresh check.
- Expected safe output: endpoint labels, HTTP status, stable failure code, and final `STAGING SMOKE PASS (not staging acceptance)`. The result must be workspace/run scoped and must not expose a Blob key, prompt, user content, provider error, or secret.
- Stop if: the client can choose workspace/run ownership; membership or quota is bypassed; a duplicate launch consumes twice; the run does not reach `succeeded`; Blob ownership fails; result shape is invalid; AI/provider configuration is missing; or a provider/Blob failure is reported as success.

### 9. Retry, expiry, failure, and recovery checks

- Human authorization: billing, database, and staging owners approve controlled replay scenarios before any retry.
- Command/evidence path: use the fixed smoke sequence once per authorization; use provider staging consoles only for approved duplicate webhook, out-of-order event, subscription expiry/cancel, and retry evidence.
- Expected safe output: duplicate requests replay safely, retryable failures retain a stable retry code, failed processing can retry, stale events do not widen entitlement, expired subscriptions reduce quota, and failed runs/results remain fail-closed.
- Stop if: retries create extra checkout/run/usage records, a failed webhook is permanently marked successful, stale state widens entitlement, expiry leaves paid quota active, or raw provider errors/user content appear.

### 10. Audit closeout and launch decision

- Human authorization: release owner, database owner, billing owner, and staging acceptance owner sign the evidence index. Security owner confirms credential rotation/expiry and observation coverage.
- Command: `git diff --check -- . ':(exclude)videos/**'`
- Expected safe output: exit code zero and no output.
- Stop if: evidence is incomplete, any unapproved drift exists, a secret/value was captured, ownership is unclear, or any prior stop condition remains open.
- Decision: local checks and smoke output never mean production authorization. Keep the candidate at `release candidate code-frozen / waiting staging credentials` until all staging evidence is independently accepted.

## Smoke authorization

The staging acceptance owner may inject exactly one ephemeral `STAGING_SMOKE_AUTHORIZATION` or `STAGING_SMOKE_COOKIE`, set `STAGING_SMOKE_CONFIRM=true`, provide an HTTPS `STAGING_BASE_URL`, and then run `node scripts/staging-smoke.mjs`. The credential must be scoped, short-lived, revoked immediately afterward, and never written to shell history, logs, the repository, or evidence. Clear all `STAGING_SMOKE_*` variables after the run and rerun `node scripts/check-staging-config.mjs`.

The smoke runner exits nonzero on a failed gate and prints only endpoint labels, status codes, stable error codes, and `PASS`/`FAIL`. Do not rerun automatically. `STAGING SMOKE PASS (not staging acceptance)` is a data point for human review, not authorization to deploy or enter production.

## Rollback and containment order

1. Stop the acceptance sequence and block new commercial launches through the operator-controlled staging access path; do not change application code during incident triage.
2. Revoke the ephemeral smoke credential and clear every one-shot operator variable.
3. Disable further billing acceptance actions in the provider staging console under billing-owner authorization; preserve signed webhook/event evidence without payloads.
4. Preserve database and application evidence. Do not manually rewrite membership, usage, subscription, idempotency, run, or result records.
5. Database owner decides whether to restore the approved backup. Release owner decides whether to return to the prior approved candidate through the external deployment process.
6. Re-run configuration checks locally only after remediation. A new migration, provisioning, smoke, or launch attempt requires fresh human authorization and a new evidence record.

No rollback step authorizes production, destructive database action, secret disclosure, or bypassing a fail-closed gate.
