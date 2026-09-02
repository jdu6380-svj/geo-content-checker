# Staging handoff template

Use this template for the release-candidate handoff after the code-frozen candidate has been selected. It is a checklist, not an authorization to deploy or to call a real provider. Record values, credentials, tokens, cookies, payloads, customer data, order identifiers, Blob keys, signatures, and provider responses only in the controlled release system, never in this file.

## Candidate and approvals

| Field | Entry |
| --- | --- |
| Candidate reference / commit | `[CONTROLLED-REFERENCE]` |
| Release owner | `[ROLE / EXTERNAL REFERENCE]` |
| Database owner | `[ROLE / EXTERNAL REFERENCE]` |
| Billing owner | `[ROLE / EXTERNAL REFERENCE]` |
| Staging acceptance owner | `[ROLE / EXTERNAL REFERENCE]` |
| Security/observability reviewer | `[ROLE / EXTERNAL REFERENCE]` |
| Status | `release candidate code-frozen / waiting staging credentials` |

## Variable-name confirmation

Confirm names and ownership in the controlled secret store. Do not copy values here.

| Group | Names to confirm |
| --- | --- |
| App and support | `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_FEEDBACK_URL`, `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_SENTRY_DSN` |
| Clerk/workspace | `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `COMMERCIAL_AUTH_ADAPTER`, `COMMERCIAL_WORKSPACE_BOOTSTRAP`, `COMMERCIAL_CLERK_ORG_WORKSPACE_MAP` (optional) |
| Neon/commercial data | `DATABASE_URL`, `COMMERCIAL_DATA_ADAPTER`, `COMMERCIAL_PAYMENT_EVENT_STORE` |
| Blob | `BLOB_READ_WRITE_TOKEN`, `COMMERCIAL_STORAGE_ADAPTER` |
| AI executor | `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `COMMERCIAL_EXECUTOR` |
| Redis/security | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `REDIS_QUOTA_FAIL_OPEN`, `RATE_LIMIT_SALT`, `ANALYSIS_TOKEN_SECRET`, `BETA_EVENT_HMAC_SECRET` |
| Sentry/telemetry | `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, `COMMERCIAL_TELEMETRY` |
| Alipay | `COMMERCIAL_PAYMENT_PROVIDER`, `NEXT_PUBLIC_COMMERCIAL_PAYMENT_PROVIDER`, `ALIPAY_APP_ID`, `ALIPAY_PRIVATE_KEY`, `ALIPAY_PUBLIC_KEY`, `ALIPAY_GATEWAY_URL`, `ALIPAY_NOTIFY_URL`, `ALIPAY_RETURN_URL`, `ALIPAY_PLAN_AMOUNT_MAP`, `ALIPAY_PLAN_RUN_LIMIT_MAP`, `ALIPAY_FIRST_PURCHASE_PLAN` |

The selectors must resolve to `clerk`, `neon`, `vercel-blob`, `openai-compatible`, and `alipay`; `REDIS_QUOTA_FAIL_OPEN` must be `false`; Stripe variables and all one-shot operator/smoke variables must be unset after their invocation. Amount/run-limit mappings must match and include `ALIPAY_FIRST_PURCHASE_PLAN=new_user`.

## Execution order

Run each step only after the previous step has an accepted safe result. Record only command/endpoint label, exit status or HTTP status, stable error code, `PASS`/`FAIL`, timestamp, candidate reference, and approving role.

1. `npm run staging:check` with no one-shot inputs. Stop on any `FAIL`, mixed provider, non-HTTPS URL, unsafe adapter, missing dependency, or leaked value.
2. Database owner authorizes `COMMERCIAL_MIGRATION_CONFIRM=true npm run commercial:migrate` against a recoverable staging backup; remove the confirmation immediately and do not run ad hoc SQL.
3. Release/database owners authorize Clerk organization and workspace setup at `/sign-in` → `/sign-up` → `/onboarding`; verify server-derived org/workspace/member ownership and idempotency.
4. If controlled provisioning is required, use the admin-only onboarding flow. A separate one-shot operator procedure must be supplied and approved outside this repository before use; remove every `COMMERCIAL_PROVISION_*` variable afterward.
5. Re-run `npm run staging:check`, then `npm run release:check`; both must pass without one-shot values.
6. Check `GET /api/health` and confirm every readiness check is true. Anonymous legacy analysis routes must return `401 AUTHENTICATION_REQUIRED`; commercial routes must require actor, workspace membership, entitlement, and quota.
7. Billing owner verifies Alipay HTTPS checkout, raw notify RSA2 verification, duplicate/out-of-order event idempotency, entitlement expiry, refund review, and quota boundaries. Checkout URL validation alone does not grant quota.
8. After approved entitlement/quota exists, the staging acceptance owner may run `STAGING_SMOKE_CONFIRM=true STAGING_BASE_URL=... npm run staging:smoke` once with one ephemeral authorization or cookie. The runner must reach private result and quota checks without exposing content, keys, order IDs, signatures, or provider errors.
9. Owners review retryable failure, expiry, recovery, audit, rollback, and credential revocation evidence. Keep B.1 at `0/60 LOCKED`; do not promote, merge, or deploy from this template.

## Evidence and stop conditions

Expected evidence is a redacted status line, endpoint label, stable error code, HTTP status, timestamp, and responsible role. Stop immediately for a leaked value, failed gate, missing ownership, cross-workspace read, quota bypass, duplicate entitlement/charge, non-HTTPS callback, raw provider error, or any smoke result that reports success without a persisted private result.

Final handoff status remains `release candidate code-frozen / waiting staging credentials` until all external credentials, migration evidence, provider callbacks, private result checks, and named owner approvals are accepted outside the repository.
