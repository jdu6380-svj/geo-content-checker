import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

describe("commercial control interaction contract", () => {
  it("keeps primary controls reachable, keyboard-visible, and stable", () => {
    expect(css).toMatch(/\.primary-button,\s*\.dark-button,\s*\.secondary-button\s*\{[\s\S]*?min-height:\s*40px/);
    expect(css).toMatch(/\.primary-button:focus-visible,[\s\S]*?\.secondary-button:focus-visible/);
    expect(css).toMatch(/\.primary-button:hover:not\(:disabled\)/);
    expect(css).toMatch(/\.dark-button:hover:not\(:disabled\)/);
    expect(css).toMatch(/\.secondary-button:hover:not\(:disabled\)/);
  });

  it("provides a reduced-motion fallback", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)/);
    expect(css).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
    expect(css).toMatch(/\.commercial-plan-skeleton span\s*\{\s*animation:\s*none\s*!important/);
  });

  it("keeps commercial cards and operator controls geometrically stable", () => {
    expect(css).toMatch(/\.commercial-plan-card\s*\{[\s\S]*?min-height:\s*142px/);
    expect(css).toMatch(/\.commercial-plan-card:focus-within/);
    expect(css).toMatch(/\.commercial-plan-card button,[\s\S]*?min-height:\s*40px/);
    expect(css).toMatch(/button:hover:not\(:disabled\)/);
    expect(css).toMatch(/button:disabled[\s\S]*?transform:\s*none/);
  });

  it("keeps report navigation and evidence actions touch-sized", () => {
    expect(css).toMatch(/\.report-mobile-subnav button \{ min-height:\s*40px/);
    expect(css).toMatch(/\.phase3-evidence-summary button \{[\s\S]*?min-height:\s*40px/);
    expect(css).toMatch(/\.phase3-evidence-source-unavailable \{[\s\S]*?min-height:\s*40px/);
    expect(css).toMatch(/\.phase2-diagnosis-toolbar button \{ min-height:\s*34px/);
    expect(css).toMatch(/\.phase2-diagnosis-toolbar button,[\s\S]*?\.report-mobile-subnav button[\s\S]*?min-height:\s*40px/);
  });
});
