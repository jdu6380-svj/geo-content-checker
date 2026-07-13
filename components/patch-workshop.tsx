"use client";

import { useRef, useState } from "react";

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

export function PatchWorkshop({ title, paragraphs }: PatchWorkshopProps) {
  const [patches, setPatches] = useState<PatchState>({ status: "idle" });
  const [activeTab, setActiveTab] = useState<PatchTab>("faq");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "manual">("idle");
  const manualCopyRef = useRef<HTMLTextAreaElement>(null);

  async function generatePatches() {
    if (!paragraphs.length || patches.status === "loading") return;
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

    try {
      if (!copyWithSelection(patches.data.markdown)) {
        if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
        await navigator.clipboard.writeText(patches.data.markdown);
      }
      setCopyStatus("copied");
    } catch {
      setCopyStatus("manual");
      window.requestAnimationFrame(() => manualCopyRef.current?.select());
    }
  }

  return (
    <section className="mt-9 border-t border-[#dfe4e8] pt-8" aria-live="polite">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">Patch Workshop</p>
          <h2 className="mt-1 text-xl font-bold">内容补丁工坊</h2>
        </div>
        {patches.status === "success" ? (
          <span className="rounded-full border border-[#d8e4e1] bg-white px-3 py-1.5 text-xs text-[#687386]">
            {patches.data.source === "model" ? "AI 模型生成" : "安全降级生成"}
          </span>
        ) : null}
      </div>

      {!paragraphs.length ? (
        <p className="mt-4 border-l-2 border-[#d8e4e1] pl-4 text-sm leading-6 text-[#687386]">
          缓存报告不含正文，请重新运行体检后生成内容补丁。
        </p>
      ) : null}

      {paragraphs.length && patches.status === "idle" ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border border-[#dfe4e8] bg-white p-5">
          <p className="text-sm text-[#687386]">内容只取自原文，生成后仍需人工核对。</p>
          <button
            type="button"
            onClick={generatePatches}
            className="h-10 rounded-lg bg-[#0e766e] px-5 text-sm font-bold text-white hover:bg-[#0a625c]"
          >
            生成内容补丁
          </button>
        </div>
      ) : null}

      {patches.status === "loading" ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2" aria-label="正在生成内容补丁">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="card min-h-[150px] animate-pulse p-5 motion-reduce:animate-none">
              <div className="h-4 w-1/2 rounded bg-[#e5e8ed]" />
              <div className="mt-5 h-3 w-full rounded bg-[#edf0f2]" />
              <div className="mt-3 h-3 w-4/5 rounded bg-[#edf0f2]" />
            </div>
          ))}
        </div>
      ) : null}

      {patches.status === "error" ? (
        <div className="mt-4 border border-[#f0d6d1] bg-[#fff8f6] p-5">
          <p role="alert" className="text-sm text-[#a43e2b]">{patches.error}</p>
          <button
            type="button"
            onClick={generatePatches}
            className="mt-3 h-9 rounded-lg border border-[#d8a99f] bg-white px-4 text-sm font-semibold text-[#a43e2b]"
          >
            重新生成
          </button>
        </div>
      ) : null}

      {patches.status === "success" ? (
        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-lg border border-[#d9dee5] bg-white p-1" aria-label="补丁类型">
              <button
                type="button"
                aria-pressed={activeTab === "faq"}
                onClick={() => setActiveTab("faq")}
                className={`h-8 rounded-md px-4 text-sm font-semibold ${activeTab === "faq" ? "bg-[#e7f4f1] text-[#0e766e]" : "text-[#687386]"}`}
              >
                FAQ
              </button>
              <button
                type="button"
                aria-pressed={activeTab === "facts"}
                onClick={() => setActiveTab("facts")}
                className={`h-8 rounded-md px-4 text-sm font-semibold ${activeTab === "facts" ? "bg-[#e7f4f1] text-[#0e766e]" : "text-[#687386]"}`}
              >
                事实卡片
              </button>
            </div>

            <div className="flex items-center gap-3">
              {copyStatus === "copied" ? <span className="text-xs font-semibold text-[#0e766e]">已复制</span> : null}
              {copyStatus === "manual" ? <span className="text-xs text-[#8a5b12]">请在下方手动复制</span> : null}
              <button
                type="button"
                onClick={copyMarkdown}
                className="h-9 rounded-lg border border-[#b9c9c6] bg-white px-4 text-sm font-semibold text-[#0e766e] hover:bg-[#f3f7f6]"
              >
                复制全部 Markdown
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
                  className="h-8 rounded-lg border border-[#d8bf7b] bg-white px-3 text-xs font-semibold text-[#7a5613]"
                >
                  全选文本
                </button>
              </div>
              <textarea
                ref={manualCopyRef}
                readOnly
                value={patches.data.markdown}
                onFocus={(event) => event.currentTarget.select()}
                className="mt-3 h-44 w-full resize-y rounded-lg border border-[#e2d3aa] bg-white p-3 font-mono text-xs leading-6 text-[#465266]"
                aria-label="可手动复制的 Markdown 文本"
              />
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {activeTab === "faq"
              ? patches.data.faqs.map((faq) => (
                  <article key={`${faq.question}-${faq.evidence.paragraphId}`} className="card p-5">
                    <h3 className="text-sm font-bold leading-6">{faq.question}</h3>
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-[#465266]">{faq.answer}</p>
                    <span className="mt-4 block text-xs font-bold text-[#0e766e]">{faq.evidence.paragraphId}</span>
                  </article>
                ))
              : patches.data.factCards.map((card) => (
                  <article key={`${card.label}-${card.evidence.paragraphId}`} className="card p-5">
                    <span className="text-xs font-bold text-[#0e766e]">{card.label}</span>
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-[#465266]">{card.value}</p>
                    <span className="mt-4 block text-xs font-bold text-[#687386]">{card.evidence.paragraphId}</span>
                  </article>
                ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
