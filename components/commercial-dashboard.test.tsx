import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CommercialDashboard } from "@/components/commercial-dashboard";
import { createCommercialCheckout, createCommercialPortal } from "@/lib/client/commercial-api";

const project = {
  id: "project_1",
  workspaceId: "workspace_1",
  name: "内容审查项目",
  createdBy: "user_1",
  createdAt: "2026-08-28T00:00:00.000Z",
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("CommercialDashboard", () => {
  it("shows invite-only Beta access without loading or rendering payment controls", async () => {
    vi.stubEnv("NEXT_PUBLIC_EVIDRA_BETA_MODE", "true");
    const fetchMock = vi.fn().mockResolvedValueOnce(response({
      projects: [],
      usage: { workspaceId: "workspace_1", consumed: 2, limit: 10, accessMode: "beta", accessExpiresAt: "2026-10-31T00:00:00.000Z" },
      history: [],
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<CommercialDashboard />);

    expect(await screen.findByRole("heading", { name: "邀请制 Beta 额度" })).toBeTruthy();
    expect(screen.getByText("Beta 授权有效")).toBeTruthy();
    expect(screen.getByText(/不会创建支付订单/)).toBeTruthy();
    expect(screen.queryByText(/购买 .* 次审查/)).toBeNull();
    expect(screen.queryByRole("button", { name: "支付运营管理" })).toBeNull();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/commercial/projects"]);
  });

  it("renders an empty workspace and creates a project through the data API", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ projects: [], usage: { workspaceId: "workspace_1", consumed: 0, limit: 3 } }))
      .mockResolvedValueOnce(response({ subscription: null }))
      .mockResolvedValueOnce(response({ plans: [] }))
      .mockResolvedValueOnce(response({ project }, 201));
    vi.stubGlobal("fetch", fetchMock);

    render(<CommercialDashboard />);
    expect(await screen.findByText("还没有项目")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "AI 内容发布前审查工作台" })).toBeTruthy();
    expect(screen.getByText(/按产品线与内容项目管理 GEO 审查、共享额度与交付报告/)).toBeTruthy();
    expect(screen.getByText(/实际套餐名称、价格与额度以服务端当前配置为准/)).toBeTruthy();
    expect(screen.getByText(/一次性支付，不自动续费/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("新建项目"), { target: { value: "内容审查项目" } });
    fireEvent.click(screen.getByRole("button", { name: "创建" }));

    expect((await screen.findAllByText("内容审查项目")).length).toBeGreaterThanOrEqual(2);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[3][1]).toMatchObject({ method: "POST", body: JSON.stringify({ name: "内容审查项目" }) });
  });

  it("maps a fail-closed auth response to a safe user message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ error: "AUTH_UNAVAILABLE", message: "secret provider detail" }, 503)));
    render(<CommercialDashboard />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("身份服务尚未配置");
    expect(alert.textContent).not.toContain("secret provider detail");
    expect(screen.queryByRole("link", { name: "重新登录" })).toBeNull();
  });

  it("offers onboarding when an authenticated account has no usable workspace", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ error: "WORKSPACE_REQUIRED", message: "private org detail" }, 403)));
    render(<CommercialDashboard />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("当前账户尚未绑定可用工作区");
    expect(alert.textContent).not.toContain("private org detail");
    expect(screen.getByRole("link", { name: "设置或选择工作区" }).getAttribute("href")).toBe("/onboarding");
  });

  it("clears projects when a related request reports session or workspace loss", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ projects: [project], usage: { workspaceId: "workspace_1", consumed: 0, limit: 3 } }))
      .mockResolvedValueOnce(response({ error: "UNAUTHENTICATED", message: "private session detail" }, 401))
      .mockResolvedValueOnce(response({ plans: [] }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CommercialDashboard />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("请先登录后访问工作台");
    expect(screen.queryByRole("heading", { name: "内容审查项目" })).toBeNull();
    expect(screen.getByRole("link", { name: "重新登录" }).getAttribute("href")).toBe("/sign-in?redirect_url=%2Fdashboard");
    expect(screen.queryByText("private session detail")).toBeNull();
  });

  it("keeps project access when only the payment catalog is unavailable", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ projects: [project], usage: { workspaceId: "workspace_1", consumed: 0, limit: 0 } }))
      .mockResolvedValueOnce(response({ subscription: null }))
      .mockResolvedValueOnce(response({ error: "PAYMENT_UNAVAILABLE", message: "provider detail" }, 503));
    vi.stubGlobal("fetch", fetchMock);
    render(<CommercialDashboard />);

    expect(await screen.findByRole("heading", { name: "内容审查项目" })).toBeTruthy();
    expect(screen.getByText("支付服务尚未配置。当前不能购买套餐。")).toBeTruthy();
    expect(screen.getByText("当前工作区没有可用审查次数，支付入口尚未配置，暂不能购买。")).toBeTruthy();
    expect(screen.getByRole("button", { name: "开始分析" }).getAttribute("disabled")).not.toBeNull();
    expect(screen.queryByText("provider detail")).toBeNull();
  });

  it("offers sign-in when project creation loses the authenticated session", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ projects: [], usage: { workspaceId: "workspace_1", consumed: 0, limit: 3 } }))
      .mockResolvedValueOnce(response({ subscription: null }))
      .mockResolvedValueOnce(response({ plans: [] }))
      .mockResolvedValueOnce(response({ error: "UNAUTHENTICATED", message: "private session detail" }, 401));
    vi.stubGlobal("fetch", fetchMock);
    render(<CommercialDashboard />);

    await screen.findByText("还没有项目");
    fireEvent.change(screen.getByLabelText("新建项目"), { target: { value: "内容审查项目" } });
    fireEvent.click(screen.getByRole("button", { name: "创建" }));

    expect(await screen.findByText("请先登录后访问工作台。", { exact: true })).toBeTruthy();
    expect(screen.getByRole("link", { name: "重新登录" }).getAttribute("href")).toBe("/sign-in?redirect_url=%2Fdashboard");
    expect(screen.queryByText("private session detail")).toBeNull();
  });

  it("does not query the Stripe subscription compatibility route for Alipay", async () => {
    vi.stubEnv("NEXT_PUBLIC_COMMERCIAL_PAYMENT_PROVIDER", "alipay");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ projects: [project], usage: { workspaceId: "workspace_1", consumed: 0, limit: 3 } }))
      .mockResolvedValueOnce(response({ plans: [] }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CommercialDashboard />);

    expect(await screen.findByRole("heading", { name: "内容审查项目" })).toBeTruthy();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/commercial/projects",
      "/api/alipay/plans",
    ]);
    vi.unstubAllEnvs();
  });

  it("allows project setup at zero quota but keeps analysis fail-closed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ projects: [project], usage: { workspaceId: "workspace_1", consumed: 1, limit: 1 } })));
    render(<CommercialDashboard />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "内容审查项目" })).toBeTruthy());
    expect(screen.getByText("1/1 次审查")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("新建项目"), { target: { value: "下一个内容项目" } });
    expect((screen.getByRole("button", { name: "创建" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByLabelText("标题")).toBeTruthy();
    expect((screen.getByRole("button", { name: "开始分析" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/项目仍可创建，获得服务端确认的额度后即可提交审查/)).toBeTruthy();
    expect(screen.getByText(/当前页面会显示本次打开后的运行状态/)).toBeTruthy();
    expect(screen.queryByText("分析结果")).toBeNull();
  });

  it("launches an analysis and renders a validated private result", async () => {
    const result = {
      source: "deterministic",
      contentDigest: "digest",
      contentLength: 8,
      score: 82,
      diagnostics: { status: "available", issueCount: 1 },
      patch: { status: "generated" },
      analysis: {
        scoring: { totalScore: 82, dimensions: {} },
        questions: { questions: ["问题一", "问题二", "问题三", "问题四", "问题五"] },
        diagnostics: [{}],
        patch: { mode: "advice", markdown: "建议内容", actions: [] },
      },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ projects: [project], usage: { workspaceId: "workspace_1", consumed: 0, limit: 3 } }))
      .mockResolvedValueOnce(response({ subscription: null }))
      .mockResolvedValueOnce(response({ plans: [] }))
      .mockResolvedValueOnce(response({ run: { id: "run_1", workspaceId: "workspace_1", projectId: "project_1", status: "succeeded", createdBy: "user_1", createdAt: project.createdAt, resultKey: "private/run_1" } }, 201))
      .mockResolvedValueOnce(response({ run: { id: "run_1", workspaceId: "workspace_1", projectId: "project_1", status: "succeeded", createdBy: "user_1", createdAt: project.createdAt, resultKey: "private/run_1" } }))
      .mockResolvedValueOnce(response(result));
    vi.stubGlobal("fetch", fetchMock);
    render(<CommercialDashboard />);
    await screen.findByRole("heading", { name: "内容审查项目" });
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "测试标题" } });
    fireEvent.change(screen.getByLabelText("正文"), { target: { value: "测试正文" } });
    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));
    expect(await screen.findByText("总分 82")).toBeTruthy();
    expect(screen.getByText("问题一")).toBeTruthy();
    expect(screen.getByText("建议内容")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/commercial/projects",
      "/api/stripe/subscription",
      "/api/alipay/plans",
      "/api/commercial/projects/project_1/analyze",
      "/api/commercial/runs/run_1",
      "/api/commercial/runs/run_1/result",
    ]);
  });

  it("restores project run history without exposing storage keys and opens a private report", async () => {
    const historyRun = {
      id: "run_history_success",
      workspaceId: "workspace_1",
      projectId: "project_1",
      status: "succeeded",
      createdBy: "user_1",
      createdAt: "2026-08-29T12:00:00.000Z",
      resultAvailable: true,
    };
    const result = {
      source: "deterministic", contentDigest: "digest", contentLength: 8, score: 82,
      diagnostics: { status: "available", issueCount: 0 }, patch: { status: "not_generated" },
      analysis: {
        scoring: { totalScore: 82, dimensions: {} },
        questions: { questions: ["问题一", "问题二", "问题三", "问题四", "问题五"] },
        diagnostics: [], patch: { mode: "advice", markdown: "建议内容", actions: [] },
      },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ projects: [project], usage: { workspaceId: "workspace_1", consumed: 1, limit: 3 }, history: [{ projectId: "project_1", runs: [historyRun] }] }))
      .mockResolvedValueOnce(response({ subscription: null }))
      .mockResolvedValueOnce(response({ plans: [] }))
      .mockResolvedValueOnce(response(result));
    vi.stubGlobal("fetch", fetchMock);
    render(<CommercialDashboard />);
    await screen.findByRole("heading", { name: "内容审查项目" });
    expect(screen.getByRole("heading", { name: "最近运行" })).toBeTruthy();
    expect(screen.getByText("已完成")).toBeTruthy();
    expect(screen.getByText("2026年8月29日")).toBeTruthy();
    expect(screen.queryByText(/result|private|workspace_1/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "查看报告" }));
    expect(await screen.findByText("总分 82")).toBeTruthy();
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe("/api/commercial/runs/run_history_success/result");
  });

  it("shows safe history states and only offers refresh for active runs", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({
        projects: [project],
        usage: { workspaceId: "workspace_1", consumed: 1, limit: 3 },
        history: [{ projectId: "project_1", runs: [
          { id: "run_queued_history", workspaceId: "workspace_1", projectId: "project_1", status: "queued", createdBy: "user_1", createdAt: "2026-08-29T12:00:00.000Z", resultAvailable: false },
          { id: "run_failed_history", workspaceId: "workspace_1", projectId: "project_1", status: "failed", createdBy: "user_1", createdAt: "2026-08-28T12:00:00.000Z", failureCode: "EXECUTION_FAILED", resultAvailable: false },
          { id: "run_cancelled_history", workspaceId: "workspace_1", projectId: "project_1", status: "cancelled", createdBy: "user_1", createdAt: "2026-08-27T12:00:00.000Z", resultAvailable: false },
          { id: "run_mismatch_history", workspaceId: "workspace_1", projectId: "project_1", status: "succeeded", createdBy: "user_1", createdAt: "2026-08-26T12:00:00.000Z", resultAvailable: false },
        ] }],
      }))
      .mockResolvedValueOnce(response({ subscription: null }))
      .mockResolvedValueOnce(response({ plans: [] }))
      .mockResolvedValueOnce(response({ run: { id: "run_queued_history", workspaceId: "workspace_1", projectId: "project_1", status: "running", createdBy: "user_1", createdAt: "2026-08-29T12:00:00.000Z" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CommercialDashboard />);
    await screen.findByRole("heading", { name: "内容审查项目" });
    expect(screen.getByText("排队中")).toBeTruthy();
    expect(screen.getByText("未完成")).toBeTruthy();
    expect(screen.getByText("已取消")).toBeTruthy();
    expect(screen.getByText("报告暂不可用")).toBeTruthy();
    expect(screen.getAllByText("可重新提交")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "刷新状态" })).toHaveLength(4);
    expect(screen.queryByRole("button", { name: "查看报告" })).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "刷新状态" })[0]);
    expect(await screen.findByText("正在分析", { selector: ".commercial-detail-status" })).toBeTruthy();
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe("/api/commercial/runs/run_queued_history");
  });

  it("keeps retryable failed runs actionable without exposing provider details", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ projects: [project], usage: { workspaceId: "workspace_1", consumed: 0, limit: 3 } }))
      .mockResolvedValueOnce(response({ subscription: null }))
      .mockResolvedValueOnce(response({ plans: [] }))
      .mockResolvedValueOnce(response({ run: { id: "run_2", workspaceId: "workspace_1", projectId: "project_1", status: "queued", createdBy: "user_1", createdAt: project.createdAt } }, 201))
      .mockResolvedValueOnce(response({ run: { id: "run_2", workspaceId: "workspace_1", projectId: "project_1", status: "failed", createdBy: "user_1", createdAt: project.createdAt, failureCode: "EXECUTION_RETRYABLE" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CommercialDashboard />);
    await screen.findByRole("heading", { name: "内容审查项目" });
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "测试标题" } });
    fireEvent.change(screen.getByLabelText("正文"), { target: { value: "测试正文" } });
    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));
    expect(await screen.findByText("分析服务暂时不可用，请稍后重试。", { exact: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: "重试分析" })).toBeTruthy();
  });

  it("keeps a succeeded run recoverable when private result loading fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ projects: [project], usage: { workspaceId: "workspace_1", consumed: 0, limit: 3 } }))
      .mockResolvedValueOnce(response({ subscription: null }))
      .mockResolvedValueOnce(response({ plans: [] }))
      .mockResolvedValueOnce(response({ run: { id: "run_result_retry", workspaceId: "workspace_1", projectId: "project_1", status: "succeeded", createdBy: "user_1", createdAt: project.createdAt } }, 201))
      .mockResolvedValueOnce(response({ run: { id: "run_result_retry", workspaceId: "workspace_1", projectId: "project_1", status: "succeeded", createdBy: "user_1", createdAt: project.createdAt } }))
      .mockResolvedValueOnce(response({ error: "NETWORK_TIMEOUT", message: "private provider detail" }, 503))
      .mockResolvedValueOnce(response({
        source: "deterministic", contentDigest: "digest", contentLength: 8, score: 82,
        diagnostics: { status: "available", issueCount: 0 }, patch: { status: "not_generated" },
        analysis: {
          scoring: { totalScore: 82, dimensions: {} },
          questions: { questions: ["问题一", "问题二", "问题三", "问题四", "问题五"] },
          diagnostics: [], patch: { mode: "advice", markdown: "建议内容", actions: [],
          },
        },
      }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CommercialDashboard />);
    await screen.findByRole("heading", { name: "内容审查项目" });
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "测试标题" } });
    fireEvent.change(screen.getByLabelText("正文"), { target: { value: "测试正文" } });
    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));
    expect(await screen.findByText("请求超时，请检查网络后重试。", { exact: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: "重新读取报告" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "重试分析" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "重新读取报告" }));
    expect(await screen.findByText("总分 82")).toBeTruthy();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/commercial/projects", "/api/stripe/subscription", "/api/alipay/plans",
      "/api/commercial/projects/project_1/analyze", "/api/commercial/runs/run_result_retry",
      "/api/commercial/runs/run_result_retry/result", "/api/commercial/runs/run_result_retry/result",
    ]);
  });

  it("offers sign-in when a session expires while refreshing a run", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ projects: [project], usage: { workspaceId: "workspace_1", consumed: 0, limit: 3 } }))
      .mockResolvedValueOnce(response({ subscription: null }))
      .mockResolvedValueOnce(response({ plans: [] }))
      .mockResolvedValueOnce(response({ run: { id: "run_session_expired", workspaceId: "workspace_1", projectId: "project_1", status: "queued", createdBy: "user_1", createdAt: project.createdAt } }, 201))
      .mockResolvedValueOnce(response({ error: "UNAUTHENTICATED", message: "private auth detail" }, 401));
    vi.stubGlobal("fetch", fetchMock);
    render(<CommercialDashboard />);
    await screen.findByRole("heading", { name: "内容审查项目" });
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "测试标题" } });
    fireEvent.change(screen.getByLabelText("正文"), { target: { value: "测试正文" } });
    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));
    expect(await screen.findByText("请先登录后访问工作台。", { exact: true })).toBeTruthy();
    expect(screen.getByRole("link", { name: "重新登录" }).getAttribute("href")).toBe("/sign-in?redirect_url=%2Fdashboard");
    expect(screen.getAllByRole("button", { name: "刷新状态" }).length).toBeGreaterThan(0);
    expect(screen.queryByText("private auth detail")).toBeNull();
  });

  it("replays an uncertain launch with the same idempotency key", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ projects: [project], usage: { workspaceId: "workspace_1", consumed: 0, limit: 3 } }))
      .mockResolvedValueOnce(response({ subscription: null }))
      .mockResolvedValueOnce(response({ plans: [] }))
      .mockRejectedValueOnce(new DOMException("request timed out", "AbortError"))
      .mockResolvedValueOnce(response({ run: { id: "run_replayed", workspaceId: "workspace_1", projectId: "project_1", status: "succeeded", createdBy: "user_1", createdAt: project.createdAt } }, 201))
      .mockResolvedValueOnce(response({ run: { id: "run_replayed", workspaceId: "workspace_1", projectId: "project_1", status: "succeeded", createdBy: "user_1", createdAt: project.createdAt } }))
      .mockResolvedValueOnce(response({
        source: "deterministic", contentDigest: "digest", contentLength: 8, score: 82,
        diagnostics: { status: "available", issueCount: 0 }, patch: { status: "not_generated" },
        analysis: {
          scoring: { totalScore: 82, dimensions: {} },
          questions: { questions: ["问题一", "问题二", "问题三", "问题四", "问题五"] },
          diagnostics: [], patch: { mode: "advice", markdown: "建议内容", actions: [] },
        },
      }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CommercialDashboard />);
    await screen.findByRole("heading", { name: "内容审查项目" });
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "测试标题" } });
    fireEvent.change(screen.getByLabelText("正文"), { target: { value: "测试正文" } });
    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));
    expect(await screen.findByText("请求超时，请检查网络后重试。", { exact: true })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "重试分析" }));
    expect(await screen.findByText("总分 82")).toBeTruthy();
    const firstKey = fetchMock.mock.calls[3][1].headers["Idempotency-Key"];
    const replayKey = fetchMock.mock.calls[4][1].headers["Idempotency-Key"];
    expect(firstKey).toBeTruthy();
    expect(replayKey).toBe(firstKey);
  });

  it("clears an old run and result when another project is selected", async () => {
    const secondProject = { ...project, id: "project_2", name: "第二个项目" };
    const result = {
      source: "deterministic", contentDigest: "digest", contentLength: 8, score: 82,
      diagnostics: { status: "available", issueCount: 0 }, patch: { status: "not_generated" },
      analysis: {
        scoring: { totalScore: 82, dimensions: {} },
        questions: { questions: ["问题一", "问题二", "问题三", "问题四", "问题五"] },
        diagnostics: [], patch: { mode: "advice", markdown: "建议内容", actions: [] },
      },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ projects: [project, secondProject], usage: { workspaceId: "workspace_1", consumed: 0, limit: 3 } }))
      .mockResolvedValueOnce(response({ subscription: null }))
      .mockResolvedValueOnce(response({ plans: [] }))
      .mockResolvedValueOnce(response({ run: { id: "run_project_1", workspaceId: "workspace_1", projectId: "project_1", status: "succeeded", createdBy: "user_1", createdAt: project.createdAt } }, 201))
      .mockResolvedValueOnce(response({ run: { id: "run_project_1", workspaceId: "workspace_1", projectId: "project_1", status: "succeeded", createdBy: "user_1", createdAt: project.createdAt } }))
      .mockResolvedValueOnce(response(result));
    vi.stubGlobal("fetch", fetchMock);
    render(<CommercialDashboard />);
    await screen.findByRole("heading", { name: "内容审查项目" });
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "测试标题" } });
    fireEvent.change(screen.getByLabelText("正文"), { target: { value: "测试正文" } });
    fireEvent.click(screen.getByRole("button", { name: "开始分析" }));
    expect(await screen.findByText("总分 82")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /第二个项目/ }));
    expect(await screen.findByRole("heading", { name: "第二个项目" })).toBeTruthy();
    expect(screen.queryByText("总分 82")).toBeNull();
    expect(screen.queryByText("建议内容")).toBeNull();
  });

  it("renders active subscription usage and server-provided plans", async () => {
    const subscription = {
      status: "active",
      priceId: "price_pro", currentPeriodEnd: "2099-01-01T00:00:00.000Z", updatedAt: project.createdAt,
      entitlementRunLimit: 20,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ projects: [project], usage: { workspaceId: "workspace_1", consumed: 3, limit: 20 } }))
      .mockResolvedValueOnce(response({ subscription }))
      .mockResolvedValueOnce(response({ plans: [{ key: "pro", amount: "99.00", runLimit: 20 }] }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CommercialDashboard />);
    expect(await screen.findByText("订阅有效")).toBeTruthy();
    expect(screen.getByText("已用 3 / 20 次审查")).toBeTruthy();
    expect(screen.getByText("¥99.00 · 20 次发布前审查")).toBeTruthy();
    expect(screen.getByRole("button", { name: "购买 20 次审查 ¥99.00" })).toBeTruthy();
  });

  it("renders past-due and exhausted quota without exposing provider details", async () => {
    const subscription = {
      status: "past_due",
      priceId: "price_pro", currentPeriodEnd: "2099-01-01T00:00:00.000Z", updatedAt: project.createdAt,
      entitlementRunLimit: 0,
    };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ projects: [project], usage: { workspaceId: "workspace_1", consumed: 0, limit: 0 } }))
      .mockResolvedValueOnce(response({ subscription }))
      .mockResolvedValueOnce(response({ plans: [{ key: "pro", amount: "99.00", runLimit: 20 }] })));
    render(<CommercialDashboard />);
    expect(await screen.findByText("付款待处理")).toBeTruthy();
    expect(screen.getByText("当前工作区共享额度已用完，请选择可用套餐或等待支付状态更新。")).toBeTruthy();
  });

  it("shows a manage-subscription action only for an active subscription", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ projects: [project], usage: { workspaceId: "workspace_1", consumed: 3, limit: 20 } }))
      .mockResolvedValueOnce(response({ subscription: { status: "active", priceId: "price_pro", currentPeriodEnd: "2099-01-01T00:00:00.000Z", updatedAt: project.createdAt, entitlementRunLimit: 20 } }))
      .mockResolvedValueOnce(response({ plans: [{ key: "pro", amount: "99.00", runLimit: 20 }] }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CommercialDashboard />);
    expect(await screen.findByRole("button", { name: "管理订阅" })).toBeTruthy();
  });

  it("sends only portal intent and rejects a non-HTTPS response", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ portalUrl: "https://billing.test/session" }))
      .mockResolvedValueOnce(response({ portalUrl: "http://billing.test/session" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createCommercialPortal()).resolves.toEqual({ portalUrl: "https://billing.test/session" });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/stripe/portal");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ intent: "manage" });
    expect(fetchMock.mock.calls[0][1].body).not.toContain("customerId");
    await expect(createCommercialPortal()).rejects.toMatchObject({ code: "INVALID_RESPONSE", status: 502 });
  });

  it("sends only a server-owned plan key for checkout", async () => {
    vi.stubEnv("NEXT_PUBLIC_COMMERCIAL_PAYMENT_PROVIDER", "alipay");
    const fetchMock = vi.fn().mockResolvedValue(response({ checkoutUrl: "https://checkout.test/session" }, 201));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createCommercialCheckout("pro")).resolves.toEqual({ checkoutUrl: "https://checkout.test/session" });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/alipay/checkout");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ plan: "pro" });
    vi.unstubAllEnvs();
  });

  it("fails closed without the Alipay provider and never calls Stripe", async () => {
    vi.stubEnv("NEXT_PUBLIC_COMMERCIAL_PAYMENT_PROVIDER", "stripe");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(createCommercialCheckout("pro")).rejects.toMatchObject({ code: "PAYMENT_UNAVAILABLE", status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
