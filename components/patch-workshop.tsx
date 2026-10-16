"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Copy,
  FileCheck2,
  FilePenLine,
  RefreshCw,
  TextSelect,
} from "lucide-react";

import {
  createGeoAbortError,
  isGeoAbortError,
  postGeoBetaEvent,
  postGeoJson,
  setGeoAnalysisToken,
} from "@/lib/client/geo-api";
import type { PatchChecklistItem } from "@/lib/client/patch-checklist";
import { createPatchSourceSignature, filterPatchChecklistForSource, shouldAdoptExternalPatchState } from "@/lib/client/patch-state";
import {
  getReportIssueStatus,
  type ReportIssueStatus,
} from "@/lib/client/report-comparison";
import type { DiagnosticsState } from "@/lib/client/report-state";
import type {
  DiagnosticResult,
  GeneratePatchesResponse,
  Paragraph,
  PatchAction,
  PatchMode,
} from "@/lib/schemas/geo";

type PatchWorkshopProps = {
  title: string;
  paragraphs: Paragraph[];
  diagnostics: DiagnosticsState;
  runId: string | null;
  analysisSignal?: AbortSignal;
  checklistItems: PatchChecklistItem[];
  onAddChecklistItem: (item: PatchChecklistItem) => void;
  onUpdateChecklistItem: (id: string, decision: "applied" | "skipped") => void;
  onBackToEditor: () => void;
  onOpenOverview: () => void;
  onOpenRecheck: () => void;
  sourceHash?: string | null;
  initialPatches?: Partial<Record<PatchMode, PatchState>>;
  onPatchStateChange?: (mode: PatchMode, state: PatchState) => void;
};

export type PatchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: GeneratePatchesResponse }
  | { status: "error"; error: string };

const PATCH_STATUS_META: Record<ReportIssueStatus, { label: string; className: string }> = {
  high: { label: "高风险", className: "is-danger" },
  attention: { label: "注意", className: "is-warning" },
  passed: { label: "已通过", className: "is-success" },
};

function initialPatchStates(): Record<PatchMode, PatchState> {
  return {
    advice: { status: "idle" },
    content_draft: { status: "idle" },
  };
}

async function readError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { message?: unknown };
    return typeof payload.message === "string" ? payload.message : "补丁生成失败，请稍后重试。";
  } catch {
    return "补丁生成失败，请稍后重试。";
  }
}

function copyWithSelection(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.inset = "0 auto auto -9999px";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } finally {
    textarea.remove();
  }
}

async function copyWithClipboard(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");

  await new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error("Clipboard write timed out")), 1_500);

    navigator.clipboard.writeText(text).then(
      () => {
        window.clearTimeout(timeoutId);
        resolve();
      },
      (error: unknown) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

function actionPresentation(action: PatchAction) {
  if (action.type === "author_evidence") {
    return {
      eyebrow: "证据补充",
      title: action.field,
      body: action.reason,
      sourceLabel: "来源问题",
      source: action.relatedQuestion ?? "诊断指出关键事实仍缺少可核验依据",
      purpose: "补齐支撑核心结论的事实、来源或适用边界。",
      decision: "需要人工确认事实、来源与适用边界",
      accent: "patch-action-evidence",
      sourceClassName: "status-warning",
    };
  }
  if (action.type === "structure_change") {
    return {
      eyebrow: "结构调整",
      title: action.title,
      body: action.instruction,
      sourceLabel: "作用段落",
      source: action.targetParagraphIds.join(", "),
      purpose: "降低读者定位步骤、结论与适用边界的成本。",
      decision: "需要人工判断结构调整是否改变原意",
      accent: "patch-action-structure",
      sourceClassName: "status-secondary",
    };
  }
  if (action.type === "faq") {
    return {
      eyebrow: "FAQ 参考材料",
      title: action.question,
      body: action.answer,
      sourceLabel: "使用证据",
      source: `${action.evidence.paragraphId} · “${action.evidence.quote}”`,
      purpose: "把已有原文事实整理为可核对的问答表达。",
      decision: "核对问答是否完整表达原文边界",
      accent: "patch-action-faq",
      sourceClassName: "status-success",
    };
  }
  return {
    eyebrow: "事实卡片参考",
    title: action.label,
    body: action.value,
    sourceLabel: "使用证据",
    source: `${action.evidence.paragraphId} · “${action.evidence.quote}”`,
    purpose: "把已有原文事实整理为可复核的结构化材料。",
    decision: "核对事实卡片是否脱离上下文或扩大结论",
    accent: "patch-action-fact",
    sourceClassName: "status-info",
  };
}

function findActionDiagnostic(
  action: PatchAction,
  diagnostics: DiagnosticResult[],
  index: number,
): DiagnosticResult | undefined {
  if (action.type === "author_evidence" && action.relatedQuestion) {
    const related = diagnostics.find((item) => item.question === action.relatedQuestion);
    if (related) return related;
  }

  if (action.type === "structure_change") {
    const related = diagnostics.find((item) => (
      action.title.includes(item.question) ||
      item.evidence.some((evidence) => action.targetParagraphIds.includes(evidence.paragraphId))
    ));
    if (related) return related;
  }

  if (action.type === "faq" || action.type === "fact_card") {
    const related = diagnostics.find((item) => (
      item.evidence.some((evidence) => evidence.paragraphId === action.evidence.paragraphId)
    ));
    if (related) return related;
  }

  return diagnostics[index] ?? diagnostics[0];
}

export function PatchWorkshop({
  title,
  paragraphs,
  diagnostics,
  runId,
  analysisSignal,
  checklistItems,
  onAddChecklistItem,
  onUpdateChecklistItem,
  onBackToEditor,
  onOpenOverview,
  onOpenRecheck,
  sourceHash,
  initialPatches,
  onPatchStateChange,
}: PatchWorkshopProps) {
  const [activeMode, setActiveMode] = useState<PatchMode>("advice");
  const [patches, setPatches] = useState<Record<PatchMode, PatchState>>(() => ({
    ...initialPatchStates(),
    ...initialPatches,
  }));
  const lastInitialPatchesSignatureRef = useRef(JSON.stringify(initialPatches ?? {}));
  const patchSourceRef = useRef(createPatchSourceSignature({ sourceHash, title, paragraphs }));
  const userEditedPatchRef = useRef(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copying" | "copied" | "manual">("idle");
  const generateButtonRef = useRef<HTMLButtonElement>(null);
  const manualCopyRef = useRef<HTMLTextAreaElement>(null);
  const mountedRef = useRef(true);
  const patchRequestControllerRef = useRef<AbortController | null>(null);
  const patchRequestIdRef = useRef(0);
  const restoredPatchSessionRef = useRef<{ runId: string } | null>(null);
  const activePatch = patches[activeMode];
  const currentChecklistItems = filterPatchChecklistForSource(checklistItems, sourceHash);
  const checklistItemIds = new Set(currentChecklistItems.map((item) => item.id));
  const diagnosticResults = Object.values(diagnostics).flatMap((item) => item.data ? [item.data] : []);
  const canDisplay = paragraphs.length > 0 && diagnosticResults.length > 0;
  // A restored report has no live analysis run id, but it still contains the
  // paragraphs and diagnostics required to generate patch advice.
  const canGenerate = canDisplay;
  const priorityDiagnostic = diagnosticResults.find(
    (item) => getReportIssueStatus(item) !== "passed",
  ) ?? diagnosticResults[0];
  const priorityEvidence = priorityDiagnostic?.evidence[0];
  const priorityParagraph = priorityEvidence
    ? paragraphs.find((paragraph) => paragraph.id === priorityEvidence.paragraphId)
    : paragraphs[0];
  const priorityParagraphIndex = priorityParagraph
    ? paragraphs.findIndex((paragraph) => paragraph.id === priorityParagraph.id)
    : 0;
  const previewStart = Math.max(0, priorityParagraphIndex - 1);
  const articlePreview = paragraphs.slice(previewStart, previewStart + 3);

  useEffect(() => {
    const incoming = { ...initialPatchStates(), ...initialPatches };
    const signature = JSON.stringify(incoming);
    const source = createPatchSourceSignature({ sourceHash, title, paragraphs });
    const sourceChanged = source !== patchSourceRef.current;
    if (sourceChanged) {
      patchSourceRef.current = source;
      userEditedPatchRef.current = false;
    }
    if (!shouldAdoptExternalPatchState({
      sourceChanged,
      incomingSignature: signature,
      lastIncomingSignature: lastInitialPatchesSignatureRef.current,
      userEdited: userEditedPatchRef.current,
    })) return;
    lastInitialPatchesSignatureRef.current = signature;
    if (userEditedPatchRef.current) return;
    setPatches((current) => {
      // Parent updates caused by this component's own callback already contain
      // the same state; only merge a genuinely restored external state.
      if (JSON.stringify(current) === signature) return current;
      return incoming;
    });
  }, [initialPatches, paragraphs, sourceHash, title]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      patchRequestControllerRef.current?.abort();
      patchRequestControllerRef.current = null;
    };
  }, []);

  function selectMode(mode: PatchMode) {
    setActiveMode(mode);
    setCopyStatus("idle");
  }

  function setPatchForMode(mode: PatchMode, next: PatchState) {
    userEditedPatchRef.current = true;
    setPatches((current) => ({ ...current, [mode]: next }));
    onPatchStateChange?.(mode, next);
  }

  async function ensurePatchSession(signal: AbortSignal): Promise<string> {
    if (runId) return runId;
    if (restoredPatchSessionRef.current) return restoredPatchSessionRef.current.runId;

    const response = await postGeoJson("/api/analysis-session", {}, {
      includeAnalysisToken: false,
      signal,
    });
    if (!response.ok) throw new Error(await readError(response));
    const session = (await response.json()) as { token?: unknown; runId?: unknown };
    if (typeof session.token !== "string" || typeof session.runId !== "string") {
      throw new Error("分析会话无效，请重新提交。");
    }
    setGeoAnalysisToken(session.token);
    restoredPatchSessionRef.current = { runId: session.runId };
    return session.runId;
  }

  async function generatePatches() {
    if (!canGenerate || activePatch.status === "loading" || analysisSignal?.aborted) return;
    const requestMode = activeMode;
    const requestId = patchRequestIdRef.current + 1;
    patchRequestIdRef.current = requestId;
    patchRequestControllerRef.current?.abort();
    setPatches((current) => {
      const next = { ...current };
      (Object.keys(next) as PatchMode[]).forEach((mode) => {
        if (next[mode].status === "loading") next[mode] = { status: "idle" };
      });
      return next;
    });

    const requestController = new AbortController();
    patchRequestControllerRef.current = requestController;
    const onAnalysisAbort = () => requestController.abort();
    analysisSignal?.addEventListener("abort", onAnalysisAbort, { once: true });

    setPatchForMode(requestMode, { status: "loading" });
    setCopyStatus("idle");

    try {
      const patchRunId = await ensurePatchSession(requestController.signal);
      if (patchRunId) void postGeoBetaEvent({ event: "patch_requested", runId: patchRunId });
      const response = await postGeoJson("/api/generate-patches", {
        title,
        numbered_paragraphs: paragraphs,
        diagnostics: diagnosticResults,
        mode: requestMode,
      }, {
        signal: requestController.signal,
      });
      if (!response.ok) throw new Error(await readError(response));
      if (requestController.signal.aborted) throw createGeoAbortError();
      const data = (await response.json()) as GeneratePatchesResponse;
      if (requestController.signal.aborted || !mountedRef.current || requestId !== patchRequestIdRef.current) {
        throw createGeoAbortError();
      }
      setPatchForMode(requestMode, { status: "success", data });
      if (patchRunId && !requestController.signal.aborted) void postGeoBetaEvent({ event: "patch_generated", runId: patchRunId });
    } catch (requestError) {
      if (!mountedRef.current || requestId !== patchRequestIdRef.current) return;
      if (requestController.signal.aborted || isGeoAbortError(requestError)) {
        setPatchForMode(requestMode, { status: "idle" });
      } else {
        setPatchForMode(requestMode, {
          status: "error",
          error: requestError instanceof Error ? requestError.message : "补丁生成失败，请稍后重试。",
        });
      }
    } finally {
      analysisSignal?.removeEventListener("abort", onAnalysisAbort);
      if (patchRequestControllerRef.current === requestController) {
        patchRequestControllerRef.current = null;
      }
    }
  }

  async function copyMarkdown() {
    if (activePatch.status !== "success") return;
    setCopyStatus("copying");

    try {
      if (!copyWithSelection(activePatch.data.markdown)) {
        await copyWithClipboard(activePatch.data.markdown);
      }
      setCopyStatus("copied");
      if (runId) void postGeoBetaEvent({ event: "patch_copied", runId });
    } catch {
      setCopyStatus("manual");
      window.requestAnimationFrame(() => manualCopyRef.current?.select());
    }
  }

  const modeTitle = activeMode === "advice" ? "修改建议" : "内容参考材料";
  const modeDescription = activeMode === "advice"
    ? "把诊断中的证据缺口和结构问题整理为可执行清单。"
    : "生成基于证据约束的修改参考材料。";
  const visibleActions = activePatch.status === "success" ? activePatch.data.actions.slice(0, 3) : [];
  const appliedVisibleCount = visibleActions.filter((action) => checklistItemIds.has(action.id)).length;

  function applyPatch(action: PatchAction, index: number) {
    if (checklistItemIds.has(action.id)) return;
    const presentation = actionPresentation(action);
    const diagnostic = findActionDiagnostic(action, diagnosticResults, index);
    onAddChecklistItem({
      id: action.id,
      title: presentation.title,
      recommendation: presentation.body,
      location: presentation.source,
      paragraphIds: action.type === "structure_change" ? action.targetParagraphIds : priorityEvidence ? [priorityEvidence.paragraphId] : [],
      decision: "pending",
      status: diagnostic ? getReportIssueStatus(diagnostic) : "attention",
    });
  }

  return (
    <section id="patch-workshop" className="phase2-patch-page section-anchor" aria-busy={activePatch.status === "loading"}>
      <header className="phase2-subpage-header">
        <div>
          <p className="phase2-breadcrumb">我的审查 <span>/</span> 报告概览 <span>/</span> 修改建议</p>
          <h1>优化修改建议</h1>
          <p>基于已识别的可信度问题，逐项审阅可应用的编辑建议。</p>
        </div>
        <div className="phase2-subpage-actions">
          <span>清单 {currentChecklistItems.length} 项 · 待处理 {currentChecklistItems.filter((item) => item.decision !== "applied" && item.decision !== "skipped").length} 项</span>
          <button type="button" onClick={onOpenOverview}><ArrowLeft aria-hidden="true" />返回报告概览</button>
        </div>
      </header>

      {currentChecklistItems.length ? (
        <section className="phase3-patch-checklist" aria-labelledby="patch-checklist-heading">
          <div>
            <p className="data-label">人工决策清单</p>
            <h2 id="patch-checklist-heading">先判断，再改正文</h2>
            <p>建议只负责指出证据缺口；事实、来源和最终表达必须由你确认。</p>
          </div>
          <ul>
            {currentChecklistItems.map((item) => (
              <li key={item.id} className={item.decision === "skipped" ? "is-skipped" : item.decision === "applied" ? "is-applied" : ""}>
                <span>{item.status === "high" ? "高风险" : item.status === "attention" ? "注意" : "已通过"}</span>
                <strong>{item.title}</strong>
                <small>{item.decision === "applied" ? "已处理" : item.decision === "skipped" ? "已跳过" : "待人工处理"}</small>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!paragraphs.length ? (
        <div className="phase2-loading-surface">
          <div>
            <p className="data-label">修改建议暂不可生成</p>
            <h3>当前缓存报告未保留正文</h3>
            <p>返回编辑器恢复文章并重新运行审查后，Evidra 才能依据本次诊断生成修改建议。</p>
          </div>
          <button type="button" onClick={onBackToEditor}>返回编辑器</button>
        </div>
      ) : diagnosticResults.length === 0 ? (
        <div className="phase2-loading-surface">
          <div>
            <p className="data-label">等待诊断结论</p>
            <h3>完成至少一项诊断后生成修改建议</h3>
            <p>修改材料只会使用已有诊断与证据，不创建超出报告的数据。</p>
          </div>
        </div>
      ) : null}

      {canDisplay ? (
        <div className="phase2-patch-layout">
          <section className="phase2-patch-original" aria-labelledby="patch-original-heading">
            <header>
              <div>
                <h2 id="patch-original-heading">原始内容</h2>
                <p>原始内容</p>
              </div>
            </header>
            <div className="phase2-patch-original-body">
              <h3>{title || "未命名内容"}</h3>
              <span>{priorityParagraph?.id || paragraphs[0]?.id || "原文"} · 关键观点</span>
              {articlePreview.map((paragraph) => (
                <div key={paragraph.id}>
                  <p>{paragraph.text}</p>
                  {paragraph.id === priorityParagraph?.id ? (
                    <blockquote>
                      <strong>{priorityEvidence?.quote || priorityDiagnostic?.question || paragraph.text}</strong>
                      <span>{priorityDiagnostic?.evidenceStatus === "valid" ? "需要补充说明" : "缺少来源说明"}</span>
                    </blockquote>
                  ) : null}
                </div>
              ))}
            </div>
            <footer>原文不会被自动改写；点击“编辑正文”后完成修改，再进入重新验证。</footer>
          </section>

          <section className="phase2-patch-suggestions" aria-labelledby="patch-suggestion-heading">
            <header>
              <div>
                <h2 id="patch-suggestion-heading">修改建议</h2>
                <p>修改建议</p>
              </div>
            </header>
            <p className="phase2-patch-guidance">建议仅加入修改清单，不会自动改写正文。</p>
            <div className="phase2-patch-suggestion-body">
              {activePatch.status === "success" ? (
                <>
                  <div className="phase2-patch-card-list">
                    {visibleActions.map((action, index) => {
                      const presentation = actionPresentation(action);
                      const diagnostic = findActionDiagnostic(action, diagnosticResults, index);
                      const status = diagnostic ? getReportIssueStatus(diagnostic) : "attention";
                      const statusPresentation = PATCH_STATUS_META[status];
                      const applied = checklistItemIds.has(action.id);
                      return (
                        <article
                          key={action.id}
                          className={`${statusPresentation.className} ${index === 0 ? "is-primary" : "is-compact"} ${applied ? "is-applied" : ""}`}
                        >
                          <span>{applied ? "已加入清单" : statusPresentation.label}</span>
                          <dl>
                            <div><dt>问题</dt><dd>{presentation.title}</dd></div>
                            <div><dt>建议</dt><dd>{presentation.body}</dd></div>
                            {index === 0 ? <div><dt>修改方向</dt><dd>{presentation.purpose}</dd></div> : null}
                            <div><dt>依据</dt><dd>{presentation.source}</dd></div>
                          </dl>
                          <div className="phase2-patch-card-actions">
                            <button type="button" onClick={() => applyPatch(action, index)} disabled={applied}>
                              {applied ? <Check aria-hidden="true" /> : null}
                              {applied ? "已加入" : "加入修改清单"}
                            </button>
                            {applied ? (
                              <>
                                <button type="button" onClick={() => onUpdateChecklistItem(action.id, "applied")}>标记已处理</button>
                                <button type="button" onClick={() => onUpdateChecklistItem(action.id, "skipped")}>跳过</button>
                                <button type="button" className="phase2-patch-edit" onClick={onBackToEditor}>编辑正文</button>
                              </>
                            ) : null}
                            <button type="button" className="phase2-patch-locate" onClick={onOpenOverview}>查看原文依据</button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  {appliedVisibleCount ? (
                    <div className="phase3-patch-recheck-bar" role="status" aria-live="polite">
                      <span><Check aria-hidden="true" />修改清单已有 {currentChecklistItems.length} 项建议</span>
                      <p>请先人工修改正文，再进入重新验证。</p>
                      <button type="button" onClick={onOpenRecheck}>
                        进入重新验证
                        <ArrowRight aria-hidden="true" />
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <div>
                    <h4>{activePatch.status === "error" ? `${modeTitle}生成失败` : modeTitle}</h4>
                    {activePatch.status === "error" ? (
                      <p role="alert" aria-live="assertive" className="text-[var(--geo-status-danger)]">{activePatch.error}</p>
                    ) : (
                      <p>{activePatch.status === "loading" ? `正在生成${modeTitle}。` : modeDescription}</p>
                    )}
                  </div>
                  <button
                    ref={generateButtonRef}
                    type="button"
                    onClick={generatePatches}
                    disabled={!canGenerate || activePatch.status === "loading"}
                    className="phase2-patch-generate"
                  >
                    {activePatch.status === "error" ? (
                      <RefreshCw aria-hidden="true" className="size-4" />
                    ) : (
                      <FilePenLine aria-hidden="true" className={`size-4 ${activePatch.status === "loading" ? "animate-pulse motion-reduce:animate-none" : ""}`} />
                    )}
                    {activePatch.status === "loading" ? "正在生成" : activePatch.status === "error" ? "重新生成" : `生成${modeTitle}`}
                  </button>
                </>
              )}
              {activePatch.status === "success" ? (
                <div className="phase2-patch-footer-actions">
                  <button type="button" onClick={copyMarkdown} disabled={copyStatus === "copying"}>
                    {copyStatus === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                    {copyStatus === "copied" ? "已复制" : "复制全部文本"}
                  </button>
                  <button type="button" onClick={() => selectMode(activeMode === "advice" ? "content_draft" : "advice")}>
                    <FileCheck2 aria-hidden="true" />{activeMode === "advice" ? "查看内容草稿" : "返回修改建议"}
                  </button>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {activePatch.status === "loading" ? (
        <div className="phase2-patch-loading" role="status" aria-live="polite" aria-label={`正在生成${modeTitle}`}>
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="animate-pulse motion-reduce:animate-none">
              <div className="h-4 w-1/2 rounded bg-[var(--geo-surface-inset)]" />
              <div className="mt-5 h-3 w-full rounded bg-[var(--geo-surface-subtle)]" />
              <div className="mt-3 h-3 w-4/5 rounded bg-[var(--geo-surface-subtle)]" />
            </div>
          ))}
        </div>
      ) : null}

      {activePatch.status === "success" && copyStatus === "manual" ? (
            <div className="phase2-patch-manual-copy">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-bold">可复制文本</h3>
                <button
                  type="button"
                  onClick={() => manualCopyRef.current?.select()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--geo-status-warning-border)] bg-white px-3 text-xs font-semibold text-[var(--geo-amber)]"
                >
                  <TextSelect aria-hidden="true" className="size-3.5" />
                  全选文本
                </button>
              </div>
              <textarea
                ref={manualCopyRef}
                readOnly
                value={activePatch.data.markdown}
                onFocus={(event) => event.currentTarget.select()}
                className="mt-3 h-44 w-full resize-y rounded-lg border border-[var(--geo-status-warning-border)] bg-white p-3 font-mono text-xs leading-6 text-[var(--geo-text-body)] focus-visible:border-[var(--geo-primary)]"
                aria-label="可手动复制的文本"
              />
            </div>
      ) : null}
    </section>
  );
}
