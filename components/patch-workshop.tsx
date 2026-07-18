"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, RefreshCw, Sparkles, TextSelect } from "lucide-react";

import { postGeoJson } from "@/lib/client/geo-api";
import type { GeneratePatchesResponse, Paragraph } from "@/lib/schemas/geo";

type PatchWorkshopProps = {
  title: string;
  paragraphs: Paragraph[];
};

type PatchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: GeneratePatchesResponse }
  | { status: "error"; error: string };

type PatchTab = "faq" | "facts";

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

export function PatchWorkshop({ title, paragraphs }: PatchWorkshopProps) {
  const [patches, setPatches] = useState<PatchState>({ status: "idle" });
  const [activeTab, setActiveTab] = useState<PatchTab>("faq");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copying" | "copied" | "manual">("idle");
  const generateButtonRef = useRef<HTMLButtonElement>(null);
  const copyButtonRef = useRef<HTMLButtonElement>(null);
  const manualCopyRef = useRef<HTMLTextAreaElement>(null);
  const restoreActionFocusRef = useRef(false);

  useEffect(() => {
    if (patches.status !== "success" || !restoreActionFocusRef.current) return;
    restoreActionFocusRef.current = false;
    copyButtonRef.current?.focus();
  }, [patches.status]);

  async function generatePatches() {
    if (!paragraphs.length || patches.status === "loading") return;
    restoreActionFocusRef.current = document.activeElement === generateButtonRef.current;
    setPatches({ status: "loading" });
    setCopyStatus("idle");

    try {
      const response = await postGeoJson("/api/generate-patches", {
        title,
        numbered_paragraphs: paragraphs,
      });
      if (!response.ok) throw new Error(await readError(response));
      const data = (await response.json()) as GeneratePatchesResponse;
      setPatches({ status: "success", data });
    } catch (requestError) {
      setPatches({
        status: "error",
        error: requestError instanceof Error ? requestError.message : "补丁生成失败，请稍后重试。",
      });
    }
  }

  async function copyMarkdown() {
    if (patches.status !== "success") return;
    setCopyStatus("copying");

    try {
      if (!copyWithSelection(patches.data.markdown)) {
        await copyWithClipboard(patches.data.markdown);
      }
      setCopyStatus("copied");
    } catch {
      setCopyStatus("manual");
      window.requestAnimationFrame(() => manualCopyRef.current?.select());
    }
  }

  return (
    <section id="patch-workshop" className="patch-workshop section-anchor min-w-0" aria-busy={patches.status === "loading"}>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#dbe2df] pb-4">
        <div>
          <p className="section-kicker">内容优化</p>
          <h2 className="mt-1 text-xl font-bold sm:text-2xl">补丁工坊</h2>
        </div>
        {patches.status === "success" ? (
          <span className="status-badge border border-[#d8e4e1] bg-white px-3 py-1.5 text-xs text-[#687681]">
            {patches.data.source === "model" ? "AI 模型生成" : "安全降级生成"}
          </span>
        ) : null}
      </div>

      {!paragraphs.length ? (
        <p className="mt-4 border-l-2 border-[#d8e4e1] pl-4 text-sm leading-6 text-[#687386]">
          缓存报告不含正文，请重新运行体检后生成内容补丁。
        </p>
      ) : null}

      {paragraphs.length && patches.status !== "success" ? (
        <div className={`patch-callout mt-4 grid items-center gap-4 rounded-lg border p-4 sm:grid-cols-[1fr_auto] sm:p-5 ${patches.status === "error" ? "border-[#f0d6d1] bg-[#fff8f6]" : "border-[#cdded9] bg-[#eef6f4]"}`}>
          <div>
            <h3 className="text-sm font-bold text-[#24323a]">
              {patches.status === "error" ? "内容补丁生成失败" : "FAQ 与事实卡片"}
            </h3>
            {patches.status === "error" ? (
              <p role="alert" aria-live="assertive" className="mt-1 text-sm leading-6 text-[#a43e2b]">{patches.error}</p>
            ) : (
              <p className="mt-1 text-sm leading-6 text-[#687681]">
                {patches.status === "loading" ? "正在从原文整理可执行的内容补丁。" : "内容只取自原文，生成后仍需人工核对。"}
              </p>
            )}
          </div>
          <button
            ref={generateButtonRef}
            type="button"
            onClick={generatePatches}
            disabled={patches.status === "loading"}
            className="primary-button h-10 w-full px-5 text-sm font-bold disabled:translate-y-0 disabled:cursor-wait disabled:opacity-65 sm:w-auto"
          >
            {patches.status === "error" ? (
              <RefreshCw aria-hidden="true" className="size-4" />
            ) : (
              <Sparkles aria-hidden="true" className={`size-4 ${patches.status === "loading" ? "animate-pulse motion-reduce:animate-none" : ""}`} />
            )}
            {patches.status === "loading" ? "正在生成" : patches.status === "error" ? "重新生成" : "生成内容补丁"}
          </button>
        </div>
      ) : null}

      {patches.status === "loading" ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2" role="status" aria-live="polite" aria-label="正在生成内容补丁">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="card min-h-[150px] animate-pulse p-5 motion-reduce:animate-none">
              <div className="h-4 w-1/2 rounded bg-[#e5e8ed]" />
              <div className="mt-5 h-3 w-full rounded bg-[#edf0f2]" />
              <div className="mt-3 h-3 w-4/5 rounded bg-[#edf0f2]" />
            </div>
          ))}
        </div>
      ) : null}

      {patches.status === "success" ? (
        <div className="mt-4">
          <div className="flex flex-col gap-3 min-[560px]:flex-row min-[560px]:items-center min-[560px]:justify-between">
            <div className="inline-flex rounded-lg border border-[#d8e0dd] bg-white p-1" aria-label="补丁类型">
              <button
                type="button"
                aria-pressed={activeTab === "faq"}
                onClick={() => setActiveTab("faq")}
                className={`h-8 rounded-md px-4 text-sm font-semibold ${activeTab === "faq" ? "bg-[#e4f3f0] text-[#08766e]" : "text-[#687681]"}`}
              >
                FAQ
              </button>
              <button
                type="button"
                aria-pressed={activeTab === "facts"}
                onClick={() => setActiveTab("facts")}
                className={`h-8 rounded-md px-4 text-sm font-semibold ${activeTab === "facts" ? "bg-[#e4f3f0] text-[#08766e]" : "text-[#687681]"}`}
              >
                事实卡片
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
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
                className="secondary-button h-9 w-full px-4 text-sm font-semibold text-[#08766e] disabled:cursor-wait disabled:opacity-65 min-[420px]:w-auto"
              >
                <Copy aria-hidden="true" className={`size-4 ${copyStatus === "copying" ? "animate-pulse motion-reduce:animate-none" : ""}`} />
                {copyStatus === "copying" ? "正在复制" : "复制全部 Markdown"}
              </button>
            </div>
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
                value={patches.data.markdown}
                onFocus={(event) => event.currentTarget.select()}
                className="mt-3 h-44 w-full resize-y rounded-lg border border-[#e2d3aa] bg-white p-3 font-mono text-xs leading-6 text-[#465266] focus-visible:border-[#0f766e] focus-visible:outline-[3px] focus-visible:outline-[#0f766e]/10"
                aria-label="可手动复制的 Markdown 文本"
              />
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {activeTab === "faq"
              ? patches.data.faqs.map((faq) => (
                  <article key={`${faq.question}-${faq.evidence.paragraphId}`} className="card border-t-[3px] border-t-[#08766e] p-5">
                    <h3 className="text-sm font-bold leading-6">{faq.question}</h3>
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-[#465266]">{faq.answer}</p>
                    <span className="mt-4 block font-mono text-xs font-bold text-[#08766e]">{faq.evidence.paragraphId}</span>
                  </article>
                ))
              : patches.data.factCards.map((card) => (
                  <article key={`${card.label}-${card.evidence.paragraphId}`} className="card border-t-[3px] border-t-[#416b8a] p-5">
                    <span className="text-xs font-bold text-[#416b8a]">{card.label}</span>
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-[#465266]">{card.value}</p>
                    <span className="mt-4 block font-mono text-xs font-bold text-[#687681]">{card.evidence.paragraphId}</span>
                  </article>
                ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
