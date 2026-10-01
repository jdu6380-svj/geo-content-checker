"use client";

import { ArrowRight, CheckCircle2, ClipboardCheck, FilePenLine, RotateCcw } from "lucide-react";

type ReportActionRailProps = {
  completedCount: number;
  totalCount: number;
  evidenceCount: number;
  contentAvailable: boolean;
  restoredFromCache: boolean;
  onScrollToSection: (sectionId: string) => void;
  onBackToEditor: () => void;
};

export function ReportActionRail({
  completedCount,
  totalCount,
  evidenceCount,
  contentAvailable,
  restoredFromCache,
  onScrollToSection,
  onBackToEditor,
}: ReportActionRailProps) {
  const diagnosticsComplete = Boolean(totalCount && completedCount === totalCount);
  const patchAvailable = diagnosticsComplete && contentAvailable;

  return (
    <aside className="report-action-rail report-hero-action min-w-0" aria-label="报告完成后的操作">
      <div className="report-action-heading">
        <div className={`report-completion-icon ${diagnosticsComplete ? "is-complete" : "is-pending"}`} aria-hidden="true">
          <CheckCircle2 className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="section-kicker">下一步建议</p>
          <h2>{diagnosticsComplete ? "从结论到处理" : "报告正在生成"}</h2>
          <span>
            {totalCount
              ? `${completedCount} / ${totalCount} 项诊断 · ${evidenceCount} 条逐字引用`
              : "正在等待诊断结果"}
          </span>
        </div>
      </div>

      <div className="report-completion-actions">
        {restoredFromCache && !contentAvailable ? (
          <button type="button" onClick={onBackToEditor} className="report-completion-button is-primary">
            <RotateCcw aria-hidden="true" className="size-4" />
            返回编辑器恢复正文
            <ArrowRight aria-hidden="true" className="size-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onScrollToSection("diagnostic-section")}
            className="report-completion-button is-primary"
          >
            <ClipboardCheck aria-hidden="true" className="size-4" />
            {diagnosticsComplete ? "查看诊断详情" : "查看诊断进度"}
            <ArrowRight aria-hidden="true" className="size-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => onScrollToSection("patch-workshop")}
          disabled={!patchAvailable}
          className="report-completion-button is-secondary"
        >
          <FilePenLine aria-hidden="true" className="size-4" />
          进入修改建议
          <ArrowRight aria-hidden="true" className="size-4" />
        </button>
        <button
          type="button"
          onClick={onBackToEditor}
          disabled={!contentAvailable}
          className="report-completion-button is-tertiary"
        >
          <RotateCcw aria-hidden="true" className="size-4" />
          重新验证
          <ArrowRight aria-hidden="true" className="size-4" />
        </button>
      </div>
      <p className="report-completion-note">修改建议需人工核对；复检只呈现真实变化。</p>
    </aside>
  );
}
