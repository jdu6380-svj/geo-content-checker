"use client";

import type { FormEvent, RefObject } from "react";
import {
  ArrowRight,
  FileCheck2,
  FileText,
  Lock,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";

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

const REVIEW_OUTCOMES = ["可信度评分", "证据链", "风险诊断", "修改建议", "复检对比"] as const;

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
    <section className="editor-workspace min-h-[calc(100vh-var(--app-header-height))] px-4 py-6 text-[var(--geo-text)] sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <h1 className="sr-only">Evidra：AI 搜索时代的内容可信度审查平台</h1>

      <div className="mx-auto max-w-[1120px]">
        <header className="editor-page-heading">
          <div className="min-w-0 max-w-[780px]">
            <p className="editor-kicker">EVIDRA · 内容可信度审查</p>
            <h2 className="editor-page-title mt-2">提交文章，获取可信度审查报告</h2>
            <p className="editor-page-summary mt-3">
              在发布前核对关键判断、原文证据与内容风险，并获得可执行的修改与复检路径。
            </p>
            <div className="editor-outcome-line mt-4" aria-label="审查结果范围">
              {REVIEW_OUTCOMES.map((label) => <span key={label}>{label}</span>)}
            </div>
          </div>
          <span className="editor-page-meta mt-4 inline-flex items-center gap-1.5 lg:mt-0">
            <Lock aria-hidden="true" className="size-3.5" />
            草稿仅保存在本地
          </span>
        </header>

        {recheckContext ? (
          <div className="editor-recheck-context mt-5 flex flex-col gap-3 border-l-[3px] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <RotateCcw aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--geo-primary)]" />
              <div>
                <p className="text-sm font-semibold text-[var(--geo-text-heading)]">准备重新验证</p>
                <p className="mt-1 text-xs leading-5 text-[var(--geo-text-muted)]">应用人工确认后的修改，再运行同一套完整审查。</p>
              </div>
            </div>
            <span className="shrink-0 font-mono text-xs font-semibold text-[var(--geo-primary)]">
              修改前 {recheckContext.score} 分 · {recheckContext.issueCount} 项需关注
            </span>
          </div>
        ) : null}

        <div className="editor-frame mt-6 overflow-hidden rounded-lg border border-[var(--geo-border)] bg-white">
          <div className="editor-frame-bar flex min-h-14 items-center justify-between gap-4 border-b border-[var(--geo-border)] px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <span className="editor-frame-icon grid size-8 shrink-0 place-items-center rounded-md border">
                <FileText aria-hidden="true" className="size-4" />
              </span>
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-[var(--geo-text-heading)]">
                  {recheckContext ? "编辑并重新验证" : "新建内容审查"}
                </h3>
                <p className="mt-0.5 text-[11px] text-[var(--geo-text-soft)]">标题与完整正文可提高证据定位质量</p>
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

          <form onSubmit={onSubmit} className="p-4 sm:p-6 lg:p-8">
            {!recheckContext && samples.length ? (
              <div className="editor-sample-toolbar mb-6 flex flex-wrap items-center gap-2" aria-label="示例文章">
                <span className="mr-1 text-xs font-semibold text-[var(--geo-text-muted)]">从示例开始</span>
                {samples.map((sample, index) => (
                  <button
                    key={sample.id}
                    type="button"
                    onClick={() => onLoadSample(index)}
                    aria-label={`载入样本：${sample.title}`}
                    className="editor-sample-button"
                    title={sample.description}
                  >
                    示例 {index + 1} · {sample.status}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="grid gap-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="article-title" className="editor-field-label">文章标题</Label>
                  <span className="editor-field-hint">{titleLength} / 120</span>
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
                  placeholder="输入文章标题"
                  className="editor-title-input h-12 rounded-md border-[var(--geo-border)] bg-white px-4 text-[15px] font-medium shadow-none"
                />
                {fieldErrors.title ? (
                  <span id="title-error" className="block text-xs font-medium text-[var(--geo-status-danger)]">
                    {fieldErrors.title}
                  </span>
                ) : null}
              </div>

              <div className="min-w-0">
                <div className="mb-2 flex items-center justify-between gap-4">
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
                <Textarea
                  id="article-content"
                  ref={contentRef}
                  value={contentText}
                  onChange={(event) => onDraftChange("content", event.target.value)}
                  autoComplete="off"
                  aria-invalid={Boolean(fieldErrors.content)}
                  aria-describedby={fieldErrors.content ? "content-error" : undefined}
                  placeholder="粘贴完整正文或直接输入内容"
                  className="editor-canvas field-sizing-fixed min-h-[240px] resize-y rounded-md border border-[var(--geo-border)] bg-[var(--geo-surface-subtle)] p-4 text-sm leading-7 shadow-none placeholder:text-[var(--geo-soft)] focus-visible:bg-white md:text-[15px]"
                />
                {fieldErrors.content ? (
                  <span id="content-error" className="mt-2 block text-xs font-medium text-[var(--geo-status-danger)]">
                    {fieldErrors.content}
                  </span>
                ) : null}
              </div>
            </div>

            {error ? (
              <p role="alert" className="editor-form-error mt-5 rounded-md border px-4 py-3 text-sm">
                <span className="editor-form-error-mark" aria-hidden="true">!</span>
                <span>{error}</span>
              </p>
            ) : null}

            <footer className="editor-submit-row mt-6 flex flex-col gap-4 border-t border-[var(--geo-border)] pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--geo-text-muted)]">
                <span className="inline-flex items-center gap-1.5">
                  <Lock aria-hidden="true" className="size-3.5" />
                  服务端不保存正文
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck aria-hidden="true" className="size-3.5 text-[var(--geo-info)]" />
                  结果需人工复核
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <FileCheck2 aria-hidden="true" className="size-3.5 text-[var(--geo-primary)]" />
                  最多 12,000 字
                </span>
              </div>
              <Button type="submit" className="editor-primary h-11 w-full shrink-0 rounded-md px-6 font-semibold text-white sm:w-auto">
                {recheckContext ? "运行重新验证" : "开始可信度审查"}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Button>
            </footer>
          </form>
        </div>
      </div>
    </section>
  );
}
