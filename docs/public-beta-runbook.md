# Public Beta Runbook

## Freeze

- Work on `feature/public-beta-hardening`, then merge to `main` after every release blocker is cleared.
- Do not resume visual redesign, layout refactors, animation work, or component restructuring during Beta hardening.
- Allow only P0/P1 fixes, security, accessibility, legal links, feedback, and one-at-a-time conversion copy experiments.

## Required Services

- Vercel Preview and Production project.
- DeepSeek OpenAI-compatible credentials.
- Upstash Redis REST credentials.
- Sentry project, DSN, org, project name, and auth token.
- Google Form URL and support email.
- Three distinct secrets of at least 32 bytes: `RATE_LIMIT_SALT`, `ANALYSIS_TOKEN_SECRET`, and `BETA_EVENT_HMAC_SECRET`.

Run `npm run release:check` before Preview or Production deployment. Vercel builds also run the same check automatically.

### Preview Release Configuration

The following names and values must exist in the Vercel `Preview` scope. Variable names alone are not sufficient; `release:check` validates non-empty values and the constraints shown below without printing credentials.

| Area | Required variables | Release constraint |
| --- | --- | --- |
| Model | `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL` | Base URL must use HTTPS; key and model must be non-empty. |
| Redis | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Use these exact application variable names even if an integration also creates vendor-prefixed aliases. The URL must use HTTPS. |
| Quota mode | `REDIS_QUOTA_FAIL_OPEN` | Must be exactly `false`. |
| Security | `RATE_LIMIT_SALT`, `ANALYSIS_TOKEN_SECRET`, `BETA_EVENT_HMAC_SECRET` | Each must be at least 32 bytes and all three must be distinct. |
| Feedback | `NEXT_PUBLIC_FEEDBACK_URL`, `NEXT_PUBLIC_SUPPORT_EMAIL` | Feedback URL must use HTTPS; support email must be valid. |
| Sentry runtime | `NEXT_PUBLIC_SENTRY_DSN` | Required HTTPS client DSN. `SENTRY_DSN` is an optional server alias and does not satisfy the Health gate by itself. |
| Sentry build | `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | All must be non-empty so release builds can upload and associate artifacts. |

`GET /api/health` returns `200 / ok` only when its five runtime groups pass: model, Redis, three distinct security secrets, feedback/support, and `NEXT_PUBLIC_SENTRY_DSN`. `release:check` is stricter: it additionally requires Sentry build credentials and fail-closed Redis quota mode.

The A.5 Preview on `feature/public-beta-hardening` uses the official DeepSeek OpenAI-compatible endpoint: `OPENAI_BASE_URL=https://api.deepseek.com` and `OPENAI_MODEL=deepseek-v4-flash`. Store `OPENAI_API_KEY` as a Sensitive variable scoped to the same Preview branch. Do not change Production or reuse an unscoped provider credential. Updating these variables does not affect an existing Deployment; wait for the next approved release-documentation or product fix Commit to create a fresh Git Integration Preview.

The following settings belong to Phase B or the Commercial Readiness Check. They are not A.5 Preview blockers and are not part of the five Health booleans:

- Validate `MODEL_INPUT_COST_USD_PER_MILLION_TOKENS` and `MODEL_OUTPUT_COST_USD_PER_MILLION_TOKENS` against current provider pricing during Phase B cost acceptance.
- Approve `SENTRY_TRACES_SAMPLE_RATE` before broader Beta traffic or Production readiness.
- Configure and verify the provider-side daily spend alert during Commercial Readiness.

### Preview Automation Runner

Protected Preview black-box validation uses the GitHub Environment named `Preview`, not repository-level secrets and not Vercel application environment variables. During the Draft PR, the workflow runs only for updates to `feature/public-beta-hardening` and waits for the Git Integration Preview matching the PR head SHA. The manual workflow entry remains available after the workflow exists on the default branch.

Configure the following values manually:

| GitHub Environment setting | Name | Purpose |
| --- | --- | --- |
| Secret | `VERCEL_AUTOMATION_BYPASS_SECRET` | Sends Vercel's official `x-vercel-protection-bypass` header from the black-box runner. |
| Secret | `VERCEL_TOKEN` | Performs a read-only Vercel Deployment metadata lookup before model requests. |
| Variable | `VERCEL_ORG_ID` | Restricts the metadata lookup to the intended Vercel team. |
| Variable | `VERCEL_PROJECT_ID` | Requires the Deployment to belong to the intended project. |

Do not add these secrets to `.env.example`, Preview application variables, build output, shell history, screenshots, PR comments, or chat. The workflow never prints them or passes `VERCEL_TOKEN` to the application.

## Preview Validation

1. Run `npm run check`, `npm run security:unit`, `npm run build`, `npm run blackbox:fallback`, and `git diff --check` under Node 22.
2. Verify the Draft PR Diff against `origin/main`; do not continue if it contains credentials, artifacts, or scope expansion.
3. Confirm every required variable above exists in Vercel `Preview` with the intended branch scope. Vercel Sensitive values are not exportable, so the Git Integration Preview build is the authoritative `release:check` value gate.
4. Push a real product, defect, security, stability, or release-documentation commit to `feature/public-beta-hardening`. Do not create an empty or deployment-only commit.
5. Let the existing Vercel Git Integration create the Preview. Do not use Vercel CLI deployment for A.5.
6. Require the Preview build's automatic `release:check` to pass. Before opening the URL, verify Source is GitHub, Branch and Commit SHA match the push, Target and Environment are both `preview`, and no Production deployment was created.
7. Confirm the Preview URL belongs to that deployment and neither equals nor redirects to a Production domain or alias.
8. Confirm `GET /api/health` returns HTTP 200 with `status: "ok"` and all five checks are `true`.
9. Complete browser UX smoke at `1440x900`, `1280x800`, and `390x844`, including Editor, real Loading, Report, score rail, Diagnosis, Patch, keyboard operation, and overflow.
10. Require the `Preview Blackbox` workflow for the PR head SHA to pass. The workflow waits for the matching Git Integration Preview, or accepts an explicit URL and SHA through its future manual entry, then verifies URL, Project, Git source, Preview Target, Branch, READY state, and Deployment SHA before running `blackbox:model -- --skip-declared-length-check`. Vercel buffers incomplete request bodies before they reach the application, so the malformed declared-length transport check remains mandatory in the local `security:unit` and `blackbox:fallback` gates instead. Every model-capable route must return `source: "model"`; fallback, mocks, and fixtures do not satisfy this gate.
11. Complete one real Preview analysis, then trigger a controlled `A5SmokeError` through the existing client-side Sentry global error capture. Do not add a business test route. Verify Sentry receives a `preview` event with the matching Release SHA and stack but without body, Prompt, evidence, cookies, User-Agent, raw IP, client UUID, authorization headers, or secrets.
12. Verify `geo_api_request` structured logs contain only fields from the code-owned top-level allowlist. The allowlist categories are request/route/status/timing/source/rate-limit metadata; model and budget status/timing; Token counts and optional cost; and bounded response-shape, Evidence-count, schema, and parse diagnostics. `geo_api_stage` is checked separately for request ID, route, stage, timestamp, and latency. Neither stream records request/response bodies, article or question text, Prompt, Evidence quotes, model content/reasoning, credentials/authentication material, cookies, query strings, User-Agent, client identifiers, secrets, or provider request identifiers.

Changing a Preview variable does not retroactively update an existing Deployment. For A.5, do not click Redeploy and do not use Vercel CLI deployment; wait for the real commit in step 4 to create a new Git Integration Preview.

Local validation can be affected by a workstation running Node 24 or by a sandbox that blocks local-port connections. A local `blackbox:fallback` failure under those conditions is not the final release result. The final decision requires CI on Node 22, a Vercel Preview, the real provider API, and `blackbox:model` returning `source: "model"`.

## Model Acceptance

Prepare a private JSON corpus with exactly 10 real Chinese articles using the shape in `docs/model-validation-corpus.example.json`.

```bash
GEO_BASE_URL=https://preview.example.com \
  npm run model:validate -- --corpus=/absolute/path/to/corpus.json
```

The harness runs every article three times, requires `source=model`, checks score and dimension ranges, compares answerability levels, validates literal evidence quotes, and writes a review artifact under `outputs/`.

Production remains blocked until a human reviews at least 50 exported evidence, FAQ, and fact-card items. Fabricated quotes have zero tolerance. Semantic errors must remain below 10%, and Patch content must not change meaning or add external facts, numbers, or outcome promises.

## Cost Controls

- Keep the existing route timeouts, output Token limits, 12,000-character article limit, 64KB compressed body limit, and 128KB decompressed body limit.
- Configure `MODEL_INPUT_COST_USD_PER_MILLION_TOKENS` and `MODEL_OUTPUT_COST_USD_PER_MILLION_TOKENS` from current provider pricing.
- Configure a provider-side DeepSeek spend alert at USD 10 per day. This is an account setting and cannot be enforced by repository code.
- Review model latency, Token usage, estimated cost, 429s, timeouts, invalid JSON, and fallback rates before Production.

## Production Release

1. Confirm Preview acceptance, model acceptance, Evidence Quality Check, Sentry privacy review, and rollback readiness.
2. Merge `feature/public-beta-hardening` into `main`.
3. Deploy `main` to Vercel Production and retain the previous deployment as the rollback point.
4. Confirm health, run `blackbox:model`, and complete one manual end-to-end analysis.
5. Create and push the annotated tag only after Production passes:

```bash
git tag -a v0.1.0-beta.1 -m "Public beta v0.1.0-beta.1"
git push origin v0.1.0-beta.1
```

## Beta Observation

Use `npm run metrics:beta` with production Upstash credentials. The report aggregates only the most recent 90 UTC days and outputs counts and rates without anonymous identifiers.

Primary 30-day gates:

- 100 or more independent visitors.
- 300 or more completed analyses.
- First-analysis completion rate of at least 50%.
- Report view rate is measured only after 10 seconds of foreground visibility at 50% or greater.
- At least 30 diagnosis feedback responses with a positive rate of at least 70%.
- Cross-date repeat rate of at least 20%.
- 10 or more valid feedback participants.
- 5 or more explicit expressions of willingness to pay.

Before commercial launch, verify the 50-article Beta sample includes 20 public-account articles, 15 blog articles, and 15 professional articles. Complete the Commercial Readiness Check for sustained-use intent, AI result satisfaction, accepted error rates, controllable cost, and Production stability.

Do not reopen visual optimization before at least 100 real analyses and 20 external users. The first product decision after 30 days is whether users return on another day.
