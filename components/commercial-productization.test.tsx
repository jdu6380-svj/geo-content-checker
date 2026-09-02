import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function source(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("commercial first-run productization contract", () => {
  it("removes beta and demo framing from the public workspace", () => {
    const visibleWorkspace = [
      source("components/app-header.tsx"),
      source("components/editor-workspace.tsx"),
      source("components/workspace-dashboard-panels.tsx"),
      source("components/workspace-sidebar.tsx"),
    ].join("\n");

    expect(visibleWorkspace).not.toMatch(/Beta 体验|Beta 说明|Beta 提示|Beta 访客|Demo 内容|Demo 报告|载入示例|示例分数/);
    expect(visibleWorkspace).toContain("审查模板");
    expect(visibleWorkspace).toContain("非真实用户报告");
    expect(visibleWorkspace).toContain("尚未生成真实审查报告");
  });

  it("makes account, plans, and review paths discoverable without client-side identity fields", () => {
    const header = source("components/app-header.tsx");
    const sidebar = source("components/workspace-sidebar.tsx");

    expect(header).toContain('href="/sign-in"');
    expect(header).toContain('href="/sign-up"');
    expect(header).toContain('href="/dashboard"');
    expect(header).toContain("项目、额度与套餐");
    expect(sidebar).toContain("商业工作区");
  });

  it("moves public analysis execution to the authenticated commercial workspace", () => {
    const page = source("app/page.tsx");
    const editor = source("components/editor-workspace.tsx");
    const migration = source("lib/server/anonymous-analysis-migration.ts");
    const legacyRoutes = [
      "app/api/analysis-session/route.ts",
      "app/api/evaluate-scoring/handler.ts",
      "app/api/predict-questions/handler.ts",
      "app/api/qa-diagnostic/handler.ts",
      "app/api/generate-patches/handler.ts",
    ].map(source).join("\n");

    expect(page).toContain("真实分析需在认证商业工作台中执行");
    expect(editor).toContain("/sign-in?redirect_url=%2Fdashboard");
    expect(migration).toContain('error: "AUTHENTICATION_REQUIRED"');
    expect(legacyRoutes.match(/shouldMigrateAnonymousAnalysis\(\)/g)?.length).toBe(5);
  });

  it("does not expose inert placeholder controls in the anonymous shell", () => {
    const header = source("components/app-header.tsx");
    const sidebar = source("components/workspace-sidebar.tsx");

    expect(header).not.toContain('<button type="button" disabled><Check');
    expect(header).not.toContain('<button type="button" disabled><FileCheck2');
    expect(sidebar).not.toContain('<button type="button" disabled><Folder');
    expect(sidebar).toContain("{canOpenReport ? (");
    expect(sidebar).toContain("{canOpenAdvice ? (");
    expect(sidebar).toContain("{canOpenRecheck ? (");
  });

  it("uses purple brand tokens while retaining semantic status colors", () => {
    const css = source("app/globals.css");

    expect(css).toMatch(/--phase-purple:\s*#[0-9a-f]{6}/i);
    expect(css).toMatch(/--evidra-accent:\s*#[0-9a-f]{6}/i);
    expect(css).toMatch(/--phase-green:\s*#[0-9a-f]{6}/i);
    expect(css).toMatch(/--phase-orange:\s*#[0-9a-f]{6}/i);
    expect(css).toMatch(/--phase-red:\s*#[0-9a-f]{6}/i);
    expect(css).toMatch(/\.phase-account-menu-group a:focus-visible/);
  });
});
