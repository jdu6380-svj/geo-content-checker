"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ClipboardCheck,
  Copy,
  FileCheck2,
  Link2,
  ListChecks,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TextSelect,
  UserRoundCheck,
} from "lucide-react";

import { postGeoBetaEvent, postGeoJson } from "@/lib/client/geo-api";
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
  onBackToEditor: () => void;
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
      eyebrow: "证据缺口",
      title: action.field,
      body: action.reason,
      sourceLabel: "来自诊断",
      source: action.relatedQuestion ?? "需要作者补充事实依据",
      decision: "需要人工确认事实、来源与适用边界",
      accent: "border-t-[#a86313]",
      sourceClassName: "bg-[#fff7e8] text-[#8a5b12]",
    };
  }
  if (action.type === "structure_change") {
    return {
      eyebrow: "结构调整",
      title: action.title,
      body: action.instruction,
      sourceLabel: "作用范围",
      source: action.targetParagraphIds.join(", "),
      decision: "需要人工判断结构调整是否改变原意",
      accent: "border-t-[#5964cf]",
      sourceClassName: "bg-[#eef1ff] text-[#4d58bf]",
    };
  }
  if (action.type === "faq") {
    return {
      eyebrow: "FAQ 草稿",
      title: action.question,
      body: action.answer,
      sourceLabel: "逐字证据",
      source: action.evidence.paragraphId,
      decision: "核对问答是否完整表达原文边界",
      accent: "border-t-[#08766e]",
      sourceClassName: "bg-[#e7f4f1] text-[#0f766e]",
    };
  }
  return {
    eyebrow: "事实卡片草稿",
    title: action.label,
    body: action.value,
    sourceLabel: "逐字证据",
    source: action.evidence.paragraphId,
    decision: "核对事实卡片是否脱离上下文或扩大结论",
    accent: "border-t-[#416b8a]",
    sourceClassName: "bg-[#edf3f7] text-[#416b8a]",
  };
}

export function PatchWorkshop({ title, paragraphs, diagnostics, runId, onBackToEditor }: PatchWorkshopProps) {
  const [activeMode, setActiveMode] = useState<PatchMode>("advice");
  const [patches, setPatches] = useState<Record<PatchMode, PatchState>>(initialPatchStates);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copying" | "copied" | "manual">("idle");
  const generateButtonRef = useRef<HTMLButtonElement>(null);
  const copyButtonRef = useRef<HTMLButtonElement>(null);
  const manualCopyRef = useRef<HTMLTextAreaElement>(null);
  const restoreActionFocusRef = useRef(false);
  const activePatch = patches[activeMode];
  const diagnosticResults = Object.values(diagnostics).flatMap((item) => item.data ? [item.data] : []);
  const canGenerate = paragraphs.length > 0 && diagnosticResults.length > 0;
  const evidenceGapCount = diagnosticResults.filter(
    (item) => item.evidenceStatus !== "valid" || item.missingInfo.length > 0,
  ).length;

  useEffect(() => {
    if (activePatch.status !== "success" || !restoreActionFocusRef.current) return;
    restoreActionFocusRef.current = false;
    copyButtonRef.current?.focus();
  }, [activePatch.status]);

  function selectMode(mode: PatchMode) {
    setActiveMode(mode);
    setCopyStatus("idle");
  }

  function setActivePatch(next: PatchState) {
    setPatches((current) => ({ ...current, [activeMode]: next }));
  }

  async function generatePatches() {
    if (!canGenerate || activePatch.status === "loading") return;
    restoreActionFocusRef.current = document.activeElement === generateButtonRef.current;
    setActivePatch({ status: "loading" });
    setCopyStatus("idle");
    if (runId) void postGeoBetaEvent({ event: "patch_requested", runId });

    try {
      const response = await postGeoJson("/api/generate-patches", {
        title,
        numbered_paragraphs: paragraphs,
        diagnostics: diagnosticResults,
        mode: activeMode,
      });
      if (!response.ok) throw new Error(await readError(response));
      const data = (await response.json()) as GeneratePatchesResponse;
      setActivePatch({ status: "success", data });
      if (runId) void postGeoBetaEvent({ event: "patch_generated", runId });
    } catch (requestError) {
      setActivePatch({
        status: "error",
        error: requestError instanceof Error ? requestError.message : "补丁生成失败，请稍后重试。",
      });
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

  const modeTitle = activeMode === "advice" ? "修改建议" : "内容草稿";
  const modeDescription = activeMode === "advice"
    ? "把诊断中的证据缺口和结构问题整理为可执行清单，最终判断仍由你完成。"
    : "基于已验证的原文证据生成辅助修改材料，不替代完整改稿与事实审核。";

  return (
    <section id="patch-workshop" className="patch-workshop section-anchor min-w-0" aria-busy={activePatch.status === "loading"}>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#dbe2df] pb-4">
        <div>
          <p className="section-kicker">APPLY & RECHECK</p>
          <h2 className="mt-1 text-xl font-bold sm:text-2xl">修改与重新验证</h2>
          <p className="mt-2 text-sm leading-6 text-[#687386]">先理解问题，再生成修改材料；应用后重新分析，确认风险是否真正消除。</p>
        </div>
        {activePatch.status === "success" ? (
          <span className="status-badge border border-[#d8e4e1] bg-white px-3 py-1.5 text-xs text-[#687681]">
            {activePatch.data.source === "model" ? "AI 模型生成" : "安全降级生成"}
          </span>
        ) : null}
      </div>

      <ol className="patch-review-loop mt-4 grid overflow-hidden rounded-lg border border-[#d8e0dd] bg-white sm:grid-cols-3" aria-label="修改与重新验证流程">
        {[
          { label: "发现问题", meta: `${diagnosticResults.length} 项诊断可用`, icon: ListChecks },
          { label: "优化建议", meta: "生成建议或内容草稿", icon: Sparkles },
          { label: "重新验证", meta: "应用修改后再次分析", icon: RotateCcw },
        ].map((step, index) => {
          const Icon = step.icon;
          return (
            <li key={step.label} className="flex min-w-0 items-center gap-3 px-4 py-3.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-md border border-[#d7e5e2] bg-[#eef8f6] text-[#0f766e]">
                <Icon aria-hidden="true" className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#252a31]">{step.label}</span>
                <span className="mt-0.5 block text-xs leading-5 text-[#858c97]">{step.meta}</span>
              </span>
              {index < 2 ? <ArrowRight aria-hidden="true" className="ml-auto hidden size-4 shrink-0 text-[#a0a7b1] sm:block" /> : null}
            </li>
          );
        })}
      </ol>

      <div className="mt-4 inline-flex rounded-lg border border-[#d8e0dd] bg-white p-1" aria-label="补丁模式">
        <button
          type="button"
          aria-pressed={activeMode === "advice"}
          onClick={() => selectMode("advice")}
          className={`h-8 rounded-md px-4 text-sm font-semibold ${activeMode === "advice" ? "bg-[#e4f3f0] text-[#08766e]" : "text-[#687681]"}`}
        >
          修改建议
        </button>
        <button
          type="button"
          aria-pressed={activeMode === "content_draft"}
          onClick={() => selectMode("content_draft")}
          className={`h-8 rounded-md px-4 text-sm font-semibold ${activeMode === "content_draft" ? "bg-[#edf0fb] text-[#4d58bf]" : "text-[#687681]"}`}
        >
          内容草稿
        </button>
      </div>

      <div className="patch-mode-guidance mt-4 grid overflow-hidden rounded-lg border border-[#dfe5e5] bg-white sm:grid-cols-3">
        {(activeMode === "advice"
          ? [
              { icon: Link2, label: "关联诊断", value: `${diagnosticResults.length} 项问题 · ${evidenceGapCount} 项证据或信息缺口` },
              { icon: UserRoundCheck, label: "人工决策", value: "事实补充、来源可靠性与表达边界均需人工确认" },
              { icon: ShieldCheck, label: "能力边界", value: "建议不代表问题已解决，也不保证外部平台结果" },
            ]
          : [
              { icon: FileCheck2, label: "材料用途", value: "用于补充 FAQ 与事实卡片，不是 AI 自动改稿" },
              { icon: Link2, label: "证据约束", value: "每项内容均应回到原文证据和上下文核对" },
              { icon: UserRoundCheck, label: "发布前审核", value: "确认事实、语气、边界与全文衔接后再应用" },
            ]
        ).map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="min-w-0 px-4 py-3.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#4f5864]">
                <Icon aria-hidden="true" className="size-3.5 text-[#0f766e]" />
                {item.label}
              </div>
              <p className="mt-1.5 text-xs leading-5 text-[#7a8490]">{item.value}</p>
            </div>
          );
        })}
      </div>

      {!paragraphs.length ? (
        <p className="mt-4 border-l-2 border-[#d8e4e1] pl-4 text-sm leading-6 text-[#687386]">
          缓存报告不含正文，请重新运行体检后生成内容补丁。
        </p>
      ) : diagnosticResults.length === 0 ? (
        <p className="mt-4 border-l-2 border-[#d8e4e1] pl-4 text-sm leading-6 text-[#687386]">
          至少完成一项诊断后，才能生成可信的修改建议。
        </p>
      ) : null}

      {canGenerate && activePatch.status !== "success" ? (
        <div className={`patch-callout mt-4 grid items-center gap-4 rounded-lg border p-4 sm:grid-cols-[1fr_auto] sm:p-5 ${activePatch.status === "error" ? "border-[#f0d6d1] bg-[#fff8f6]" : "border-[#cdded9] bg-[#eef6f4]"}`}>
          <div>
            <h3 className="text-sm font-bold text-[#24323a]">
              {activePatch.status === "error" ? `${modeTitle}生成失败` : modeTitle}
            </h3>
            {activePatch.status === "error" ? (
              <p role="alert" aria-live="assertive" className="mt-1 text-sm leading-6 text-[#a43e2b]">{activePatch.error}</p>
            ) : (
              <p className="mt-1 text-sm leading-6 text-[#687681]">
                {activePatch.status === "loading" ? `正在生成${modeTitle}。` : modeDescription}
              </p>
            )}
          </div>
          <button
            ref={generateButtonRef}
            type="button"
            onClick={generatePatches}
            disabled={activePatch.status === "loading"}
            className="primary-button h-10 w-full px-5 text-sm font-bold disabled:translate-y-0 disabled:cursor-wait disabled:opacity-65 sm:w-auto"
          >
            {activePatch.status === "error" ? (
              <RefreshCw aria-hidden="true" className="size-4" />
            ) : (
              <Sparkles aria-hidden="true" className={`size-4 ${activePatch.status === "loading" ? "animate-pulse motion-reduce:animate-none" : ""}`} />
            )}
            {activePatch.status === "loading" ? "正在生成" : activePatch.status === "error" ? "重新生成" : `生成${modeTitle}`}
          </button>
        </div>
      ) : null}

      {activePatch.status === "loading" ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2" role="status" aria-live="polite" aria-label={`正在生成${modeTitle}`}>
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="card min-h-[150px] animate-pulse p-5 motion-reduce:animate-none">
              <div className="h-4 w-1/2 rounded bg-[#e5e8ed]" />
              <div className="mt-5 h-3 w-full rounded bg-[#edf0f2]" />
              <div className="mt-3 h-3 w-4/5 rounded bg-[#edf0f2]" />
            </div>
          ))}
        </div>
      ) : null}

      {activePatch.status === "success" ? (
        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e3e7eb] pb-4">
            <div>
              <p className="text-sm font-semibold text-[#252a31]">
                {activeMode === "advice" ? "审查建议清单" : "辅助修改材料"}
              </p>
              <p className="mt-1 text-xs leading-5 text-[#858c97]">
                {activeMode === "advice"
                  ? "逐项确认哪些事实能补充、哪些结构适合调整。"
                  : "复制后在编辑器中人工整合，不要直接替换全文。"}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
            <span role="status" aria-live="polite" className="inline-flex min-h-4 items-center gap-1.5 text-xs">
              {copyStatus === "copying" ? <span className="text-[#687681]">正在复制</span> : null}
              {copyStatus === "copied" ? (
                <>
                  <Check aria-hidden="true" className="size-3.5 text-[#0e766e]" />
                  <span className="font-semibold text-[#0e766e]">已复制</span>
                </>
              ) : null}
              {copyStatus === "manual" ? <span className="text-[#8a5b12]">请在下方手动复制</span> : null}
            </span>
            <button
              ref={copyButtonRef}
              type="button"
              onClick={copyMarkdown}
              disabled={copyStatus === "copying"}
              className="secondary-button h-9 px-4 text-sm font-semibold text-[#08766e] disabled:cursor-wait disabled:opacity-65"
            >
              <Copy aria-hidden="true" className={`size-4 ${copyStatus === "copying" ? "animate-pulse motion-reduce:animate-none" : ""}`} />
              {copyStatus === "copying" ? "正在复制" : "复制全部 Markdown"}
            </button>
            </div>
          </div>

          {copyStatus === "copied" ? (
            <div className="mt-4 flex flex-col gap-3 border-l-[3px] border-[#0f766e] bg-[#eef8f6] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <ClipboardCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[#0f766e]" />
                <div>
                  <p className="text-sm font-semibold text-[#185f59]">材料已复制，下一步回到原文人工应用</p>
                  <p className="mt-1 text-xs leading-5 text-[#587773]">核对事实与表达边界后，再运行完整重新验证；分数不保证提升。</p>
                </div>
              </div>
              <button type="button" onClick={onBackToEditor} className="secondary-button h-9 w-full shrink-0 px-4 text-xs font-semibold sm:w-auto">
                返回编辑器
                <ArrowRight aria-hidden="true" className="size-3.5" />
              </button>
            </div>
          ) : null}

          {copyStatus === "manual" ? (
            <div className="mt-4 border border-[#ead9ab] bg-[#fffaf0] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-bold">Markdown 文本</h3>
                <button
                  type="button"
                  onClick={() => manualCopyRef.current?.select()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#d8bf7b] bg-white px-3 text-xs font-semibold text-[#7a5613]"
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
                className="mt-3 h-44 w-full resize-y rounded-lg border border-[#e2d3aa] bg-white p-3 font-mono text-xs leading-6 text-[#465266] focus-visible:border-[#0f766e] focus-visible:outline-[3px] focus-visible:outline-[#0f766e]/10"
                aria-label="可手动复制的 Markdown 文本"
              />
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {activePatch.data.actions.map((action) => {
              const presentation = actionPresentation(action);
              return (
                <article key={action.id} className={`card border-t-[3px] p-5 ${presentation.accent}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#687681]">{presentation.eyebrow}</span>
                    <span className={`status-badge px-2 py-1 text-[10px] font-semibold ${presentation.sourceClassName}`}>
                      {presentation.sourceLabel}
                    </span>
                  </div>
                  <h3 className="mt-2 text-sm font-bold leading-6">{presentation.title}</h3>
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-[#465266]">{presentation.body}</p>
                  <div className="mt-4 grid gap-2 border-t border-[#edf0f2] pt-3 text-xs leading-5">
                    <p className="break-words text-[#687681]"><span className="font-semibold text-[#4f5864]">{presentation.sourceLabel}：</span>{presentation.source}</p>
                    <p className="flex items-start gap-2 text-[#7a6540]">
                      <UserRoundCheck aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                      <span>{presentation.decision}</span>
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-5 flex flex-col items-start justify-between gap-4 border-t border-[#dbe2df] pt-5 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-sm font-semibold text-[#252a31]">完成修改后，用同一套审查重新验证</h3>
          <p className="mt-1 text-xs leading-5 text-[#737d89]">系统会保留本次结果作为修改前基线；只有真实重跑完成后，才会展示改善、未改善与不可直接对照项。</p>
        </div>
        <button type="button" onClick={onBackToEditor} className="secondary-button h-10 w-full shrink-0 px-4 text-sm font-semibold sm:w-auto">
          <RotateCcw aria-hidden="true" className="size-4" />
          返回编辑并重新验证
        </button>
      </div>
    </section>
  );
}
