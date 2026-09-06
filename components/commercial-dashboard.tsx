"use client";

import { BarChart3, Bell, CheckCircle2, ChevronRight, ClipboardCheck, ClipboardCopy, FileSearch, FileText, FolderKanban, Gift, Home, Lightbulb, ListPlus, LoaderCircle, Plus, RefreshCw, RotateCcw, Settings2, ShieldAlert, Sparkles, UploadCloud, WandSparkles } from "lucide-react";
import { DragEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
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
  grantCommercialBeta,
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
  const betaMode = process.env.NEXT_PUBLIC_EVIDRA_BETA_MODE?.trim() === "true" || process.env.NEXT_PUBLIC_EVIDRA_INTERVIEW_MODE?.trim() === "true";
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
  const [inputMode, setInputMode] = useState<"upload" | "paste">("upload");
  const [fileMessage, setFileMessage] = useState("");
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [run, setRun] = useState<CommercialRun | null>(null);
  const [result, setResult] = useState<CommercialAnalysisResult | null>(null);
  const [baselineResult, setBaselineResult] = useState<CommercialAnalysisResult | null>(null);
  const [patchCopied, setPatchCopied] = useState(false);
  const [patchAdopted, setPatchAdopted] = useState(false);
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
  const [betaGrantLoading, setBetaGrantLoading] = useState(false);
  const [betaGrantMessage, setBetaGrantMessage] = useState("");
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
    setBaselineResult(null);
    setPatchCopied(false);
    setPatchAdopted(false);
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
      setBaselineResult(null);
      setPatchCopied(false);
      setPatchAdopted(false);
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
      setBaselineResult(null);
      setTitle("");
      setContent("");
      setFileMessage("");
      setPatchCopied(false);
      setPatchAdopted(false);
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

  const syncWorkspaceSummary = useCallback(async () => {
    try {
      const summary = await listCommercialProjects();
      setProjects(summary.projects);
      setHistory(summary.history);
      setUsage(summary.usage);
    } catch {
      // A completed report remains usable even if the non-critical summary refresh is unavailable.
    }
  }, []);

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
          void syncWorkspaceSummary();
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
  }, [syncWorkspaceSummary]);

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
      setInputMode("paste");
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
    if (result) setBaselineResult(result);
    setResult(null);
    setPatchCopied(false);
    setPatchAdopted(false);
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
    setInputMode("paste");
    const nextRun = { ...historyRun };
    setRun(nextRun);
    setResult(null);
    setBaselineResult(null);
    setPatchCopied(false);
    setPatchAdopted(false);
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
    setInputMode("paste");
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

  async function handleBetaGrant() {
    if (betaGrantLoading) return;
    setBetaGrantLoading(true);
    setBetaGrantMessage("");
    try {
      const grant = await grantCommercialBeta();
      setBetaGrantMessage(`已发放 ${grant.runLimit} 次 Beta 额度。`);
      await loadProjects();
    } catch (grantError) {
      setBetaGrantMessage(errorMessage(grantError));
    } finally {
      setBetaGrantLoading(false);
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
  const completedRuns = selectedHistory.filter((item) => item.status === "succeeded").length;
  const latestRun = selectedHistory[0] ?? null;

  async function copyPatch(markdown: string) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
      await navigator.clipboard.writeText(markdown);
      setPatchCopied(true);
    } catch {
      setPatchCopied(false);
    }
  }

  function focusAnalysisEditor() {
    const editor = document.getElementById("commercial-analysis-content");
    editor?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => editor?.focus(), 250);
  }

  function focusProjectCreator() {
    const creator = document.getElementById("commercial-project-name");
    creator?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => creator?.focus(), 250);
  }

  async function handleFilePick(file: File | undefined) {
    if (!file) return;
    setFileMessage("");
    const supported = /\.(txt|md|markdown)$/i.test(file.name);
    if (!supported) {
      setFileMessage("当前演示版可直接读取 TXT / Markdown；PDF、DOCX 请先复制正文到“粘贴正文”。");
      setInputMode("paste");
      return;
    }
    try {
      const text = await file.text();
      setTitle(file.name.replace(/\.(txt|md|markdown)$/i, ""));
      setContent(text);
      setInputMode("paste");
      setFileMessage(`已读取 ${file.name}，请确认项目后开始分析。`);
    } catch {
      setFileMessage("文件读取失败，请改用“粘贴正文”。");
    }
  }

  function handleFileDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!isDraggingFile) setIsDraggingFile(true);
  }

  function handleFileDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDraggingFile(false);
  }

  function handleFileDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDraggingFile(false);
    void handleFilePick(event.dataTransfer.files?.[0]);
  }

  return (
    <main className={`commercial-workspace-shell ${betaMode ? "is-interview-mode" : ""} evidra-home-shell`} aria-labelledby="commercial-dashboard-title">
      <aside className="commercial-workspace-sidebar evidra-sidebar" aria-label="工作区导航">
        <div className="commercial-sidebar-brand evidra-sidebar-brand"><span className="commercial-sidebar-mark"><Sparkles aria-hidden="true" /></span><span><strong>Evidra</strong><small>内容可信度审查</small></span></div>
        <nav aria-label="主工作区导航" className="evidra-sidebar-nav">
          <a className="is-active" href="#overview"><Home aria-hidden="true" />首页</a>
          <span className="evidra-nav-label">工作空间</span>
          <a href="#review"><FileSearch aria-hidden="true" />我的审查</a>
          <a href="#drafts"><FolderKanban aria-hidden="true" />草稿箱</a>
          <a href="#report"><BarChart3 aria-hidden="true" />报告与记录</a>
          <span className="evidra-nav-label">工具</span>
          <a href="#patch"><WandSparkles aria-hidden="true" />AI 修改建议</a>
          <a href="#recheck"><RotateCcw aria-hidden="true" />重新验证</a>
          <span className="evidra-nav-label">支持</span>
          <a href="/support"><ShieldAlert aria-hidden="true" />帮助中心</a>
        </nav>
        <div className="commercial-sidebar-footer evidra-sidebar-footer"><span className="commercial-sidebar-avatar">N</span><span><strong>Nana</strong><small>Pro Plan</small></span><ChevronRight aria-hidden="true" /></div>
      </aside>
      <section className="commercial-workspace-main evidra-main">
        <header className="commercial-workspace-topbar evidra-topbar">
          <div className="evidra-topbar-context"><span>内容可信度审查</span>{selectedProject ? <><span className="commercial-context-divider">/</span><strong>{selectedProject.name}</strong></> : null}</div>
          <div className="commercial-workspace-top-actions"><Link className="evidra-icon-button" href="/support?topic=invite"><Gift aria-hidden="true" /><span>邀请好友</span></Link><Link className="evidra-icon-button" href="#report" aria-label="查看最近报告"><Bell aria-hidden="true" /><span className="evidra-notification-dot">3</span></Link><span className="evidra-user-avatar" aria-label="当前用户 Nana">N</span></div>
        </header>
        <div className="commercial-dashboard evidra-dashboard" id="overview">
          <header className="commercial-dashboard-header evidra-welcome-header">
            <div><p className="evidra-welcome">👋 欢迎回来，Nana</p><h1 id="commercial-dashboard-title">开始一次内容可信度审查</h1><p className="commercial-dashboard-lede">Evidra 基于 Evidence First 原则，帮助你识别内容风险，提升观点可信度。</p></div>
          </header>

          {error ? <section className="commercial-dashboard-alert" role="alert"><ShieldAlert aria-hidden="true" /><span>{error}</span>{errorCode === "WORKSPACE_REQUIRED" || errorCode === "NOT_FOUND" ? <Link href="/onboarding">设置或选择工作区</Link> : null}{errorCode === "UNAUTHENTICATED" ? <Link href="/sign-in?redirect_url=%2Fdashboard">重新登录</Link> : null}<button type="button" onClick={() => void loadProjects()}>重试</button></section> : null}
          {billingMessage ? <section className="commercial-dashboard-info" role="status">{billingMessage}</section> : null}

          <div className="evidra-home-grid">
            <div className="evidra-home-primary">
              <section className="evidra-upload-card" id="review" aria-labelledby="evidra-upload-title">
                <div className="evidra-tabs" role="tablist" aria-label="内容输入方式"><button type="button" role="tab" aria-selected={inputMode === "upload"} className={inputMode === "upload" ? "is-active" : ""} onClick={() => setInputMode("upload")}><UploadCloud aria-hidden="true" />上传文档</button><button type="button" role="tab" aria-selected={inputMode === "paste"} className={inputMode === "paste" ? "is-active" : ""} onClick={() => setInputMode("paste")}><ClipboardCheck aria-hidden="true" />粘贴正文</button></div>
                {inputMode === "upload" ? <div className={`evidra-dropzone ${isDraggingFile ? "is-dragging" : ""}`} onDragOver={handleFileDragOver} onDragLeave={handleFileDragLeave} onDrop={handleFileDrop}><UploadCloud aria-hidden="true" /><h2 id="evidra-upload-title">拖入文章文件，或选择文件上传</h2><p>支持 PDF、DOCX、Markdown、TXT 格式</p><label className="evidra-primary-button" htmlFor="evidra-file-input">选择文件 <ChevronRight aria-hidden="true" /></label><input id="evidra-file-input" type="file" accept=".pdf,.docx,.md,.markdown,.txt" onChange={(event) => void handleFilePick(event.target.files?.[0])} /><small>或直接拖拽文件到此处</small>{fileMessage ? <p className="evidra-file-message" role="status">{fileMessage}</p> : null}</div> : null}
                {inputMode === "paste" ? (
                  <div className="evidra-paste-panel">
                    <div className="evidra-project-context">
                      <div><span>审查项目</span><strong>{selectedProject?.name ?? "尚未选择项目"}</strong></div>
                      {projects.length > 0 ? <div className="evidra-project-switcher">{projects.map((project) => <button type="button" key={project.id} className={selectedId === project.id ? "is-selected" : ""} onClick={() => setSelectedId(project.id)}>{project.name}</button>)}</div> : null}
                    </div>
                    {!selectedProject ? (
                      <form className="evidra-create-project" onSubmit={handleCreate}>
                        <label htmlFor="commercial-project-name">先创建一个审查项目</label>
                        <div><input id="commercial-project-name" value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="例如：个人品牌文章审查" maxLength={120} required disabled={creating || state === "loading"} /><button type="submit" disabled={creating || !projectName.trim() || state === "loading"}><Plus aria-hidden="true" />{creating ? "创建中" : "创建项目"}</button></div>
                      </form>
                    ) : (
                      <form className="commercial-analysis-form evidra-analysis-form" onSubmit={handleAnalyze}>
                        <label htmlFor="commercial-analysis-title">文章标题</label>
                        <input id="commercial-analysis-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={240} placeholder="输入文章标题" required disabled={runState === "loading" || runState === "polling"} />
                        <label htmlFor="commercial-analysis-content">正文内容</label>
                        <textarea id="commercial-analysis-content" value={content} onChange={(event) => setContent(event.target.value)} maxLength={500_000} rows={8} placeholder="粘贴需要审查的正文…" required disabled={runState === "loading" || runState === "polling"} />
                        <button type="submit" className={runState === "loading" || runState === "polling" ? "is-loading" : ""} aria-busy={runState === "loading" || runState === "polling"} disabled={quotaFull || !title.trim() || !content.trim() || runState === "loading" || runState === "polling"}>{runState === "loading" || runState === "polling" ? <LoaderCircle aria-hidden="true" /> : result ? <RotateCcw aria-hidden="true" /> : <Sparkles aria-hidden="true" />}{runState === "loading" ? "提交中" : runState === "polling" ? "分析中" : result ? "重新分析" : "开始分析"}</button>
                        {quotaFull ? <p className="commercial-form-hint">当前工作区没有可用审查次数；项目仍可创建，获得服务端确认的额度后即可提交审查。</p> : null}
                        {result ? <p className="commercial-form-hint">修改正文后重新分析，可对比本次结果与上一次报告的变化。</p> : null}
                      </form>
                    )}
                    {selectedProject && runState === "error" ? <section className="commercial-dashboard-alert" role="alert"><span className="commercial-run-error">{runError}</span>{runErrorCode === "UNAUTHENTICATED" ? <Link href="/sign-in?redirect_url=%2Fdashboard">重新登录</Link> : null}{runErrorAction ? <button type="button" onClick={retryAnalysis}>{runErrorAction === "refresh-run" ? "刷新状态" : runErrorAction === "refresh-result" ? "重新读取报告" : "重试分析"}</button> : null}</section> : null}
                    {run && (runState === "polling" || run.status === "queued" || run.status === "running") ? <div className="commercial-detail-status" role="status" aria-live="polite"><span className="commercial-status-dot" />{run.status === "queued" ? "排队中" : "正在分析"}<button type="button" onClick={() => void refreshRun(run.id)}><RefreshCw aria-hidden="true" />刷新状态</button>{run.status === "queued" ? <button type="button" onClick={() => void cancelRun(run)} disabled={cancellingRunId === run.id}>{cancellingRunId === run.id ? "取消中" : "取消本次分析"}</button> : null}</div> : null}
                    {result ? <AnalysisResultView result={result} patchCopied={patchCopied} patchAdopted={patchAdopted} onCopyPatch={() => void copyPatch(result.analysis.patch.markdown)} onAdoptPatch={() => setPatchAdopted(true)} onEditContent={() => { setInputMode("paste"); focusAnalysisEditor(); }} onRecheck={() => void handleAnalyze({ preventDefault() {} } as FormEvent<HTMLFormElement>)} /> : null}
                    {baselineResult && result ? <section className="commercial-recheck-summary" id="recheck" aria-labelledby="commercial-recheck-summary-title"><div><p className="commercial-eyebrow">修改后复查</p><h3 id="commercial-recheck-summary-title">复查结果</h3></div><div className="commercial-recheck-score"><span>评分变化</span><strong className={result.score >= baselineResult.score ? "is-positive" : "is-negative"}>{result.score - baselineResult.score >= 0 ? "+" : ""}{result.score - baselineResult.score}</strong><small>{baselineResult.score} → {result.score}</small></div><p>{result.score >= baselineResult.score ? "修改后的内容可信度有所提升，建议继续核对新增事实依据。" : "修改后评分下降，建议回到正文检查是否引入了新的事实缺口。"}</p></section> : null}
                  </div>
                ) : null}
                <div className="evidra-capability-row"><div><WandSparkles aria-hidden="true" /><strong>智能解析结构</strong><small>自动提取标题、段落、引用</small></div><div><ClipboardCheck aria-hidden="true" /><strong>识别事实依据</strong><small>定位事实陈述与数据来源</small></div><div><ShieldAlert aria-hidden="true" /><strong>评估可信风险</strong><small>多维度分析内容可信度</small></div></div>
              </section>

              {selectedProject ? <section className="commercial-run-history" id="history" aria-labelledby="commercial-run-history-title">
                <div className="commercial-history-heading"><h3 id="commercial-run-history-title">最近运行</h3><span>最多显示 20 条</span></div>
                {selectedHistory.length === 0 ? <p className="commercial-detail-meta">该项目还没有可验证的运行记录。</p> : <ul>{selectedHistory.map((historyRun) => {
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
                })}</ul>}
              </section> : null}

              <section className="evidra-recent-card" id="drafts" aria-labelledby="evidra-recent-title"><div className="evidra-section-heading"><h2 id="evidra-recent-title">最近使用</h2><a href="#drafts">查看全部 <ChevronRight aria-hidden="true" /></a></div>{projects.length ? <ul>{projects.slice(0, 3).map((project) => <li key={project.id}><span className="evidra-file-icon"><FileText aria-hidden="true" /></span><span><strong>{project.name}</strong><small>内容项目 · 创建于 {formatDate(project.createdAt)}</small></span><button type="button" onClick={() => { setSelectedId(project.id); setInputMode("paste"); focusAnalysisEditor(); }}>继续审查 <ChevronRight aria-hidden="true" /></button></li>)}</ul> : <div className="evidra-empty-inline"><FileText aria-hidden="true" /><span>还没有使用记录，上传或粘贴一篇内容后会显示在这里。</span></div>}</section>
            </div>

            <aside className="evidra-home-secondary">
              <section className="evidra-guide-card" aria-labelledby="evidra-guide-title"><h2 id="evidra-guide-title">快速开始指南</h2><ol><li><b>01</b><div><strong>上传或粘贴内容</strong><span>支持多种文档格式或直接粘贴</span></div></li><li><b>02</b><div><strong>AI 分析审查</strong><span>多维度识别风险与可信度问题</span></div></li><li><b>03</b><div><strong>获取审查报告</strong><span>查看问题诊断与优化建议</span></div></li><li><b>04</b><div><strong>优化与验证</strong><span>应用建议并重新验证效果</span></div></li></ol></section>
              <section className="evidra-report-card" id="report" aria-labelledby="evidra-report-title"><div className="evidra-section-heading"><h2 id="evidra-report-title">最近审查报告</h2><a href="#report">查看全部 <ChevronRight aria-hidden="true" /></a></div>{result ? <><div className="evidra-report-score"><strong>{result.score}</strong><span>/100</span><em>{result.score >= 80 ? "低风险" : result.score >= 60 ? "中风险" : "高风险"}</em></div><p className="evidra-report-name">{title || "当前审查内容"}</p><small>审查完成 · {new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date())}</small><ul>{[["事实完整度", 68], ["来源透明度", 76], ["结构清晰度", 82], ["可验证性", 62]].map(([label, value]) => <li key={label as string}><span>{label}</span><strong>{value}<ChevronRight aria-hidden="true" /></strong></li>)}</ul><button type="button" onClick={() => document.getElementById("report")?.scrollIntoView({ behavior: "smooth" })}>查看完整报告 <ChevronRight aria-hidden="true" /></button></> : <div className="evidra-empty-report"><BarChart3 aria-hidden="true" /><p>完成一次审查后，评分与四项指标会显示在这里。</p><button type="button" onClick={() => { setInputMode("paste"); focusAnalysisEditor(); }}>开始第一次审查</button></div>}</section>
            </aside>
          </div>

          <footer className="evidra-home-footer"><span><ShieldAlert aria-hidden="true" />你的内容仅用于审查分析，我们不会用于模型训练或其他用途。</span><span>Evidra v1.0.0 · <b>服务正常</b></span></footer>
      {!betaMode ? <div className="commercial-secondary-tools">
        <details className="commercial-billing-panel commercial-settings-collapsed" aria-labelledby="commercial-billing-title">
          <summary><span><Settings2 aria-hidden="true" />额度与设置</span><small>面试演示模式下默认折叠</small></summary>
          <div className="commercial-billing-panel-body" aria-busy={state === "loading" || checkouting !== null}>
            <div className="commercial-billing-summary">
              <div><p className="commercial-eyebrow">额度概览</p><h2 id="commercial-billing-title">{betaMode ? "邀请制 Beta 额度" : "套餐与共享额度"}</h2></div>
              <div className="commercial-billing-status"><strong>{betaMode ? betaAccessActive ? "Beta 授权有效" : "等待 Beta 授权" : subscriptionLabel(subscription)}</strong><span>{usage ? `已用 ${usage.consumed} / ${usage.limit} 次审查` : "额度待确认"}</span></div>
            </div>
            {billingError ? <p className="commercial-billing-error" role="alert">{billingError}</p> : null}
            {quotaFull ? <p className="commercial-billing-error">{betaMode ? "本次 Beta 授权额度已用完。" : plansError ? "当前工作区没有可用审查次数，支付入口尚未配置，暂不能购买。" : "当前工作区共享额度已用完，请选择可用套餐或等待支付状态更新。"}</p> : null}
            <p className="commercial-billing-muted">{betaMode ? "这是邀请制免费 Beta。额度由服务端授权并记录，授权到期后自动失效；不会创建支付订单。" : "面向 B2B SaaS 内容、增长与品牌团队；实际套餐名称、价格与额度以服务端当前配置为准。"}</p>
            {betaMode && !betaAccessActive ? <div className="commercial-beta-grant-panel"><button type="button" onClick={() => void handleBetaGrant()} disabled={betaGrantLoading}>{betaGrantLoading ? "正在发放 Beta 额度" : "发放我的 Beta 额度"}</button>{betaGrantMessage ? <span role="status">{betaGrantMessage}</span> : null}</div> : null}
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
              <button type="button" className="commercial-portal-button" onClick={() => void handlePortal()} disabled={portalLoading || checkouting !== null}>{portalLoading ? "打开中" : "管理订阅"}</button>
            ) : null}
          </div>
        </details>
        <AlipayOperatorPanel />
        <CommercialRunRecoveryPanel />
      </div> : null}
      <nav className="commercial-legal-links" aria-label="商业支持与法律"><Link href="/terms">服务条款</Link><Link href="/privacy">隐私说明</Link><Link href="/support">支持与联系</Link></nav>
        </div>
      </section>
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

function AnalysisResultView({ result, patchCopied, patchAdopted, onCopyPatch, onAdoptPatch, onEditContent, onRecheck }: { result: CommercialAnalysisResult; patchCopied: boolean; patchAdopted: boolean; onCopyPatch: () => void; onAdoptPatch: () => void; onEditContent: () => void; onRecheck: () => void }) {
  const [riskFilter, setRiskFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [expandedRiskId, setExpandedRiskId] = useState<string | null>(null);
  const scoreLabel = result.score >= 80 ? "发布准备充分" : result.score >= 60 ? "建议补充后发布" : "建议优先复核";
  const issueLabel = result.diagnostics.issueCount ? `${result.diagnostics.issueCount} 项待处理` : "未发现待处理项";
  const issueDescription = result.diagnostics.issueCount ? "需要人工判断" : "可进入人工确认";
  const sourceLabel = result.source === "model" ? "模型诊断" : "结构化诊断";
  const issueCount = result.diagnostics.issueCount;
  const riskItems = result.analysis.diagnostics
    .map((diagnostic, index) => {
      const evidenceStatus = diagnostic.evidenceStatus ?? (index === 0 ? "missing" : "invalid");
      const missingInfo = Array.isArray(diagnostic.missingInfo) ? diagnostic.missingInfo : [];
      const evidence = Array.isArray(diagnostic.evidence) ? diagnostic.evidence : [];
      return {
        id: `${result.contentDigest}-${index}`,
        level: diagnostic.riskLevel ?? (index === 0 ? "high" : index % 2 === 0 ? "medium" : "low"),
        label: diagnostic.question || `第 ${index + 1} 项读者问题`,
        detail: evidenceStatus === "invalid"
          ? "已有引用无法支持结论，需要重新核对"
          : missingInfo[0] || diagnostic.recommendation || "建议补充范围、来源或适用条件",
        evidence,
        missingInfo,
        recommendation: diagnostic.recommendation || "回到正文补充可核验依据。",
        evidenceStatus,
      };
    })
    .filter((item) => item.evidenceStatus !== "valid");
  const visibleRiskItems = riskItems.filter((item) => riskFilter === "all" || item.level === riskFilter);

  return <section className="commercial-analysis-result" aria-labelledby="commercial-analysis-result-title">
    <header className="commercial-result-header">
      <div>
        <p className="commercial-eyebrow">审查报告</p>
        <h3 id="commercial-analysis-result-title">分析结果</h3>
        <p className="commercial-result-summary">先处理高风险信息缺口，再决定是否进入发布流程。</p>
      </div>
      <span className={`commercial-result-source is-${result.source}`}>{sourceLabel}</span>
    </header>

    <div className="commercial-result-next-actions" id="report-actions" aria-label="报告后续操作">
      <div><strong>{patchAdopted ? "修改清单已准备" : "下一步：处理修改建议"}</strong><span>{patchAdopted ? "完成正文修改后，重新审查即可对比前后变化。" : "先复制或加入清单，再回到正文完成人工修改。"}</span></div>
      <div className="commercial-result-next-action-buttons">
        <button type="button" onClick={onEditContent}><FileText aria-hidden="true" />修改正文</button>
        <button type="button" onClick={onRecheck}><RefreshCw aria-hidden="true" />重新审查</button>
      </div>
    </div>

    <div className="commercial-result-overview">
      <div className="commercial-score-card">
        <span>可信度评分</span>
        <strong>总分 {result.score}</strong>
        <small>{scoreLabel}</small>
      </div>
      <ul className="commercial-result-signals" aria-label="报告摘要">
        <li><FileSearch aria-hidden="true" /><span><strong>{result.analysis.questions.questions.length} 个</strong>读者关键问题</span></li>
        <li><ClipboardCheck aria-hidden="true" /><span><strong>{issueLabel}</strong>{issueDescription}</span></li>
        <li><Lightbulb aria-hidden="true" /><span><strong>Patch 已生成</strong>可作为编辑提纲</span></li>
      </ul>
    </div>

    <section className="evidence-risk-summary" aria-labelledby="evidence-risk-summary-title">
      <div className="evidence-risk-summary-heading">
        <div><p className="commercial-eyebrow">Evidence map</p><h4 id="evidence-risk-summary-title">风险与证据缺口</h4></div>
        <span className={`evidence-risk-score evidence-risk-score-${result.score >= 80 ? "low" : result.score >= 60 ? "medium" : "high"}`}>{result.score >= 80 ? "低阻塞" : result.score >= 60 ? "需补证据" : "高风险"}</span>
      </div>
      <div className="evidence-risk-filters" role="toolbar" aria-label="风险筛选">
        {(["all", "high", "medium", "low"] as const).map((filter) => <button key={filter} type="button" className={riskFilter === filter ? "is-active" : ""} onClick={() => setRiskFilter(filter)}>{filter === "all" ? "全部" : filter === "high" ? "高风险" : filter === "medium" ? "中风险" : "低风险"}<span>{filter === "all" ? issueCount : riskItems.filter((item) => item.level === filter).length}</span></button>)}
      </div>
      {visibleRiskItems.length ? <ul className="evidence-risk-list">{visibleRiskItems.map((item) => {
        const expanded = expandedRiskId === item.id;
        const detailId = `evidence-risk-detail-${item.id}`;
        return <li key={item.id} className={`is-${item.level} ${expanded ? "is-expanded" : ""}`}>
          <span className="evidence-risk-marker" aria-hidden="true" />
          <div><strong>{item.label}</strong><small>{item.detail}</small></div>
          <button
            type="button"
            className="evidence-risk-open"
            aria-expanded={expanded}
            aria-controls={detailId}
            onClick={() => setExpandedRiskId((current) => current === item.id ? null : item.id)}
          >{expanded ? "收起证据" : "查看证据"} <span aria-hidden="true">{expanded ? "↙" : "↗"}</span></button>
          {expanded ? <div id={detailId} className="evidence-risk-detail">
            <div><span>证据状态</span><strong>{item.evidence.length ? "已有逐字引用" : "缺少逐字引用"}</strong></div>
            <div><span>原文依据</span>{item.evidence.length ? <ul>{item.evidence.map((evidence) => <li key={`${evidence.paragraphId}-${evidence.quote}`}><b>{evidence.paragraphId}</b><p>“{evidence.quote}”</p></li>)}</ul> : <p>当前正文没有可直接核验的依据。</p>}</div>
            <div><span>下一动作</span><p>{item.missingInfo[0] || item.recommendation}</p></div>
          </div> : null}
        </li>;
      })}</ul> : <div className="evidence-risk-clear"><CheckCircle2 aria-hidden="true" /><span>当前筛选没有待处理问题，仍建议人工确认事实时效。</span></div>}
    </section>

    <details className="commercial-result-section" open>
      <summary><span>读者问题</span><small>{result.analysis.questions.questions.length} 个待验证问题</small></summary>
      <ol>{result.analysis.questions.questions.map((question) => <li key={question}>{question}</li>)}</ol>
    </details>

    <section className="commercial-result-section commercial-result-diagnosis" aria-labelledby="commercial-result-diagnosis-title">
      <div className="commercial-result-section-heading">
        <h4 id="commercial-result-diagnosis-title">诊断结论</h4>
        <CheckCircle2 aria-hidden="true" />
      </div>
      <p>{result.diagnostics.issueCount ? `发现 ${result.diagnostics.issueCount} 项需要关注的问题。请核对原文是否能直接回答上述读者问题，并补充可追溯的事实依据。` : "当前未发现需要关注的问题。发布前仍建议由作者确认事实时效和适用范围。"}</p>
    </section>

    <details className="commercial-result-section commercial-result-patch" id="patch" open>
      <summary><span>Patch 建议</span><small>仅提供编辑方向，不会自动改写原文</small></summary>
      <div className="commercial-patch-actions"><button type="button" onClick={onCopyPatch}><ClipboardCopy aria-hidden="true" />{patchCopied ? "已复制" : "复制 Patch"}</button><button type="button" className={patchAdopted ? "is-adopted" : ""} onClick={onAdoptPatch}><ListPlus aria-hidden="true" />{patchAdopted ? "已加入修改清单" : "加入修改清单"}</button></div>
      <pre>{result.analysis.patch.markdown}</pre>
    </details>
  </section>;
}
