"use client";

import type { FormEvent, RefObject } from "react";
import {
  ArrowRight,
  BarChart3,
  CircleGauge,
  FileCheck2,
  FileSearch,
  FileText,
  Lock,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { ReviewWorkflowStepper } from "@/components/review-workflow-stepper";
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

const REVIEW_OUTCOMES = [
  { label: "可信度评分", description: "综合评估内容准备度", icon: CircleGauge },
  { label: "风险诊断", description: "定位问题与影响", icon: BarChart3 },
  { label: "证据清单", description: "核对来源与引用", icon: FileSearch },
  { label: "修改建议", description: "形成辅助修改材料", icon: Sparkles },
  { label: "复检对比", description: "验证修改前后变化", icon: RotateCcw },
] as const;

const EDITOR_PROCESS_STEPS = [
  { id: "review", label: "提交内容", description: "等待完整文章" },
  { id: "report", label: "生成报告", description: "评分与风险" },
  { id: "advice", label: "获取建议", description: "基于证据" },
  { id: "edit", label: "修改内容", description: "人工确认后应用" },
  { id: "recheck", label: "重新验证", description: "对比真实变化" },
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

  const workflowStage = recheckContext ? "recheck" : "review";
  const processActiveIndex = workflowStage === "recheck" ? 4 : 0;
  const nextAction = readyForReview
    ? recheckContext ? "运行重新验证" : "开始可信度审查"
    : "完成文章输入";

  return (
    <section className="editor-workspace text-[var(--geo-text)]">
      <h1 className="sr-only">Evidra 内容可信度审查工作台</h1>

      <div className="editor-workspace-grid">
        <div className="editor-main-column min-w-0">
          <ReviewWorkflowStepper stage={workflowStage} />

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
                <h3>输入要审查的内容</h3>
                <p>完整标题与正文有助于准确定位原文证据。</p>
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
                <p className="editor-content-guidance">建议粘贴完整正文，便于准确审查。</p>
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
                <span><ShieldCheck aria-hidden="true" className="size-3.5" />人工复核保障</span>
                <span><FileCheck2 aria-hidden="true" className="size-3.5" />最多 12,000 字</span>
              </div>
              <Button type="submit" className="editor-primary">
                {recheckContext ? "运行重新验证" : "开始可信度审查"}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Button>
            </footer>
          </form>

          <section className="editor-outcome-panel" aria-labelledby="editor-outcome-heading">
            <h3 id="editor-outcome-heading">你将获得</h3>
            <div className="editor-outcome-grid">
              {REVIEW_OUTCOMES.map(({ label, description, icon: Icon }) => (
                <div key={label} className="editor-outcome-item">
                  <span className="editor-outcome-icon"><Icon aria-hidden="true" className="size-4" /></span>
                  <span><strong>{label}</strong><small>{description}</small></span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="editor-context-column" aria-label="当前审查上下文">
          <section className="workspace-context-card">
            <div className="workspace-context-heading">
              <p>当前审查</p>
              <span className={`editor-context-status ${inputStatus.className}`}>{inputStatus.label}</span>
            </div>
            <dl className="editor-context-ledger">
              <div><dt>输入状态</dt><dd>{hasTitle && hasContent ? "标题与正文已填写" : "等待完整文章内容"}</dd></div>
              <div><dt>字数范围</dt><dd>{contentLength.toLocaleString()} / {maxArticleCharacters.toLocaleString()}</dd></div>
              <div><dt>Evidence</dt><dd>{readyForReview ? "审查后生成逐字引用" : "等待审查"}</dd></div>
            </dl>
            <div className="editor-context-scope">
              <p className="editor-context-subheading">审查范围</p>
              <div className="editor-scope-list">
                {dimensions.map((dimension, index) => (
                  <div key={dimension.label}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{dimension.label}</strong>
                  </div>
                ))}
              </div>
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
                      {isComplete ? "✓" : ""}
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
                <p>{readyForReview ? "生成评分、风险、Evidence 与诊断结果。" : "填写标题和正文后即可开始。"}</p>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
