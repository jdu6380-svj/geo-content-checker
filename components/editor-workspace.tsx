"use client";

import type { FormEvent, RefObject } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  FileText,
  History,
  Link2,
  ListChecks,
  Lock,
  RotateCcw,
  Search,
  ShieldCheck,
  Workflow,
} from "lucide-react";

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
  recheckContext: { score: number; issueCount: number } | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onDraftChange: (field: keyof EditorDraft, value: string) => void;
  onLoadSample: (index: number) => void;
};

const REVIEW_AREAS = [
  {
    label: "证据完整性",
    description: "关键判断是否有可核对依据",
    icon: ShieldCheck,
    toneClassName: "review-area-evidence",
  },
  {
    label: "内容可信风险",
    description: "承诺、边界与事实是否可靠",
    icon: AlertTriangle,
    toneClassName: "review-area-risk",
  },
  {
    label: "AI 搜索理解",
    description: "问题、答案与语义是否清楚",
    icon: Search,
    toneClassName: "review-area-search",
  },
  {
    label: "结构表达",
    description: "信息层级是否便于理解引用",
    icon: ListChecks,
    toneClassName: "review-area-structure",
  },
] as const;

const REVIEW_OUTCOMES = [
  { label: "可信度评分", icon: BarChart3 },
  { label: "风险诊断", icon: AlertTriangle },
  { label: "证据链", icon: Link2 },
  { label: "修改建议", icon: ListChecks },
  { label: "复检对比", icon: RotateCcw },
] as const;

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
  recheckContext,
  onSubmit,
  onDraftChange,
  onLoadSample,
}: EditorWorkspaceProps) {
  const contentText = draft.content ?? "";
  const titleLength = draft.title.length;
  const hasTitle = Boolean(draft.title.trim());
  const hasContent = Boolean(contentText.trim());
  const hasDraft = hasTitle || hasContent || Boolean(draft.publishedAt);
  const hasInputIssue = Boolean(error || fieldErrors.title || fieldErrors.content || remaining < 0);
  const readyForReview = hasTitle && hasContent && remaining >= 0 && !hasInputIssue;
  const inputStatus = hasInputIssue
    ? { label: "需要处理", className: "status-danger" }
    : readyForReview
      ? { label: recheckContext ? "可重新验证" : "可开始审查", className: "status-success" }
      : hasDraft
        ? { label: recheckContext ? "修改中" : "草稿编辑中", className: "status-info" }
        : { label: recheckContext ? "等待修改" : "等待输入", className: "status-neutral" };

  return (
    <section className="editor-workspace min-h-[calc(100vh-var(--app-header-height))] px-4 py-4 text-[#111827] sm:px-6 sm:py-5 lg:px-10 lg:py-4">
      <h1 className="sr-only">Evidra：AI 搜索时代的内容可信度审查平台</h1>

      <div className="mx-auto max-w-[1360px]">
        <header className="editor-page-heading mb-3 grid gap-5 lg:grid-cols-[minmax(0,1fr)_430px] lg:items-end">
          <div className="min-w-0 max-w-[820px]">
            <p className="editor-kicker">EVIDRA · 内容可信度审查工作台</p>
            <h2 className="editor-page-title mt-1">发布前，先确认关键判断是否有据可查</h2>
              <p className="editor-page-summary mt-3">
              Evidra 是面向 AI 搜索时代的内容可信度审查平台，帮助专业内容生产者发现证据、可信度、理解与结构风险。
            </p>
          </div>

          <div className="editor-positioning-brief">
            <div className="flex items-center justify-between gap-4">
              <span className="editor-positioning-label">适用团队</span>
              <span className="editor-page-meta inline-flex items-center gap-1.5">
                <History aria-hidden="true" className="size-3.5" />
                草稿保存在本地
              </span>
            </div>
            <div className="editor-audience-list mt-2" aria-label="Evidra 适用用户">
              <span>专业内容团队</span>
              <span>内容顾问</span>
              <span>知识型创作者</span>
              <span>企业内容生产者</span>
            </div>
          </div>
        </header>

        {recheckContext ? (
          <div className="mb-3 flex flex-col gap-3 border-l-[3px] border-[var(--geo-primary)] bg-[var(--geo-secondary-soft)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <RotateCcw aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--geo-primary)]" />
              <div>
                <p className="text-sm font-semibold text-[var(--geo-text-heading)]">正在准备重新验证</p>
                <p className="mt-1 text-xs leading-5 text-[var(--geo-text-muted)]">将人工核对后的修改应用到正文，再运行同一套完整审查。</p>
              </div>
            </div>
            <span className="shrink-0 font-mono text-xs font-semibold text-[var(--geo-primary)]">
              修改前 {recheckContext.score} 分 · {recheckContext.issueCount} 项需关注
            </span>
          </div>
        ) : null}

        <div className="editor-review-scope mb-3 grid grid-cols-2 xl:grid-cols-4" aria-label="Evidra 审查范围">
          {REVIEW_AREAS.map(({ label, description, icon: Icon, toneClassName }) => (
            <div key={label} className="editor-review-scope-item flex min-w-0 items-start gap-3">
              <span className={`editor-review-scope-icon ${toneClassName}`}>
                <Icon aria-hidden="true" className="size-4" />
              </span>
              <span className="min-w-0">
                <strong className="block">{label}</strong>
                <span className="mt-0.5 block">{description}</span>
              </span>
            </div>
          ))}
        </div>

        <div className="editor-frame overflow-hidden rounded-lg border border-[#dce2e7] bg-white">
          <div className="editor-frame-bar flex min-h-14 items-center justify-between gap-4 border-b border-[#e4e8ec] px-4 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-md border border-[var(--geo-status-info-border)] bg-[var(--geo-status-info-soft)] text-[var(--geo-primary)]">
                <FileText aria-hidden="true" className="size-4" />
              </span>
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-[#20252b]">提交待审查文章</h3>
                <p className="mt-0.5 text-[11px] text-[#8b939e]">完整上下文有助于生成可核对的证据链</p>
              </div>
            </div>
            <span
              aria-live="polite"
              className={`editor-status ${inputStatus.className} inline-flex shrink-0 items-center gap-1.5 border px-2.5 py-1 text-[10px] font-semibold`}
            >
              <span aria-hidden="true" className="size-1.5 rounded-full bg-current opacity-70" />
              {inputStatus.label}
            </span>
          </div>

          <div className="grid min-w-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
            <form onSubmit={onSubmit} className="flex min-w-0 flex-col p-4 sm:p-5 lg:min-h-[520px] lg:p-6 lg:pb-1 lg:pt-4">
              <div className="border-b border-[#e9ecef] pb-5">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="article-title" className="editor-field-label">文章标题</Label>
                    <span className="editor-field-hint">必填 · {titleLength} / 120</span>
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
                    className="editor-title-input h-11 rounded-md border-[var(--geo-border)] bg-white px-3.5 text-[15px] font-medium shadow-none"
                  />
                  {fieldErrors.title ? (
                    <span id="title-error" className="block text-xs font-medium text-[var(--geo-status-danger)]">
                      {fieldErrors.title}
                    </span>
                  ) : null}
                </div>

              </div>

              <div className="flex min-w-0 flex-1 flex-col py-5">
                <div className="mb-3 flex items-center justify-between gap-4">
                  <Label htmlFor="article-content" className="editor-field-label">正文内容</Label>
                  <span
                    aria-live="polite"
                    className={remaining < 0 ? "editor-character-count text-[var(--geo-status-danger)]" : "editor-character-count"}
                  >
                    {remaining < 0
                      ? `超出 ${Math.abs(remaining).toLocaleString()} 字`
                      : `${contentLength.toLocaleString()} / ${maxArticleCharacters.toLocaleString()}`}
                  </span>
                </div>
                <p className="editor-field-hint mb-2">建议粘贴完整正文；上下文越完整，证据与风险定位越可靠。</p>
                <Textarea
                  id="article-content"
                  ref={contentRef}
                  value={contentText}
                  onChange={(event) => onDraftChange("content", event.target.value)}
                  autoComplete="off"
                  aria-invalid={Boolean(fieldErrors.content)}
                  aria-describedby={fieldErrors.content ? "content-error" : undefined}
                  placeholder="粘贴文章正文或直接输入内容..."
                  className="editor-canvas field-sizing-fixed min-h-[280px] flex-1 resize-none rounded-md border border-[var(--geo-border)] bg-[var(--geo-surface-subtle)] p-4 text-sm leading-7 shadow-none placeholder:text-[var(--geo-soft)] focus-visible:bg-white md:min-h-[220px] lg:min-h-[180px] md:text-[15px]"
                />
                {fieldErrors.content ? (
                  <span id="content-error" className="mt-2 block text-xs font-medium text-[var(--geo-status-danger)]">
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
                <div className="editor-result-intro">
                  <span className="editor-result-label">{recheckContext ? "重新验证后获得" : "完成审查后获得"}</span>
                  <p>{recheckContext ? "对比真实变化与仍需处理的问题。" : "用于人工决策，不代表自动保证发布效果。"}</p>
                </div>
                <div className="editor-result-grid">
                  {REVIEW_OUTCOMES.map(({ label, icon: Icon }) => (
                    <span key={label}>
                      <Icon aria-hidden="true" className="size-3.5" />
                      {label}
                    </span>
                  ))}
                </div>
              </div>

              <footer className="flex flex-col gap-4 border-t border-[#e9ecef] pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#7a8490]">
                  <span className="inline-flex items-center gap-1.5">
                    <Lock aria-hidden="true" className="size-3.5" />
                    服务端不保存正文
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <ShieldCheck aria-hidden="true" className="size-3.5 text-[var(--geo-info)]" />
                    证据需人工复核
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-[var(--geo-primary)]" />
                    今日额度 10 次
                  </span>
                </div>
                <Button type="submit" className="editor-primary h-11 w-full shrink-0 rounded-md px-6 font-semibold text-white sm:w-auto">
                  {recheckContext ? "运行重新验证" : "开始可信度审查"}
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Button>
              </footer>
            </form>

            <aside className="editor-guidance-rail flex min-w-0 flex-col border-t border-[#e4e8ec] bg-[#fafbfc] lg:border-l lg:border-t-0">
              <div className="flex min-h-14 items-center justify-between gap-4 border-b border-[#e4e8ec] px-4">
                <div className="flex items-center gap-2">
                  <Workflow aria-hidden="true" className="size-4 text-[var(--geo-primary)]" />
                  <div>
                    <span className="block text-xs font-semibold text-[#4f5864]">审查准备</span>
                    <span className="mt-0.5 block text-[10px] text-[#929aa5]">输入标准与证据机制</span>
                  </div>
                </div>
                <span className="editor-guidance-context">发布前</span>
              </div>

              <section className="editor-guidance-section border-b border-[#e4e8ec] px-4 py-4">
                <div className="flex items-center gap-2">
                  <Link2 aria-hidden="true" className="size-3.5 text-[var(--geo-evidence)]" />
                  <h4>证据链如何工作</h4>
                </div>
                <p className="mt-2">
                  诊断会定位原文段落并核对引用。无法逐字匹配或原文缺失的依据，会明确标记并要求人工判断。
                </p>
                <div className="editor-evidence-legend mt-3" aria-label="证据状态说明">
                  <span><i className="status-success" />valid</span>
                  <span><i className="status-warning" />missing</span>
                  <span><i className="status-danger" />invalid</span>
                </div>
                <p className="editor-input-guidance mt-3">建议提供清楚标题、完整正文，以及适用时的发布日期。</p>
                <div className="editor-dimension-grid mt-3" aria-label="可信度评分维度">
                  {dimensions.map((dimension) => (
                    <span key={dimension.label}>
                      <i aria-hidden="true" className={dimension.indicatorClassName} />
                      {dimension.label}
                    </span>
                  ))}
                </div>
              </section>

              <div className="flex items-center justify-between border-b border-[#e4e8ec] px-4 py-3">
                <div className="flex items-center gap-2">
                  <ListChecks aria-hidden="true" className="size-3.5 text-[var(--geo-primary)]" />
                  <div>
                    <span className="block text-xs font-semibold text-[#4f5864]">从示例开始</span>
                    <span className="mt-0.5 block text-[10px] text-[#929aa5]">比较完整输入与高风险表达</span>
                  </div>
                </div>
                <span className="text-[10px] text-[#929aa5]">3 个示例</span>
              </div>

              <div className="divide-y divide-[#e6eaee]">
                {samples.map((sample, index) => (
                  <button
                    key={sample.id}
                    type="button"
                    onClick={() => onLoadSample(index)}
                    aria-label={`载入样本：${sample.title}`}
                    className="sample-library-row group flex min-h-[72px] w-full min-w-0 items-center gap-3 px-4 py-3 text-left focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--geo-primary)]/20"
                  >
                    <span className="shrink-0 font-mono text-[11px] text-[#9aa2ac]">{String(index + 1).padStart(2, "0")}</span>
                    <Badge variant="outline" className={`shrink-0 rounded-[4px] shadow-none ${sample.badgeClassName}`}>
                      {sample.status}
                    </Badge>
                    <span className="min-w-0 flex-1">
                      <span className="text-clamp-2 block text-xs font-semibold leading-5 text-[#252a31]">{sample.title}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-[#8b939e]">{sample.description}</span>
                    </span>
                    <ArrowRight aria-hidden="true" className="size-3.5 shrink-0 text-[var(--geo-soft)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--geo-primary)] motion-reduce:transition-none" />
                  </button>
                ))}
              </div>

              <div className="mt-auto border-t border-[#e4e8ec] bg-white/70 px-4 py-3 text-[11px] leading-5 text-[#8b939e]">
                审查结果仅基于当前输入与既定流程，不代表外部平台收录、排名或事实正确性的保证。
              </div>
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}
