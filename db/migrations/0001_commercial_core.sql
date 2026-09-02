-- Commercial schema for the Neon adapter. It is never auto-executed.
-- Run scripts/migrate-commercial.mjs only with explicit DATABASE_URL and
-- COMMERCIAL_MIGRATION_CONFIRM=true after provisioning has been reviewed.

create table if not exists workspaces (
  id text primary key,
  created_at timestamptz not null,
  created_by text not null,
  run_limit bigint not null check (run_limit >= 0)
);

alter table workspaces drop constraint if exists workspaces_run_limit_check;
alter table workspaces add constraint workspaces_run_limit_check check (run_limit >= 0);

create table if not exists workspace_members (
  workspace_id text not null references workspaces(id),
  subject_id text not null,
  role text not null check (role in ('owner', 'member')),
  created_at timestamptz not null,
  primary key (workspace_id, subject_id)
);

create table if not exists projects (
  id text primary key,
  workspace_id text not null references workspaces(id),
  name text not null,
  created_by text not null,
  created_at timestamptz not null
);

create table if not exists analysis_runs (
  id text primary key,
  workspace_id text not null references workspaces(id),
  project_id text not null references projects(id),
  status text not null check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  created_by text not null,
  created_at timestamptz not null,
  started_at timestamptz,
  completed_at timestamptz,
  failure_code text,
  result_key text,
  usage_state text not null default 'unknown' check (usage_state in ('unknown', 'reserved', 'charged', 'released'))
);

alter table analysis_runs add column if not exists started_at timestamptz;
alter table analysis_runs add column if not exists completed_at timestamptz;
alter table analysis_runs add column if not exists failure_code text;
alter table analysis_runs add column if not exists result_key text;
alter table analysis_runs add column if not exists usage_state text not null default 'unknown';
alter table analysis_runs drop constraint if exists analysis_runs_usage_state_check;
alter table analysis_runs add constraint analysis_runs_usage_state_check check (usage_state in ('unknown', 'reserved', 'charged', 'released'));

create table if not exists usage_counters (
  workspace_id text primary key references workspaces(id),
  consumed bigint not null check (consumed >= 0),
  reserved bigint not null default 0 check (reserved >= 0),
  updated_at timestamptz not null
);

alter table usage_counters add column if not exists reserved bigint not null default 0;
alter table usage_counters drop constraint if exists usage_counters_reserved_check;
alter table usage_counters add constraint usage_counters_reserved_check check (reserved >= 0);

-- Every workspace must have one usage row before Neon run creation is enabled.
-- Provisioning/seed is intentionally outside this migration and must be reviewed.

create table if not exists idempotency_keys (
  workspace_id text not null references workspaces(id),
  operation text not null,
  idempotency_key text not null,
  request_fingerprint text not null,
  resource_id text not null,
  created_at timestamptz not null,
  primary key (workspace_id, operation, idempotency_key)
);

create table if not exists billing_events (
  event_id text primary key,
  event_type text not null,
  status text not null check (status in ('pending', 'processing', 'completed')),
  received_at timestamptz not null,
  completed_at timestamptz,
  lease_until timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text
);

create table if not exists subscriptions (
  workspace_id text primary key references workspaces(id),
  customer_id text not null,
  subscription_id text not null unique,
  status text not null,
  price_id text,
  current_period_end timestamptz,
  entitlement_run_limit bigint not null default 0 check (entitlement_run_limit >= 0),
  event_created bigint not null default 0,
  updated_at timestamptz not null
);

alter table subscriptions
  add column if not exists event_created bigint not null default 0;
alter table subscriptions
  add column if not exists entitlement_run_limit bigint not null default 0;
alter table subscriptions drop constraint if exists subscriptions_entitlement_run_limit_check;
alter table subscriptions add constraint subscriptions_entitlement_run_limit_check check (entitlement_run_limit >= 0);

create table if not exists checkout_idempotency (
  workspace_id text not null references workspaces(id),
  idempotency_key text not null,
  actor_id text not null,
  request_fingerprint text not null,
  price_id text not null,
  status text not null check (status in ('pending', 'completed')),
  session_id text unique,
  checkout_url text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (workspace_id, idempotency_key)
);

create table if not exists portal_idempotency (
  workspace_id text not null references workspaces(id),
  idempotency_key text not null,
  actor_id text not null,
  request_fingerprint text not null,
  status text not null check (status in ('pending', 'completed')),
  portal_url text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (workspace_id, idempotency_key)
);

create table if not exists payment_orders (
  workspace_id text not null references workspaces(id),
  actor_id text not null,
  out_trade_no text primary key,
  provider text not null check (provider in ('stripe', 'alipay')),
  plan_key text not null,
  amount text not null,
  status text not null check (status in ('pending', 'paid', 'closed', 'refunded', 'unknown')),
  provider_trade_no text unique,
  checkout_url text,
  idempotency_key text not null,
  request_fingerprint text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (workspace_id, idempotency_key)
);

create table if not exists payment_callbacks (
  provider text not null check (provider in ('stripe', 'alipay')),
  callback_id text not null,
  out_trade_no text,
  status text not null check (status in ('pending', 'processing', 'completed', 'failed')),
  signature_verified boolean not null,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  received_at timestamptz not null,
  completed_at timestamptz,
  primary key (provider, callback_id)
);

create table if not exists payment_refunds (
  workspace_id text not null references workspaces(id),
  out_trade_no text not null references payment_orders(out_trade_no),
  refund_request_id text not null,
  provider_refund_no text unique,
  status text not null check (status in ('requested', 'processing', 'succeeded', 'failed')),
  amount text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (workspace_id, refund_request_id)
);

create table if not exists payment_reconciliation (
  provider text not null check (provider in ('stripe', 'alipay')),
  reconciliation_id text primary key,
  period_start timestamptz not null,
  period_end timestamptz not null,
  status text not null check (status in ('pending', 'matched', 'mismatch', 'failed')),
  mismatch_count integer not null default 0 check (mismatch_count >= 0),
  created_at timestamptz not null,
  completed_at timestamptz
);

create table if not exists payment_entitlements (
  event_id text primary key,
  workspace_id text not null references workspaces(id),
  out_trade_no text not null references payment_orders(out_trade_no),
  plan_key text not null,
  run_limit integer not null check (run_limit >= 0),
  status text not null check (status in ('granted', 'review')),
  review_reason text check (review_reason in ('closed', 'refund')),
  created_at timestamptz not null,
  unique (out_trade_no, status)
);

-- The new-user package is a one-time successful entitlement per workspace.
-- Pending orders do not appear here and therefore do not consume the claim.
create unique index if not exists payment_entitlements_new_user_once
  on payment_entitlements (workspace_id, plan_key)
  where plan_key = 'new_user' and status = 'granted';

create table if not exists payment_operator_requests (
  request_id text primary key,
  workspace_id text not null references workspaces(id),
  actor_id text not null,
  idempotency_key text not null,
  operation text not null check (operation in ('refund_review', 'reconciliation')),
  target_ref text not null,
  status text not null check (status in ('pending_review', 'pending', 'completed', 'failed')),
  created_at timestamptz not null,
  unique (workspace_id, idempotency_key)
);

create table if not exists commercial_audit_events (
  event_id text primary key,
  workspace_id text not null references workspaces(id),
  actor_id text not null,
  action text not null,
  resource_id text not null,
  created_at timestamptz not null
);

create table if not exists commercial_run_recovery_actions (
  action_id text primary key,
  workspace_id text not null references workspaces(id),
  actor_id text not null,
  run_id text not null references analysis_runs(id),
  idempotency_key text not null,
  request_fingerprint text not null,
  action text not null check (action in ('cancel_and_release', 'release_reservation')),
  status text not null check (status = 'completed'),
  created_at timestamptz not null,
  unique (workspace_id, idempotency_key)
);
