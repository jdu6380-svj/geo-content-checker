"use client";

import type { FormEvent, RefObject } from "react";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  History,
  ListChecks,
  Lock,
  ShieldCheck,
} from "lucide-react";

import { DatePicker } from "@/components/date-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type EditorDraft = {
  title: string;
  content: string;
  publishedAt: string;
};

type EditorFieldErrors = Partial<Record<"title" | "content", string>>;

export type EditorWorkspaceSample = {
  id: string;
  title: string;
  status: string;
  description: string;
  badgeClassName: string;
};

export type EditorWorkspaceDimension = {
  label: string;
  indicatorClassName: string;
};

type EditorWorkspaceProps = {
  draft: EditorDraft;
  contentLength: number;
  maxArticleCharacters: number;
  remaining: number;
  fieldErrors: EditorFieldErrors;
  error: string;
  titleRef: RefObject<HTMLInputElement | null>;
  contentRef: RefObject<HTMLTextAreaElement | null>;
  samples: EditorWorkspaceSample[];
  dimensions: EditorWorkspaceDimension[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onDraftChange: (field: keyof EditorDraft, value: string) => void;
  onLoadSample: (index: number) => void;
};

export function EditorWorkspace({
  draft,
  contentLength,
  maxArticleCharacters,
  remaining,
  fieldErrors,
  error,
  titleRef,
  contentRef,
  samples,
  dimensions,
  onSubmit,
  onDraftChange,
  onLoadSample,
}: EditorWorkspaceProps) {
  const contentText = draft.content ?? "";

  return (
    <section className="editor-workspace min-h-[calc(100vh-var(--app-header-height))] px-4 py-4 text-[#111827] sm:px-6 sm:py-5 lg:px-10 lg:py-4">
      <h1 className="sr-only">理据 GEO：AI 搜索时代的内容可信度审查</h1>

      <div className="mx-auto max-w-[1360px]">
        <header className="editor-page-heading mb-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 max-w-[780px]">
            <p className="editor-kicker">AI SEARCH CONTENT REVIEW</p>
            <h2 className="editor-page-title mt-1">让内容更容易被 AI 正确理解与引用</h2>
            <p className="editor-page-summary mt-3">
              面向内容编辑、运营和知识型创作者，在发布前检查内容的可信度、结构和 AI 搜索理解风险。
            </p>
          </div>
          <div className="editor-page-meta flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="inline-flex items-center gap-1.5">
              <FileText aria-hidden="true" className="size-3.5" />
              发布前检查
            </span>
            <span className="inline-flex items-center gap-1.5">
              <History aria-hidden="true" className="size-3.5" />
              本地草稿
            </span>
          </div>
        </header>

        <div className="editor-purpose-strip mb-2 flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="editor-purpose-label">这次审查会关注</span>
            <p className="editor-purpose-copy">事实是否完整、结构是否清晰，以及 AI 搜索能否准确理解你的内容。</p>
          </div>
          <div className="editor-purpose-list flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="审查范围">
            <span><span aria-hidden="true" className="editor-purpose-dot bg-[#0f766e]" />可信度</span>
            <span><span aria-hidden="true" className="editor-purpose-dot bg-[#5964cf]" />结构</span>
            <span><span aria-hidden="true" className="editor-purpose-dot bg-[#a86313]" />时效性</span>
          </div>
        </div>

        <div className="editor-frame overflow-hidden rounded-lg border border-[#dce2e7] bg-white">
          <div className="editor-frame-bar flex min-h-14 items-center justify-between gap-4 border-b border-[#e4e8ec] px-4 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-md border border-[#cfe1de] bg-[#edf8f6] text-[#0f766e]">
                <FileText aria-hidden="true" className="size-4" />
              </span>
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-[#20252b]">输入要审查的内容</h3>
                <p className="mt-0.5 text-[11px] text-[#8b939e]">标题、正文和发布日期会用于生成报告</p>
              </div>
            </div>
            <span className="editor-status inline-flex shrink-0 items-center gap-1.5 border border-[#cfe1de] bg-[#f1f9f7] px-2.5 py-1 text-[10px] font-semibold text-[#0f766e]">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-[#159587]" />
              等待输入
            </span>
          </div>

          <div className="grid min-w-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
            <form onSubmit={onSubmit} className="flex min-w-0 flex-col p-4 sm:p-5 lg:min-h-[520px] lg:p-6 lg:pb-1 lg:pt-4">
              <div className="grid gap-5 border-b border-[#e9ecef] pb-5 min-[680px]:grid-cols-[minmax(0,1fr)_220px] min-[680px]:items-end">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="article-title" className="editor-field-label">文章标题</Label>
                    <span className="editor-field-hint">必填</span>
                  </div>
                  <Input
                    id="article-title"
                    ref={titleRef}
                    value={draft.title}
                    onChange={(event) => onDraftChange("title", event.target.value)}
                    maxLength={120}
                    autoComplete="off"
                    aria-invalid={Boolean(fieldErrors.title)}
                    aria-describedby={fieldErrors.title ? "title-error" : undefined}
                    placeholder="请输入文章标题..."
                    className="editor-title-input h-11 rounded-md border-[#dce2e7] bg-white px-3.5 text-[15px] font-medium shadow-none focus-visible:border-[#0f766e] focus-visible:ring-[3px] focus-visible:ring-[#0f766e]/10"
                  />
                  {fieldErrors.title ? (
                    <span id="title-error" className="block text-xs font-medium text-[#c85745]">
                      {fieldErrors.title}
                    </span>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label className="editor-field-label">发布日期</Label>
                    <span className="editor-field-hint">选填</span>
                  </div>
                  <DatePicker value={draft.publishedAt} onChange={(value) => onDraftChange("publishedAt", value)} />
                </div>
              </div>

              <div className="flex min-w-0 flex-1 flex-col py-5">
                <div className="mb-3 flex items-center justify-between gap-4">
                  <Label htmlFor="article-content" className="editor-field-label">正文内容</Label>
                  <span className={remaining < 0 ? "editor-character-count text-[#c85745]" : "editor-character-count"}>
                    {contentLength.toLocaleString()} / {maxArticleCharacters.toLocaleString()}
                  </span>
                </div>
                <p className="editor-field-hint mb-2">建议粘贴完整正文，便于检查事实、边界和引用依据。</p>
                <Textarea
                  id="article-content"
                  ref={contentRef}
                  value={contentText}
                  onChange={(event) => onDraftChange("content", event.target.value)}
                  autoComplete="off"
                  aria-invalid={Boolean(fieldErrors.content)}
                  aria-describedby={fieldErrors.content ? "content-error" : undefined}
                  placeholder="粘贴文章正文或直接输入内容..."
                  className="editor-canvas field-sizing-fixed min-h-[280px] flex-1 resize-none rounded-md border border-[#e1e6ea] bg-[#fbfcfd] p-4 text-sm leading-7 shadow-none placeholder:text-[#adb4bd] focus-visible:border-[#0f766e] focus-visible:bg-white focus-visible:ring-[3px] focus-visible:ring-[#0f766e]/8 md:min-h-[220px] lg:min-h-[180px] md:text-[15px]"
                />
                {fieldErrors.content ? (
                  <span id="content-error" className="mt-2 block text-xs font-medium text-[#c85745]">
                    {fieldErrors.content}
                  </span>
                ) : null}
              </div>

              {error ? (
                <p role="alert" className="editor-form-error mb-4 rounded-md border px-4 py-3 text-sm">
                  <span className="editor-form-error-mark" aria-hidden="true">!</span>
                  <span>{error}</span>
                </p>
              ) : null}

              <div className="editor-result-preview mb-4">
                <span className="editor-result-label">提交后你会看到</span>
                <span>GEO 综合得分</span>
                <span>问题诊断</span>
                <span>修改建议与重新验证入口</span>
              </div>

              <footer className="flex flex-col gap-4 border-t border-[#e9ecef] pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#7a8490]">
                  <span className="inline-flex items-center gap-1.5">
                    <Lock aria-hidden="true" className="size-3.5" />
                    分析完成后不保留正文
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <ShieldCheck aria-hidden="true" className="size-3.5 text-[#0f766e]" />
                    结果需人工复核
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-[#5964cf]" />
                    今日额度 10 次
                  </span>
                </div>
                <Button type="submit" className="editor-primary h-11 w-full shrink-0 rounded-md px-6 font-semibold text-white sm:w-auto lg:h-9">
                  开始分析
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Button>
              </footer>
            </form>

            <aside className="sample-library flex min-w-0 flex-col border-t border-[#e4e8ec] bg-[#fafbfc] lg:border-l lg:border-t-0">
              <div className="flex min-h-14 items-center justify-between border-b border-[#e4e8ec] px-4">
                <div className="flex items-center gap-2">
                  <ListChecks aria-hidden="true" className="size-4 text-[#5964cf]" />
                  <div>
                    <span className="block text-xs font-semibold text-[#4f5864]">从样本开始</span>
                    <span className="mt-0.5 block text-[10px] text-[#929aa5]">快速了解输入标准</span>
                  </div>
                </div>
                <span className="rounded border border-[#e1e5ea] bg-white px-2 py-0.5 text-[10px] text-[#7c8591]">3 个样本</span>
              </div>

              <div className="divide-y divide-[#e6eaee]">
                {samples.map((sample, index) => (
                  <button
                    key={sample.id}
                    type="button"
                    onClick={() => onLoadSample(index)}
                    aria-label={`载入样本：${sample.title}`}
                    className="sample-library-row group flex min-h-[82px] w-full min-w-0 items-center gap-3 px-4 py-3 text-left focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0f766e]/20"
                  >
                    <span className="shrink-0 font-mono text-[11px] text-[#9aa2ac]">{String(index + 1).padStart(2, "0")}</span>
                    <Badge variant="outline" className={`shrink-0 rounded-[4px] shadow-none ${sample.badgeClassName}`}>
                      {sample.status}
                    </Badge>
                    <span className="min-w-0 flex-1">
                      <span className="text-clamp-2 block text-xs font-semibold leading-5 text-[#252a31]">{sample.title}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-[#8b939e]">{sample.description}</span>
                    </span>
                    <ArrowRight aria-hidden="true" className="size-3.5 shrink-0 text-[#c2c8cf] transition-transform group-hover:translate-x-0.5 group-hover:text-[#0f766e] motion-reduce:transition-none" />
                  </button>
                ))}
              </div>

              <div className="border-t border-[#e4e8ec] px-4 py-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#4f5864]">检查范围</span>
                  <span className="text-[10px] text-[#929aa5]">4 项</span>
                </div>
                <div className="mt-3 grid gap-2.5 text-[11px] text-[#6c7682]">
                  {dimensions.map((dimension) => (
                    <div key={dimension.label} className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-2">
                        <span aria-hidden="true" className={`size-1.5 rounded-full ${dimension.indicatorClassName}`} />
                        {dimension.label}
                      </span>
                      <CheckCircle2 aria-hidden="true" className="size-3.5 text-[#b6bdc6]" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-auto border-t border-[#e4e8ec] bg-white/70 px-4 py-3 text-[11px] leading-5 text-[#8b939e]">
                免责声明：体检结果仅基于当前输入与内置分析流程，不代表外部平台的最终收录或排名。
              </div>
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}
