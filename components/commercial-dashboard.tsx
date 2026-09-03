"use client";

import { FolderKanban, Plus, RefreshCw, ShieldAlert } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CommercialRunRecoveryPanel } from "@/components/commercial-run-recovery-panel";

import {
  CommercialApiError,
  cancelCommercialRun,
  createCommercialProject,
  createCommercialCheckout,
  createCommercialPortal,
  createCommercialIdempotencyKey,
  getCommercialResult,
  getCommercialRun,
  getCommercialSubscription,
  launchCommercialAnalysis,
  listCommercialPlans,
  listCommercialProjects,
  type CommercialAnalysisResult,
  type CommercialProject,
  type CommercialRunHistoryItem,
  type CommercialRun,
  type CommercialSubscription,
  type CommercialUsage,
} from "@/lib/client/commercial-api";

type DashboardState = "loading" | "ready" | "error";
type RunState = "idle" | "loading" | "polling" | "success" | "error";
type RunErrorAction = "retry-analysis" | "refresh-run" | "refresh-result" | null;

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "日期待确认" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(date);
}

function errorMessage(error: unknown): string {
  return error instanceof CommercialApiError ? error.message : "商业工作台暂不可用，请稍后重试。";
}

function isWorkspaceBoundaryError(error: unknown): boolean {
  return error instanceof CommercialApiError &&
    (error.code === "AUTH_UNAVAILABLE" || error.code === "UNAUTHENTICATED" || error.code === "WORKSPACE_REQUIRED");
}

export function CommercialDashboard() {
  const betaMode = process.env.NEXT_PUBLIC_EVIDRA_BETA_MODE?.trim() === "true";
  const [state, setState] = useState<DashboardState>("loading");
  const [projects, setProjects] = useState<CommercialProject[]>([]);
  const [history, setHistory] = useState<import("@/lib/client/commercial-api").CommercialProjectHistory[]>([]);
  const [usage, setUsage] = useState<CommercialUsage | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [run, setRun] = useState<CommercialRun | null>(null);
  const [result, setResult] = useState<CommercialAnalysisResult | null>(null);
  const [runState, setRunState] = useState<RunState>("idle");
  const [runError, setRunError] = useState("");
  const [runErrorCode, setRunErrorCode] = useState("");
  const [runErrorAction, setRunErrorAction] = useState<RunErrorAction>(null);
  const launchKeyRef = useRef<string | null>(null);
  const previousSelectedIdRef = useRef<string | null>(null);
  const [subscription, setSubscription] = useState<CommercialSubscription | null>(null);
  const [plans, setPlans] = useState<import("@/lib/client/commercial-api").CommercialPlan[]>([]);
  const [plansError, setPlansError] = useState("");
  const [billingError, setBillingError] = useState("");
  const [checkouting, setCheckouting] = useState<string | null>(null);
  const [billingMessage, setBillingMessage] = useState("");
  const [portalLoading, setPortalLoading] = useState(false);
  const [cancellingRunId, setCancellingRunId] = useState<string | null>(null);
  const cancelKeyRef = useRef<{ runId: string; key: string } | null>(null);

  const loadProjects = useCallback(async () => {
    setState("loading");
    setError("");
    setErrorCode("");
    setBillingError("");
    setPlansError("");
    setProjects([]);
    setHistory([]);
    setUsage(null);
    setRun(null);
    setResult(null);
    setRunState("idle");
    setRunError("");
    setRunErrorCode("");
    setRunErrorAction(null);
    launchKeyRef.current = null;
    cancelKeyRef.current = null;
    setCancellingRunId(null);
    try {
      const [projectResult, subscriptionResult, plansResult] = await Promise.allSettled([
        listCommercialProjects(),
        betaMode || process.env.NEXT_PUBLIC_COMMERCIAL_PAYMENT_PROVIDER?.trim() === "alipay" ? Promise.resolve(null) : getCommercialSubscription(),
        betaMode ? Promise.resolve([]) : listCommercialPlans(),
      ]);
      if (projectResult.status === "rejected") throw projectResult.reason;
      const result = projectResult.value;
      setProjects(result.projects);
      setHistory(result.history);
      setUsage(result.usage);
      setSelectedId((current) => current && result.projects.some((project) => project.id === current) ? current : result.projects[0]?.id ?? null);
      if (subscriptionResult.status === "fulfilled") setSubscription(subscriptionResult.value);
      else {
        if (isWorkspaceBoundaryError(subscriptionResult.reason)) throw subscriptionResult.reason;
        setSubscription(null);
        setBillingError(errorMessage(subscriptionResult.reason));
      }
      if (plansResult.status === "fulfilled") setPlans(plansResult.value);
      else {
        if (isWorkspaceBoundaryError(plansResult.reason)) throw plansResult.reason;
        setPlans([]);
        setPlansError(errorMessage(plansResult.reason));
      }
      setState("ready");
    } catch (loadError) {
      setProjects([]);
      setHistory([]);
      setUsage(null);
      setSelectedId(null);
      setRun(null);
      setResult(null);
      setSubscription(null);
      setPlans([]);
      setPlansError("");
      setState("error");
      setError(errorMessage(loadError));
      setErrorCode(loadError instanceof CommercialApiError ? loadError.code : "");
    }
  }, [betaMode]);

  useEffect(() => {
    const billing = new URLSearchParams(window.location.search).get("billing");
    if (billing === "cancelled") setBillingMessage("支付已取消，订阅状态未改变。");
    if (billing === "success") setBillingMessage("支付已提交，订阅状态将在确认后更新。");
  }, []);

  useEffect(() => {
    const previousSelectedId = previousSelectedIdRef.current;
    if (previousSelectedId !== null && previousSelectedId !== selectedId) {
      setRun(null);
      setResult(null);
      setRunState("idle");
      setRunError("");
      setRunErrorCode("");
      setRunErrorAction(null);
      launchKeyRef.current = null;
      cancelKeyRef.current = null;
      setCancellingRunId(null);
    }
    previousSelectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const refreshRun = useCallback(async (runId: string) => {
    try {
      const current = await getCommercialRun(runId);
      setRun(current);
      if (current.status === "succeeded") {
        try {
          const analysis = await getCommercialResult(runId);
          setResult(analysis);
          setRunState("success");
          setRunError("");
          setRunErrorCode("");
          setRunErrorAction(null);
          launchKeyRef.current = null;
        } catch (resultError) {
          setRunState("error");
          setRunError(errorMessage(resultError));
          setRunErrorCode(resultError instanceof CommercialApiError ? resultError.code : "");
          setRunErrorAction("refresh-result");
        }
        return current;
      }
      if (current.status === "failed" || current.status === "cancelled") {
        setRunState("error");
        setRunError(current.failureCode === "EXECUTION_RETRYABLE" ? "分析服务暂时不可用，请稍后重试。" : "分析执行失败，可重新提交。");
        setRunErrorCode(current.failureCode ?? "");
        setRunErrorAction("retry-analysis");
        launchKeyRef.current = null;
        return current;
      }
      setRunState("polling");
      setRunError("");
      setRunErrorCode("");
      setRunErrorAction(null);
      return current;
    } catch (loadError) {
      setRunState("error");
      setRunError(errorMessage(loadError));
      setRunErrorCode(loadError instanceof CommercialApiError ? loadError.code : "");
      setRunErrorAction("refresh-run");
      return null;
    }
  }, []);

  useEffect(() => {
    if (!run || (run.status !== "queued" && run.status !== "running") || runState === "error") return;
    const timer = window.setTimeout(() => { void refreshRun(run.id); }, 1500);
    return () => window.clearTimeout(timer);
  }, [run, runState, refreshRun]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = projectName.trim();
    if (!name || creating) return;
    setCreating(true);
    setError("");
    setErrorCode("");
    try {
      const project = await createCommercialProject(name);
      setProjects((current) => [project, ...current]);
      setHistory((current) => [{ projectId: project.id, runs: [] }, ...current]);
      setSelectedId(project.id);
      setProjectName("");
      setUsage((current) => current ? { ...current } : current);
    } catch (createError) {
      setError(errorMessage(createError));
      setErrorCode(createError instanceof CommercialApiError ? createError.code : "");
    } finally {
      setCreating(false);
    }
  }

  async function handleAnalyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProject || !title.trim() || !content.trim() || runState === "loading" || runState === "polling") return;
    setRunState("loading");
    setRunError("");
    setRunErrorCode("");
    setRunErrorAction(null);
    setResult(null);
    try {
      const idempotencyKey = launchKeyRef.current ?? createCommercialIdempotencyKey();
      launchKeyRef.current = idempotencyKey;
      const launched = await launchCommercialAnalysis(selectedProject.id, { title: title.trim(), content }, idempotencyKey);
      setRun(launched);
      cancelKeyRef.current = null;
      await refreshRun(launched.id);
    } catch (launchError) {
      setRunState("error");
      setRunError(errorMessage(launchError));
      setRunErrorCode(launchError instanceof CommercialApiError ? launchError.code : "");
      setRunErrorAction("retry-analysis");
    }
  }

  function retryAnalysis() {
    if (runErrorAction === "refresh-run" && run) { void refreshRun(run.id); return; }
    if (runErrorAction === "refresh-result" && run) { void refreshResult(run.id); return; }
    if (selectedProject && title.trim() && content.trim()) void handleAnalyze({ preventDefault() {} } as FormEvent<HTMLFormElement>);
  }

  const refreshResult = useCallback(async (runId: string): Promise<boolean> => {
    try {
      const analysis = await getCommercialResult(runId);
      setResult(analysis);
      setRunState("success");
      setRunError("");
      setRunErrorCode("");
      setRunErrorAction(null);
      launchKeyRef.current = null;
      return true;
    } catch (resultError) {
      setRunState("error");
      setRunError(errorMessage(resultError));
      setRunErrorCode(resultError instanceof CommercialApiError ? resultError.code : "");
      setRunErrorAction("refresh-result");
      return false;
    }
  }, []);

  async function openHistoryRun(historyRun: CommercialRunHistoryItem) {
    const nextRun = { ...historyRun };
    setRun(nextRun);
    setResult(null);
    setRunError("");
    setRunErrorCode("");
    setRunErrorAction(null);
    if (historyRun.status === "succeeded" && historyRun.resultAvailable) {
      setRunState("loading");
      await refreshResult(historyRun.id);
      return;
    }
    if (historyRun.status === "queued" || historyRun.status === "running") {
      setRunState("polling");
      await refreshRun(historyRun.id);
      return;
    }
    setRunState("error");
    setRunError(historyRun.status === "cancelled" ? "本次分析已取消，可重新提交内容。" : "本次分析未完成，可重新提交内容。");
    setRunErrorCode(historyRun.failureCode ?? "");
    setRunErrorAction(null);
  }

  async function refreshHistoryRun(historyRun: CommercialRunHistoryItem) {
    try {
      const current = await getCommercialRun(historyRun.id);
      const nextHistoryRun = { ...historyRun, ...current };
      setHistory((entries) => entries.map((entry) => entry.projectId === historyRun.projectId ? {
        ...entry,
        runs: entry.runs.map((runItem) => runItem.id === historyRun.id ? { ...runItem, ...current } : runItem),
      } : entry));
      if (current.status === "succeeded") {
        setRun(nextHistoryRun);
        setRunState("loading");
        const resultLoaded = await refreshResult(current.id);
        if (resultLoaded) {
          setHistory((entries) => entries.map((entry) => entry.projectId === historyRun.projectId ? {
            ...entry,
            runs: entry.runs.map((runItem) => runItem.id === historyRun.id ? { ...runItem, resultAvailable: true } : runItem),
          } : entry));
        }
        return;
      }
      setRun({ ...historyRun, ...current });
      if (current.status === "queued" || current.status === "running") {
        setRunState("polling");
        setRunError("");
        setRunErrorCode("");
        setRunErrorAction(null);
      } else {
        setRunState("error");
        setRunError(current.status === "cancelled" ? "本次分析已取消，可重新提交内容。" : "本次分析未完成，可重新提交内容。");
        setRunErrorCode(current.failureCode ?? "");
        setRunErrorAction(null);
      }
    } catch (historyError) {
      setRun(historyRun);
      setRunState("error");
      setRunError(errorMessage(historyError));
      setRunErrorCode(historyError instanceof CommercialApiError ? historyError.code : "");
      setRunErrorAction("refresh-run");
    }
  }

  async function cancelRun(historyRun: CommercialRunHistoryItem | CommercialRun) {
    if (historyRun.status !== "queued" || cancellingRunId) return;
    setCancellingRunId(historyRun.id);
    setRunError("");
    setRunErrorCode("");
    const key = cancelKeyRef.current?.runId === historyRun.id
      ? cancelKeyRef.current.key
      : createCommercialIdempotencyKey();
    cancelKeyRef.current = { runId: historyRun.id, key };
    try {
      const cancelled = await cancelCommercialRun(historyRun.id, key);
      cancelKeyRef.current = null;
      setRun(cancelled);
      setRunState("error");
      setRunError("本次分析已取消，可重新提交内容。");
      setRunErrorAction(null);
      setHistory((entries) => entries.map((entry) => ({
        ...entry,
        runs: entry.runs.map((runItem) => runItem.id === cancelled.id ? { ...runItem, ...cancelled, resultAvailable: false } : runItem),
      })));
    } catch (cancelError) {
      setRunError(errorMessage(cancelError));
      setRunErrorCode(cancelError instanceof CommercialApiError ? cancelError.code : "");
      setRunErrorAction("refresh-run");
    } finally {
      setCancellingRunId(null);
    }
  }

  async function handleCheckout(plan: string) {
    if (checkouting) return;
    setCheckouting(plan);
    setBillingError("");
    try {
      const checkout = await createCommercialCheckout(plan);
      window.location.assign(checkout.checkoutUrl);
    } catch (checkoutError) {
      setBillingError(errorMessage(checkoutError));
    } finally {
      setCheckouting(null);
    }
  }

  async function handlePortal() {
    if (portalLoading) return;
    setPortalLoading(true);
    setBillingError("");
    try {
      const portal = await createCommercialPortal();
      window.location.assign(portal.portalUrl);
    } catch (portalError) {
      setBillingError(errorMessage(portalError));
    } finally {
      setPortalLoading(false);
    }
  }

  function subscriptionLabel(value: CommercialSubscription | null): string {
    if (!value) return "未订阅";
    if ((value.status === "active" || value.status === "trialing") && value.currentPeriodEnd && new Date(value.currentPeriodEnd).getTime() > Date.now()) {
      return value.status === "trialing" ? "试用中" : "订阅有效";
    }
    if (value.status === "past_due") return "付款待处理";
    if (value.status === "canceled") return "订阅已取消";
    if (value.status === "unpaid") return "付款失败";
    if (value.status === "paused") return "订阅已暂停";
    if (value.status === "incomplete_expired") return "订阅已过期";
    if (value.status === "incomplete") return "订阅确认中";
    if (value.currentPeriodEnd && new Date(value.currentPeriodEnd).getTime() <= Date.now()) return "订阅已过期";
    return "订阅状态待确认";
  }

  const selectedProject = projects.find((project) => project.id === selectedId) ?? null;
  const selectedHistory = history.find((entry) => entry.projectId === selectedId)?.runs ?? [];
  const quotaFull = usage ? usage.consumed >= usage.limit : false;
  const betaAccessActive = usage?.accessMode === "beta" && !quotaFull;

  return (
    <main className="commercial-dashboard" aria-labelledby="commercial-dashboard-title">
      <header className="commercial-dashboard-header">
        <div>
          <p className="commercial-eyebrow">已认证工作区</p>
          <h1 id="commercial-dashboard-title">AI 内容发布前审查工作台</h1>
          <p className="commercial-dashboard-lede">按产品线与内容项目管理 GEO 审查、共享额度与交付报告。</p>
        </div>
        <button type="button" className="commercial-refresh-button" onClick={() => void loadProjects()} disabled={state === "loading"}>
          <RefreshCw aria-hidden="true" />
          刷新
        </button>
      </header>

      {error ? (
        <section className="commercial-dashboard-alert" role="alert">
          <ShieldAlert aria-hidden="true" />
          <span>{error}</span>
          {errorCode === "WORKSPACE_REQUIRED" || errorCode === "NOT_FOUND" ? <Link href="/onboarding">设置或选择工作区</Link> : null}
          {errorCode === "UNAUTHENTICATED" ? <Link href="/sign-in?redirect_url=%2Fdashboard">重新登录</Link> : null}
          <button type="button" onClick={() => void loadProjects()}>重试</button>
        </section>
      ) : null}

      {billingMessage ? <section className="commercial-dashboard-info" role="status">{billingMessage}</section> : null}
      <section className="commercial-billing-panel" aria-labelledby="commercial-billing-title" aria-busy={state === "loading" || checkouting !== null}>
        <div className="commercial-billing-summary">
          <div><p className="commercial-eyebrow">Workspace usage</p><h2 id="commercial-billing-title">{betaMode ? "邀请制 Beta 额度" : "套餐与共享额度"}</h2></div>
          <div className="commercial-billing-status"><strong>{betaMode ? betaAccessActive ? "Beta 授权有效" : "等待 Beta 授权" : subscriptionLabel(subscription)}</strong><span>{usage ? `已用 ${usage.consumed} / ${usage.limit} 次审查` : "额度待确认"}</span></div>
        </div>
        {billingError ? <p className="commercial-billing-error" role="alert">{billingError}</p> : null}
        {quotaFull ? <p className="commercial-billing-error">{betaMode ? "本次 Beta 授权额度已用完。" : plansError ? "当前工作区没有可用审查次数，支付入口尚未配置，暂不能购买。" : "当前工作区共享额度已用完，请选择可用套餐或等待支付状态更新。"}</p> : null}
        <p className="commercial-billing-muted">{betaMode ? "这是邀请制免费 Beta。额度由服务端授权并记录，授权到期后自动失效；不会创建支付订单。" : "面向 B2B SaaS 内容、增长与品牌团队；实际套餐名称、价格与额度以服务端当前配置为准。"}</p>
        {!betaMode ? <p className="commercial-billing-muted">套餐为一次性支付，不自动续费；付款成功并完成校验后才发放审查次数，失败或未生成完整报告不扣次数。</p> : null}
        {!betaMode && (state === "loading" && plans.length === 0 ? <div className="commercial-plan-skeleton" aria-label="正在加载支付宝套餐"><span /><span /><span /></div> : plans.length > 0 ? <div className="commercial-plan-list">{plans.map((plan) => {
          const planCopy: Record<string, { name: string; scene: string; unit: string; badge?: string }> = {
            new_user: { name: "Starter", scene: "一篇内容的审查与复查", unit: "30 天有效" },
            growth: { name: "Growth", scene: "内容团队日常发布前审查", unit: "12 个月有效", badge: "推荐起步方案" },
            team: { name: "Team", scene: "工作区共享额度", unit: "12 个月有效" },
            agency: { name: "Scale", scene: "高频发布、多项目、多产品线", unit: "12 个月有效" },
          };
          const copy = planCopy[plan.key] ?? { name: plan.key, scene: "发布前内容审查", unit: "以服务端规则为准" };
          const unitPrice = plan.runLimit > 0 ? (Number(plan.amount) / plan.runLimit).toFixed(2) : null;
          return <article key={plan.key} className="commercial-plan-card"><strong>{copy.name}</strong>{copy.badge ? <em>{copy.badge}</em> : null}<span>¥{plan.amount} · {plan.runLimit} 次发布前审查</span><small>{copy.scene} · {copy.unit}{unitPrice ? ` · 每次约 ¥${unitPrice}` : ""}</small><button type="button" onClick={() => void handleCheckout(plan.key)} disabled={checkouting !== null || portalLoading}>{checkouting === plan.key ? "正在打开支付宝" : `购买 ${plan.runLimit} 次审查 ¥${plan.amount}`}</button></article>;
        })}</div> : <p className="commercial-billing-muted">{plansError ? `${plansError}当前不能购买套餐。` : "支付宝套餐暂不可用，请稍后重试。"}</p>)}
        {!betaMode && subscription && (subscription.status === "active" || subscription.status === "trialing") && subscription.currentPeriodEnd && new Date(subscription.currentPeriodEnd).getTime() > Date.now() ? (
          <button type="button" className="commercial-portal-button" onClick={() => void handlePortal()} disabled={portalLoading || checkouting !== null}>
            {portalLoading ? "打开中" : "管理订阅"}
          </button>
        ) : null}
      </section>

      {!betaMode ? <AlipayOperatorPanel /> : null}
      <CommercialRunRecoveryPanel />

      <div className="commercial-dashboard-grid">
        <section className="commercial-projects-panel" aria-labelledby="commercial-projects-title">
          <div className="commercial-panel-heading">
            <div>
              <p className="commercial-eyebrow">Workspace projects</p>
              <h2 id="commercial-projects-title">我的项目</h2>
            </div>
            {usage ? <span className={`commercial-quota ${quotaFull ? "is-full" : ""}`}>{usage.consumed}/{usage.limit} 次审查</span> : null}
          </div>

          <form className="commercial-project-form" onSubmit={handleCreate}>
            <label htmlFor="commercial-project-name">新建项目</label>
            <div className="commercial-project-form-row">
              <input
                id="commercial-project-name"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="例如：客户官网 GEO 发布前审查"
                maxLength={120}
                required
                disabled={creating || state === "loading"}
              />
              <button type="submit" disabled={creating || !projectName.trim() || state === "loading"}>
                <Plus aria-hidden="true" />
                {creating ? "创建中" : "创建"}
              </button>
            </div>
          </form>

          {state === "loading" ? <p className="commercial-dashboard-state">正在加载项目…</p> : null}
          {state === "ready" && projects.length === 0 ? (
            <div className="commercial-dashboard-empty">
              <FolderKanban aria-hidden="true" />
              <h3>还没有项目</h3>
              <p>创建第一个内容项目后，即可开始发布前审查并生成交付报告。</p>
            </div>
          ) : null}
          {projects.length > 0 ? (
            <ul className="commercial-project-list">
              {projects.map((project) => (
                <li key={project.id}>
                  <button type="button" className={`commercial-project-item ${selectedId === project.id ? "is-selected" : ""}`} onClick={() => setSelectedId(project.id)} aria-pressed={selectedId === project.id}>
                    <span className="commercial-project-icon"><FolderKanban aria-hidden="true" /></span>
                    <span className="commercial-project-item-copy"><strong>{project.name}</strong><small>创建于 {formatDate(project.createdAt)}</small></span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="commercial-project-detail" aria-labelledby="commercial-project-detail-title">
          {selectedProject ? (
            <>
              <p className="commercial-eyebrow">Project detail</p>
              <h2 id="commercial-project-detail-title">{selectedProject.name}</h2>
              <p className="commercial-detail-meta">项目已绑定当前认证工作区。后续分析、运行记录和结果都会沿用服务端 ownership 检查。</p>
              <p className="commercial-detail-meta">当前页面会显示本次打开后的运行状态。刷新或返回后，如果没有可验证的历史运行记录，结果区域会保持真实空态；不会显示占位报告。</p>
              <section className="commercial-run-history" aria-labelledby="commercial-run-history-title">
                <div className="commercial-history-heading">
                  <h3 id="commercial-run-history-title">最近运行</h3>
                  <span>最多显示 20 条</span>
                </div>
                {selectedHistory.length === 0 ? <p className="commercial-detail-meta">该项目还没有可验证的运行记录。</p> : (
                  <ul>
                    {selectedHistory.map((historyRun) => {
                      const statusLabel = historyRun.status === "queued" ? "排队中" : historyRun.status === "running" ? "分析中" : historyRun.status === "succeeded" ? "已完成" : historyRun.status === "cancelled" ? "已取消" : "未完成";
                      return <li key={historyRun.id}>
                        <span><strong>{statusLabel}</strong><small>{formatDate(historyRun.createdAt)}</small></span>
                        {historyRun.status === "succeeded" && historyRun.resultAvailable ? <button type="button" onClick={() => void openHistoryRun(historyRun)}>查看报告</button> : null}
                        {(historyRun.status === "queued" || historyRun.status === "running" || historyRun.status === "failed" || historyRun.status === "cancelled" || (historyRun.status === "succeeded" && !historyRun.resultAvailable)) ? <button type="button" onClick={() => void refreshHistoryRun(historyRun)}>刷新状态</button> : null}
                        {historyRun.status === "queued" ? <button type="button" onClick={() => void cancelRun(historyRun)} disabled={cancellingRunId === historyRun.id}>{cancellingRunId === historyRun.id ? "取消中" : "取消本次分析"}</button> : null}
                        {historyRun.status === "running" ? <span className="commercial-history-unavailable">正在分析，暂不可取消</span> : null}
                        {historyRun.status === "succeeded" && !historyRun.resultAvailable ? <span className="commercial-history-unavailable">报告暂不可用</span> : null}
                        {(historyRun.status === "failed" || historyRun.status === "cancelled") ? <span className="commercial-history-unavailable">可重新提交</span> : null}
                      </li>;
                    })}
                  </ul>
                )}
              </section>
              <form className="commercial-analysis-form" onSubmit={handleAnalyze}>
                <label htmlFor="commercial-analysis-title">标题</label>
                <input id="commercial-analysis-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={240} required disabled={runState === "loading" || runState === "polling"} />
                <label htmlFor="commercial-analysis-content">正文</label>
                <textarea id="commercial-analysis-content" value={content} onChange={(event) => setContent(event.target.value)} maxLength={500_000} rows={8} required disabled={runState === "loading" || runState === "polling"} />
                <button type="submit" disabled={quotaFull || !title.trim() || !content.trim() || runState === "loading" || runState === "polling"}>
                  {runState === "loading" ? "提交中" : runState === "polling" ? "分析中" : "开始分析"}
                </button>
                {quotaFull ? <p className="commercial-form-hint">当前工作区没有可用审查次数；项目仍可创建，获得服务端确认的额度后即可提交审查。</p> : null}
              </form>
              {runState === "error" ? <section className="commercial-dashboard-alert" role="alert"><span className="commercial-run-error">{runError}</span>{runErrorCode === "UNAUTHENTICATED" ? <Link href="/sign-in?redirect_url=%2Fdashboard">重新登录</Link> : null}{runErrorAction ? <button type="button" onClick={retryAnalysis}>{runErrorAction === "refresh-run" ? "刷新状态" : runErrorAction === "refresh-result" ? "重新读取报告" : "重试分析"}</button> : null}</section> : null}
              {run && (runState === "polling" || run.status === "queued" || run.status === "running") ? <div className="commercial-detail-status"><span className="commercial-status-dot" />{run.status === "queued" ? "排队中" : "正在分析"}<button type="button" onClick={() => void refreshRun(run.id)}>刷新状态</button>{run.status === "queued" ? <button type="button" onClick={() => void cancelRun(run)} disabled={cancellingRunId === run.id}>{cancellingRunId === run.id ? "取消中" : "取消本次分析"}</button> : <span className="commercial-history-unavailable">暂不可取消</span>}</div> : null}
              {result ? <AnalysisResultView result={result} /> : null}
            </>
          ) : (
            <div className="commercial-dashboard-empty commercial-dashboard-empty-detail">
              <FolderKanban aria-hidden="true" />
              <h2 id="commercial-project-detail-title">选择一个项目</h2>
              <p>项目详情会显示在这里。</p>
            </div>
          )}
        </section>
      </div>
      <nav className="commercial-legal-links" aria-label="商业支持与法律"><Link href="/terms">服务条款</Link><Link href="/privacy">隐私说明</Link><Link href="/support">支持与联系</Link></nav>
    </main>
  );
}

function AlipayOperatorPanel() {
  const [open, setOpen] = useState(false); const [reference, setReference] = useState(""); const [type, setType] = useState<"refund_review" | "reconciliation">("refund_review");
  const [items, setItems] = useState<Array<{ id: string; type: string; status: string; createdAt: string }>>([]); const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle"); const [message, setMessage] = useState("");
  async function load() { setOpen(true); setStatus("loading"); setMessage(""); try { const response = await fetch("/api/alipay/operator", { cache: "no-store" }); const body = await response.json(); if (!response.ok) throw new Error(response.status === 403 ? "仅工作区所有者可使用支付运营能力。" : "支付运营能力暂不可用。"); setItems(Array.isArray(body.requests) ? body.requests : []); setStatus("ready"); } catch (error) { setMessage(error instanceof Error ? error.message : "支付运营能力暂不可用。"); setStatus("error"); } }
  async function submit(event: FormEvent) { event.preventDefault(); if (!reference.trim()) return; setStatus("loading"); setMessage(""); try { const response = await fetch("/api/alipay/operator", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ type, reference: reference.trim() }) }); const body = await response.json(); if (!response.ok) throw new Error(response.status === 403 ? "仅工作区所有者可使用支付运营能力。" : "运营请求未创建，请稍后重试。"); setItems((current) => [body.request, ...current]); setReference(""); setStatus("ready"); setMessage("运营审核请求已创建。"); } catch (error) { setMessage(error instanceof Error ? error.message : "运营请求未创建，请稍后重试。"); setStatus("error"); } }
  return <section className="commercial-operator-panel" aria-labelledby="commercial-operator-title"><button type="button" onClick={() => void load()} disabled={status === "loading"}>{status === "loading" ? "正在检查权限" : "支付运营管理"}</button>{open ? <div><h2 id="commercial-operator-title">支付宝运营审核</h2><p>退款与对账仅创建内部审核请求，不会直接调用支付机构。</p>{message ? <p role={status === "error" ? "alert" : "status"}>{message}</p> : null}{status === "ready" ? <form onSubmit={submit}><label htmlFor="operator-reference">内部支付引用</label><input id="operator-reference" value={reference} onChange={(event) => setReference(event.target.value)} maxLength={128} required /><select aria-label="运营类型" value={type} onChange={(event) => setType(event.target.value as typeof type)}><option value="refund_review">退款审核</option><option value="reconciliation">对账任务</option></select><button type="submit">创建审核请求</button></form> : null}{status === "ready" && items.length === 0 ? <p>暂无运营审核请求。</p> : null}{items.length ? <ul>{items.map((item) => <li key={item.id}><strong>{item.type === "refund_review" ? "退款审核" : "对账任务"}</strong><span>{item.status}</span></li>)}</ul> : null}</div> : null}</section>;
}

function AnalysisResultView({ result }: { result: CommercialAnalysisResult }) {
  return <section className="commercial-analysis-result" aria-labelledby="commercial-analysis-result-title">
    <h3 id="commercial-analysis-result-title">分析结果</h3>
    <p className="commercial-result-score">总分 {result.score}</p>
    <h4>问题（5）</h4>
    <ol>{result.analysis.questions.questions.map((question) => <li key={question}>{question}</li>)}</ol>
    <h4>诊断</h4>
    <p>{result.diagnostics.issueCount ? `发现 ${result.diagnostics.issueCount} 项需要关注的问题。` : "未发现需要关注的问题。"}</p>
    <h4>Patch 建议</h4>
    <pre>{result.analysis.patch.markdown}</pre>
  </section>;
}
