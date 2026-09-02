import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function source(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("commercial usage settlement contract", () => {
  it("persists reservations separately from successful consumption", () => {
    const migration = source("db/migrations/0001_commercial_core.sql");
    expect(migration).toMatch(/reserved bigint not null default 0 check \(reserved >= 0\)/);
    expect(migration).toMatch(/usage_counters_reserved_check check \(reserved >= 0\)/);
  });

  it("reserves capacity at launch and charges only a claimed successful completion", () => {
    const repository = source("lib/server/commercial/neon-repository.ts");
    expect(repository).toContain("usage.consumed + usage.reserved < workspace.run_limit");
    expect(repository).toContain("set reserved = usage.reserved + 1");
    expect(repository).toContain("for update");
    expect(repository).toContain("case when ${to} = 'succeeded' then 1 else 0 end");
    expect(repository).toContain("reserved = usage.reserved - 1");
    expect(repository).not.toContain("set consumed = usage.consumed + 1, updated_at");
  });

  it("does not expose a direct queued-run reservation route", () => {
    const route = source("app/api/commercial/runs/route.ts");
    expect(route).toContain("ANALYSIS_LAUNCH_REQUIRED");
    expect(route).not.toContain("service.createRun");
  });

  it("admits one-time Alipay entitlements without weakening Stripe or unknown-provider fail-closed", () => {
    const repository = source("lib/server/commercial/neon-repository.ts");
    expect(repository).toContain("function paymentProviderMode()");
    expect(repository).toContain("payment_entitlements as entitlement");
    expect(repository).toContain("entitlement.status = 'granted'");
    expect(repository).toContain("${providerMode} = 'alipay'");
    expect(repository).toContain("${providerMode} = 'stripe'");
    expect(repository).toContain("when ${providerMode} = 'alipay'");
    expect(repository).toMatch(/else\s+0\s+end as run_limit/);
  });
});
