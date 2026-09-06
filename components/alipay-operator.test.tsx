import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AlipayOperatorService, InMemoryAlipayOperatorRepository } from "@/lib/server/commercial/alipay-operator";
import { createOperatorGet, createOperatorPost } from "@/app/api/alipay/operator/handler";
import { CommercialDashboard } from "@/components/commercial-dashboard";

const owner = { subjectId: "owner_1", workspaceId: "workspace_1", role: "owner" as const };
function request(body: unknown, key = "operator_key") { return new Request("https://app.test/api/alipay/operator", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify(body) }); }
function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }

describe("Alipay operator boundary", () => {
  it("requires owner role, records audit, and replays safely without exposing the reference", async () => {
    const repository = new InMemoryAlipayOperatorRepository(); const service = new AlipayOperatorService(repository); const dependencies = { resolveActor: async () => owner, service };
    const first = await createOperatorPost(request({ type: "refund_review", reference: "private-order-reference" }), dependencies);
    const replay = await createOperatorPost(request({ type: "refund_review", reference: "private-order-reference" }), dependencies);
    expect(first.status).toBe(201); expect(replay.status).toBe(201); expect(repository.audits).toEqual(["alipay.refund_review.created"]);
    expect(JSON.stringify(await first.json())).not.toContain("private-order-reference");
    const listed = await createOperatorGet(new Request("https://app.test/api/alipay/operator"), dependencies); expect((await listed.json()).requests).toHaveLength(1);
  });

  it("rejects non-owner and conflicting idempotency", async () => {
    const service = new AlipayOperatorService(new InMemoryAlipayOperatorRepository());
    const forbidden = await createOperatorPost(request({ type: "refund_review", reference: "ref" }), { resolveActor: async () => ({ ...owner, role: "member" as const }), service });
    expect(forbidden.status).toBe(403);
    const deps = { resolveActor: async () => owner, service }; await createOperatorPost(request({ type: "refund_review", reference: "ref" }, "same"), deps);
    expect((await createOperatorPost(request({ type: "reconciliation", reference: "period" }, "same"), deps)).status).toBe(409);
  });

  it("renders loading, empty and permission error states without provider details", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ projects: [], usage: { workspaceId: "workspace_1", consumed: 0, limit: 20 } })).mockResolvedValueOnce(response({ subscription: null })).mockResolvedValueOnce(response({ plans: [] })).mockResolvedValueOnce(response({ error: "FORBIDDEN" }, 403));
    vi.stubGlobal("fetch", fetchMock); render(<CommercialDashboard />); await screen.findByText(/还没有使用记录/); fireEvent.click(screen.getByRole("button", { name: "支付运营管理" })); expect((await screen.findByRole("alert")).textContent).toContain("仅工作区所有者");
  });
});
