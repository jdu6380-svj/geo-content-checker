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

## Preview Validation

1. Configure all Preview environment variables and deploy.
2. Confirm `GET /api/health` returns HTTP 200 with `status: "ok"`.
3. Run `npm run check`, `npm run security:unit`, and `npm run build` locally.
4. Run `GEO_BASE_URL=https://preview.example.com npm run blackbox:model`.
5. Exercise scoring, predicted questions, diagnostics, follow-up questions, Patch generation, Markdown copy, quota errors, and fallback behavior.
6. Trigger one controlled application error and verify Sentry receives the stack without body, Prompt, evidence, cookies, User-Agent, raw IP, client UUID, or authorization headers.
7. Verify structured logs contain only route, request ID, status, duration, source, model status, rate-limit mode, model latency, Token counts, and optional estimated cost.

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
