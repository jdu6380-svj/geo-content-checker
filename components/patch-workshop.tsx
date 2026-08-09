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
} from "@/lib/client/geo-api";
import type { DiagnosticsState } from "@/lib/client/report-state";
import type {
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
  onBackToEditor: () => void;
  onOpenOverview: () => void;
  onOpenRecheck: () => void;
};

type PatchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: GeneratePatchesResponse }
  | { status: "error"; error: string };

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

export function PatchWorkshop({
  title,
  paragraphs,
  diagnostics,
  runId,
  analysisSignal,
  onBackToEditor,
  onOpenOverview,
  onOpenRecheck,
}: PatchWorkshopProps) {
  const [activeMode, setActiveMode] = useState<PatchMode>("advice");
  const [patches, setPatches] = useState<Record<PatchMode, PatchState>>(initialPatchStates);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copying" | "copied" | "manual">("idle");
  const [appliedActionIds, setAppliedActionIds] = useState<Set<string>>(() => new Set());
  const generateButtonRef = useRef<HTMLButtonElement>(null);
  const manualCopyRef = useRef<HTMLTextAreaElement>(null);
  const mountedRef = useRef(true);
  const patchRequestControllerRef = useRef<AbortController | null>(null);
  const patchRequestIdRef = useRef(0);
  const activePatch = patches[activeMode];
  const diagnosticResults = Object.values(diagnostics).flatMap((item) => item.data ? [item.data] : []);
  const canGenerate = paragraphs.length > 0 && diagnosticResults.length > 0;
  const priorityDiagnostic = diagnosticResults.find(
    (item) => item.riskLevel === "high" || item.evidenceStatus !== "valid",
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
    setPatches((current) => ({ ...current, [mode]: next }));
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
    setAppliedActionIds(new Set());
    if (runId) void postGeoBetaEvent({ event: "patch_requested", runId });

    try {
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
      if (runId && !requestController.signal.aborted) void postGeoBetaEvent({ event: "patch_generated", runId });
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
  const appliedVisibleCount = visibleActions.filter((action) => appliedActionIds.has(action.id)).length;

  function applyPatch(actionId: string) {
    setAppliedActionIds((current) => {
      if (current.has(actionId)) return current;
      const next = new Set(current);
      next.add(actionId);
      return next;
    });
  }

  return (
    <section id="patch-workshop" className="phase2-patch-page section-anchor" aria-busy={activePatch.status === "loading"}>
      <header className="phase2-subpage-header">
        <div>
          <p className="phase2-breadcrumb">我的审查 <span>/</span> Report Overview <span>/</span> Patch</p>
          <h1>优化建议 Patch</h1>
          <p>基于已识别的可信度问题，逐项审阅可应用的编辑建议。</p>
        </div>
        <div className="phase2-subpage-actions">
          <span>已完成 {activePatch.status === "success" ? Math.min(activePatch.data.actions.length, 3) : Math.min(diagnosticResults.length, 3)} 条修改建议</span>
          <button type="button" onClick={onOpenOverview}><ArrowLeft aria-hidden="true" />返回报告概览</button>
        </div>
      </header>

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
            <p>修改材料只会使用已有诊断与 Evidence，不创建超出报告的数据。</p>
          </div>
        </div>
      ) : null}

      {canGenerate ? (
        <div className="phase2-patch-layout">
          <section className="phase2-patch-original" aria-labelledby="patch-original-heading">
            <header>
              <div>
                <h2 id="patch-original-heading">Original</h2>
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
            <footer>原文保持不变，应用建议前需人工确认。</footer>
          </section>

          <section className="phase2-patch-suggestions" aria-labelledby="patch-suggestion-heading">
            <header>
              <div>
                <h2 id="patch-suggestion-heading">Suggested Patch</h2>
                <p>修改建议</p>
              </div>
            </header>
            <p className="phase2-patch-guidance">仅显示必要修改，不改变文章原意。</p>
            <div className="phase2-patch-suggestion-body">
              {activePatch.status === "success" ? (
                <>
                  <div className="phase2-patch-card-list">
                    {visibleActions.map((action, index) => {
                      const presentation = actionPresentation(action);
                      const applied = appliedActionIds.has(action.id);
                      return (
                        <article
                          key={action.id}
                          className={`${index === 2 ? "is-danger" : "is-warning"} ${index === 0 ? "is-primary" : "is-compact"} ${applied ? "is-applied" : ""}`}
                        >
                          <span>{applied ? "已应用" : index === 0 ? "待应用" : index === 1 ? "注意" : "高风险"}</span>
                          <dl>
                            <div><dt>问题</dt><dd>{presentation.title}</dd></div>
                            <div><dt>建议</dt><dd>{presentation.body}</dd></div>
                            {index === 0 ? <div><dt>修改方向</dt><dd>{presentation.purpose}</dd></div> : null}
                            <div><dt>依据</dt><dd>{presentation.source}</dd></div>
                          </dl>
                          <div className="phase2-patch-card-actions">
                            <button type="button" onClick={() => applyPatch(action.id)} disabled={applied}>
                              {applied ? <Check aria-hidden="true" /> : null}
                              {applied ? "已应用" : "应用建议"}
                            </button>
                            <button type="button" disabled>忽略</button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  {appliedVisibleCount ? (
                    <div className="phase3-patch-recheck-bar" role="status" aria-live="polite">
                      <span><Check aria-hidden="true" />已应用 {appliedVisibleCount} 项建议</span>
                      <p>人工确认正文修改后，进入重新验证。</p>
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
                    disabled={activePatch.status === "loading"}
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
                    {copyStatus === "copied" ? "已复制" : "复制全部 Markdown"}
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
                <h3 className="text-sm font-bold">Markdown 文本</h3>
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
                aria-label="可手动复制的 Markdown 文本"
              />
            </div>
      ) : null}
    </section>
  );
}
