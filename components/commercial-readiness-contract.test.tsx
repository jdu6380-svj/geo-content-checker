import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function source(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("commercial release readiness contract", () => {
  it("health requires every commercial dependency and rejects mixed payment configuration", () => {
    const health = source("app/api/health/route.ts");
    for (const contract of [
      "appConfigured",
      "clerkConfigured",
      "dataConfigured",
      "storageConfigured",
      "paymentEventStoreConfigured",
      "executorConfigured",
      "COMMERCIAL_WORKSPACE_BOOTSTRAP",
      "hasMatchingAlipayPlanMappings",
      "mixedStripeConfiguration",
      "COMMERCIAL_PAYMENT_PROVIDER",
      "operatorInputsClear",
    ]) {
      expect(health, contract).toContain(contract);
    }
    expect(health).toContain("process.env.COMMERCIAL_PAYMENT_PROVIDER === \"alipay\"");
    expect(health).toContain("!mixedStripeConfiguration");
    expect(health).toContain('process.env.ALIPAY_FIRST_PURCHASE_PLAN === "new_user"');
  });

  it("ships an explicit, fail-closed commercial migration command", () => {
    const migration = source("scripts/migrate-commercial.mjs");
    const packageJson = source("package.json");
    expect(migration).toContain("MIGRATION_CONFIRM_REQUIRED");
    expect(migration).toContain("MIGRATION_DRIVER_UNAVAILABLE");
    expect(migration).toContain("COMMERCIAL MIGRATION BLOCKED");
    expect(packageJson).toContain('"commercial:migrate": "node scripts/migrate-commercial.mjs"');
  });

  it("release and staging gates require the same commercial adapter modes", () => {
    const release = source("scripts/check-release-config.mjs");
    const staging = source("scripts/check-staging-config.mjs");
    for (const file of [release, staging]) {
      expect(file).toContain("COMMERCIAL_AUTH_ADAPTER");
      expect(file).toContain("COMMERCIAL_DATA_ADAPTER");
      expect(file).toContain("COMMERCIAL_STORAGE_ADAPTER");
      expect(file).toContain("COMMERCIAL_EXECUTOR");
      expect(file).toContain("COMMERCIAL_PAYMENT_PROVIDER");
      expect(file).toContain("ALIPAY_PLAN_AMOUNT_MAP");
      expect(file).toContain("ALIPAY_PLAN_RUN_LIMIT_MAP");
    }
  });

  it("publishes anonymous migration and locked launch status in the operator materials", () => {
    const migration = source("lib/server/anonymous-analysis-migration.ts");
    const runbook = source("docs/staging-launch-runbook.md");
    const handoff = source("docs/staging-handoff-template.md");
    const ledger = source("../Evidra_Current_Handoff_2026-08-21.md");
    expect(migration).toContain('error: "AUTHENTICATION_REQUIRED"');
    expect(runbook).toContain("401 AUTHENTICATION_REQUIRED");
    expect(runbook).toContain("release candidate code-frozen / waiting staging credentials");
    expect(runbook).not.toContain("separately reviewed operator provisioning runner");
    expect(handoff).toContain("npm run staging:check");
    expect(handoff).toContain("npm run commercial:migrate");
    expect(handoff).toContain("npm run staging:smoke");
    for (const variable of [
      "COMMERCIAL_PAYMENT_EVENT_STORE",
      "COMMERCIAL_STORAGE_ADAPTER",
      "BLOB_READ_WRITE_TOKEN",
      "COMMERCIAL_EXECUTOR",
      "ALIPAY_FIRST_PURCHASE_PLAN",
    ]) {
      expect(handoff, variable).toContain(variable);
    }
    expect(ledger).toContain("匿名旧分析 API 仍不绑定商业 project/run/result");
    expect(ledger).toContain("B.1=`0/60 LOCKED`");
  });

  it("keeps the documented staging commands available in package scripts", () => {
    const packageJson = JSON.parse(source("package.json")) as { scripts?: Record<string, string> };
    expect(packageJson.scripts).toMatchObject({
      "staging:check": "node scripts/check-staging-config.mjs",
      "staging:check:test": "node --test scripts/check-staging-config.test.mjs",
      "staging:smoke": "node scripts/staging-smoke.mjs",
      "staging:smoke:test": "node --test scripts/staging-smoke.test.mjs",
    });
  });

  it("keeps run history workspace-scoped, bounded, and free of result keys", () => {
    const repository = source("lib/server/commercial/repository.ts");
    const neonRepository = source("lib/server/commercial/neon-repository.ts");
    const route = source("app/api/commercial/projects/handler.ts");
    const client = source("lib/client/commercial-api.ts");
    expect(repository).toContain("listRuns(actor: CommercialActor, projectId: string)");
    expect(repository).toContain("COMMERCIAL_RUN_HISTORY_LIMIT");
    expect(neonRepository).toContain("where runs.workspace_id = ${actor.workspaceId}");
    expect(neonRepository).toContain("order by runs.created_at desc, runs.id desc");
    expect(neonRepository).toContain("limit ${COMMERCIAL_RUN_HISTORY_LIMIT}");
    expect(route).toContain("publicAnalysisRunHistory");
    expect(client).toContain("resultAvailable");
    expect(client).not.toContain("resultKey: value");
  });
});
