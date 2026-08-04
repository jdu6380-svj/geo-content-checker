"use client";

import type { FormEvent, RefObject } from "react";
import {
  ArrowRight,
  Check,
  FileCheck2,
  FileSearch,
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

const REVIEW_VALUES = [
  { label: "提升内容可信度", description: "核对关键判断是否有依据", icon: ShieldCheck },
  { label: "降低 AI 误读风险", description: "识别表达边界与信息缺口", icon: FileSearch },
  { label: "增强引用机会", description: "检查原文证据是否可定位", icon: FileCheck2 },
  { label: "优化内容质量", description: "形成可人工复核的修改方向", icon: FileText },
] as const;

const EDITOR_PROCESS_STEPS = [
  { id: "review", label: "提交内容", description: "填写完整文章" },
  { id: "report", label: "生成报告", description: "查看评分与风险" },
  { id: "advice", label: "修改建议", description: "核对证据后处理" },
  { id: "recheck", label: "重新验证", description: "比较真实变化" },
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

  const workflowStage = recheckContext ? "recheck" : "review";
  const processActiveIndex = workflowStage === "recheck" ? 3 : 0;
  const nextAction = readyForReview
    ? recheckContext ? "运行重新验证" : "开始可信度审查"
    : "完成文章输入";

  return (
    <section className="editor-workspace text-[var(--geo-text)]">
      <h1 className="sr-only">Evidra 内容可信度审查工作台</h1>

      <div className="editor-workspace-grid">
        <div className="editor-main-column min-w-0">
          <header className="editor-task-header">
            <div>
              <p className="section-kicker">内容审查</p>
              <h2>{recheckContext ? "重新验证修改后的文章" : "开始一次可信度审查"}</h2>
              <p>{recheckContext ? "提交人工确认后的版本，对比修改前后的真实变化。" : "提交完整文章，获得可信度评分、风险诊断与原文证据。"}</p>
            </div>
            <span className={`editor-task-status ${inputStatus.className}`}>
              <span aria-hidden="true" />
              {inputStatus.label}
            </span>
          </header>

          {recheckContext ? (
            <div className="editor-recheck-context flex flex-col gap-3 border-l-[3px] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
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

          <form onSubmit={onSubmit} className="editor-review-panel">
            <header className="editor-review-panel-header">
              <div>
                <h3>文章内容</h3>
                <p>标题与正文将用于本次可信度审查。</p>
              </div>
              {!recheckContext && samples.length ? (
                <div className="editor-sample-toolbar" aria-label="示例文章">
                  <span>从示例开始</span>
                  {samples.map((sample, index) => (
                    <button
                      key={sample.id}
                      type="button"
                      onClick={() => onLoadSample(index)}
                      aria-label={`载入样本：${sample.title}`}
                      title={sample.description}
                    >
                      {index + 1}
                    </button>
                  ))}
                </div>
              ) : null}
            </header>

            <div className="editor-review-fields">
              <div className="editor-review-field">
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
                  placeholder="输入文章标题（必填）"
                  className="editor-title-input"
                />
                {fieldErrors.title ? <span id="title-error" className="editor-field-error">{fieldErrors.title}</span> : null}
              </div>

              <div className="editor-review-field editor-content-field">
                <div className="flex items-center justify-between gap-4">
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
                  placeholder="粘贴或输入你的文章内容…"
                  className="editor-canvas field-sizing-fixed resize-y"
                />
                {fieldErrors.content ? <span id="content-error" className="editor-field-error">{fieldErrors.content}</span> : null}
              </div>

              {error ? (
                <p role="alert" className="editor-form-error">
                  <span className="editor-form-error-mark" aria-hidden="true">!</span>
                  <span>{error}</span>
                </p>
              ) : null}
            </div>

            <footer className="editor-submit-row">
              <div className="editor-trust-row">
                <span><Lock aria-hidden="true" className="size-3.5" />内容仅用于审查</span>
                <span><FileCheck2 aria-hidden="true" className="size-3.5" />最多 12,000 字</span>
              </div>
              <Button type="submit" className="editor-primary">
                {recheckContext ? "运行重新验证" : "开始可信度审查"}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Button>
            </footer>
          </form>
        </div>

        <aside className="editor-context-column" aria-label="当前审查上下文">
          <section className="workspace-context-card">
            <div className="workspace-context-heading">
              <p>审查价值</p>
            </div>
            <div className="editor-value-list">
              {REVIEW_VALUES.map(({ label, description, icon: Icon }) => (
                <div key={label} className="editor-value-item">
                  <span className="editor-value-icon"><Icon aria-hidden="true" className="size-4" /></span>
                  <span>
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="workspace-context-card">
            <h3>审查流程</h3>
            <div className="editor-process-list">
              {EDITOR_PROCESS_STEPS.map((step, index) => {
                const isActive = index === processActiveIndex;
                const isComplete = index < processActiveIndex;
                return (
                  <div
                    key={step.id}
                    className={`editor-process-item ${isActive ? "is-active" : ""} ${isComplete ? "is-complete" : ""}`}
                    aria-current={isActive ? "step" : undefined}
                  >
                    <span className="editor-process-marker" aria-hidden="true">
                      {isComplete ? <Check className="size-3" /> : null}
                    </span>
                    <span className="editor-process-copy">
                      <strong>{step.label}</strong>
                      <small>{step.description}</small>
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="editor-next-step">
              <span className="editor-next-step-icon"><FileText aria-hidden="true" className="size-4" /></span>
              <div>
                <span className="editor-context-subheading">下一步</span>
                <strong>{nextAction}</strong>
                <p>{readyForReview ? "生成评分、风险、证据与诊断结果。" : "填写标题和正文后即可开始。"}</p>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
