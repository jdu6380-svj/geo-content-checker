import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { createCommercialOnboardingPost } from "@/app/api/commercial/onboarding/handler";
import { CommercialUnauthenticatedError } from "@/lib/server/commercial/domain";
import {
  COMMERCIAL_ANALYZE_BODY_LIMIT_BYTES,
  COMMERCIAL_JSON_BODY_LIMIT_BYTES,
  readCommercialJsonBody,
  assertCommercialRequestOrigin,
} from "@/lib/server/commercial/request-body";
import { normalizeCommercialIdempotencyKey } from "@/lib/server/commercial/service";
import {
  CommercialWorkspaceOnboardingService,
  InMemoryCommercialWorkspaceOnboardingRepository,
  type CommercialClerkOrganizationIdentity,
} from "@/lib/server/commercial/workspace-onboarding";

function jsonRequest(body: string, headers: Record<string, string> = {}): Request {
  return new Request("https://app.test/api/commercial/input", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

const admin: CommercialClerkOrganizationIdentity = {
  subjectId: "user_admin",
  orgId: "org_content_team",
  orgRole: "org:admin",
};

describe("commercial request input boundaries", () => {
  it("rejects explicit browser cross-site writes while allowing same-origin and non-browser calls", () => {
    expect(() => assertCommercialRequestOrigin(new Request("https://app.test/api/commercial/projects", { headers: { origin: "https://app.test" } }))).not.toThrow();
    expect(() => assertCommercialRequestOrigin(new Request("https://app.test/api/commercial/projects", { headers: { origin: "https://evil.test" } }))).toThrow("请求来源不受支持。");
    expect(() => assertCommercialRequestOrigin(new Request("https://app.test/api/commercial/projects", { headers: { "sec-fetch-site": "cross-site" } }))).toThrow("请求来源不受支持。");
    expect(() => assertCommercialRequestOrigin(new Request("https://app.test/api/commercial/projects"))).not.toThrow();
  });

  it("accepts JSON with a charset and rejects missing or unsupported content types", async () => {
    await expect(readCommercialJsonBody(jsonRequest('{"intent":"setup"}', {
      "content-type": "application/json; charset=utf-8",
    }))).resolves.toEqual({ intent: "setup" });
    await expect(readCommercialJsonBody(new Request("https://app.test", {
      method: "POST",
      body: "{}",
    }))).rejects.toMatchObject({ code: "INVALID_REQUEST", status: 400 });
    await expect(readCommercialJsonBody(jsonRequest("{}", { "content-type": "text/plain" }))).rejects.toMatchObject({
      code: "INVALID_REQUEST",
      status: 400,
    });
  });

  it("rejects empty, malformed, non-UTF8 and oversized JSON before parsing", async () => {
    await expect(readCommercialJsonBody(jsonRequest(""))).rejects.toThrow("请求内容不是有效的 JSON。");
    await expect(readCommercialJsonBody(jsonRequest("{"))).rejects.toThrow("请求内容不是有效的 JSON。");
    const invalidUtf8 = new Request("https://app.test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new Uint8Array([0xc3, 0x28]),
    });
    await expect(readCommercialJsonBody(invalidUtf8)).rejects.toMatchObject({ code: "INVALID_REQUEST" });

    const oversized = new Request("https://app.test", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(COMMERCIAL_JSON_BODY_LIMIT_BYTES + 1),
      },
      body: "{}",
    });
    await expect(readCommercialJsonBody(oversized)).rejects.toThrow("请求内容超过允许的大小。");

    const streamOversized = jsonRequest(JSON.stringify({ value: "x".repeat(COMMERCIAL_JSON_BODY_LIMIT_BYTES) }));
    await expect(readCommercialJsonBody(streamOversized)).rejects.toThrow("请求内容超过允许的大小。");
  });

  it("keeps the analysis body budget explicit and rejects unsupported encodings", async () => {
    const body = JSON.stringify({ content: "x".repeat(100_000) });
    await expect(readCommercialJsonBody(jsonRequest(body), COMMERCIAL_ANALYZE_BODY_LIMIT_BYTES)).resolves.toMatchObject({
      content: expect.any(String),
    });
    await expect(readCommercialJsonBody(jsonRequest("{}", { "content-encoding": "gzip" }))).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
  });

  it("normalizes idempotency keys and rejects control, oversized, or empty values", () => {
    expect(normalizeCommercialIdempotencyKey("  launch-key_1  ")).toBe("launch-key_1");
    expect(normalizeCommercialIdempotencyKey(null)).toBeUndefined();
    expect(() => normalizeCommercialIdempotencyKey("a".repeat(129))).toThrow("幂等键格式不正确。");
    expect(() => normalizeCommercialIdempotencyKey("bad key")).toThrow("幂等键格式不正确。");
    expect(() => normalizeCommercialIdempotencyKey("bad\nkey")).toThrow("幂等键格式不正确。");
  });

  it("authenticates onboarding before reading a malformed or oversized body", async () => {
    const service = new CommercialWorkspaceOnboardingService(new InMemoryCommercialWorkspaceOnboardingRepository());
    const request = new NextRequest("https://app.test/api/commercial/onboarding", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "not-json",
    });
    const response = await createCommercialOnboardingPost(request, {
      resolveIdentity: async () => { throw new CommercialUnauthenticatedError(); },
      service: () => service,
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "UNAUTHENTICATED",
      message: "请先登录后再访问商业工作区。",
    });
  });

  it("keeps onboarding workspace ownership derived from trusted identity", async () => {
    const repository = new InMemoryCommercialWorkspaceOnboardingRepository();
    const service = new CommercialWorkspaceOnboardingService(repository);
    const response = await createCommercialOnboardingPost(jsonRequest(JSON.stringify({ intent: "setup", workspaceId: "attacker" })), {
      resolveIdentity: async () => admin,
      service: () => service,
    });
    expect(response.status).toBe(400);
    expect(repository.workspaces.size).toBe(0);
  });

  it("blocks a browser cross-site onboarding write before bootstrap", async () => {
    const repository = new InMemoryCommercialWorkspaceOnboardingRepository();
    const service = new CommercialWorkspaceOnboardingService(repository);
    const response = await createCommercialOnboardingPost(new Request("https://app.test/api/commercial/onboarding", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.test", "sec-fetch-site": "cross-site" },
      body: JSON.stringify({ intent: "setup" }),
    }), {
      resolveIdentity: async () => admin,
      service: () => service,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "INVALID_REQUEST", message: "请求来源不受支持。" });
    expect(repository.workspaces.size).toBe(0);
  });
});
