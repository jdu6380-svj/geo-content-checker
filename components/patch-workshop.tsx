"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, RefreshCw, Sparkles, TextSelect } from "lucide-react";

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
      eyebrow: "作者补充",
      title: action.field,
      body: action.reason,
      meta: action.relatedQuestion ? `关联问题：${action.relatedQuestion}` : null,
      accent: "border-t-[#a86313]",
    };
  }
  if (action.type === "structure_change") {
    return {
      eyebrow: "结构调整",
      title: action.title,
      body: action.instruction,
      meta: `目标段落：${action.targetParagraphIds.join(", ")}`,
      accent: "border-t-[#5964cf]",
    };
  }
  if (action.type === "faq") {
    return {
      eyebrow: "FAQ 草稿",
      title: action.question,
      body: action.answer,
      meta: `原文证据：${action.evidence.paragraphId}`,
      accent: "border-t-[#08766e]",
    };
  }
  return {
    eyebrow: "事实卡片草稿",
    title: action.label,
    body: action.value,
    meta: `原文证据：${action.evidence.paragraphId}`,
    accent: "border-t-[#416b8a]",
  };
}

export function PatchWorkshop({ title, paragraphs, diagnostics, runId }: PatchWorkshopProps) {
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
    ? "优先整理作者需补充的证据和结构调整，不替你编造事实。"
    : "从原文摘录生成 FAQ 与事实卡片草稿，仍需人工核对。";

  return (
    <section id="patch-workshop" className="patch-workshop section-anchor min-w-0" aria-busy={activePatch.status === "loading"}>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#dbe2df] pb-4">
        <div>
          <p className="section-kicker">内容优化</p>
          <h2 className="mt-1 text-xl font-bold sm:text-2xl">补丁工坊</h2>
        </div>
        {activePatch.status === "success" ? (
          <span className="status-badge border border-[#d8e4e1] bg-white px-3 py-1.5 text-xs text-[#687681]">
            {activePatch.data.source === "model" ? "AI 模型生成" : "安全降级生成"}
          </span>
        ) : null}
      </div>

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
                  <span className="text-xs font-bold text-[#687681]">{presentation.eyebrow}</span>
                  <h3 className="mt-2 text-sm font-bold leading-6">{presentation.title}</h3>
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-[#465266]">{presentation.body}</p>
                  {presentation.meta ? (
                    <span className="mt-4 block break-words font-mono text-xs font-bold text-[#687681]">{presentation.meta}</span>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
