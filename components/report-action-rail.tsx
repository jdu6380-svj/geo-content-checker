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
    <aside className="report-action-rail surface-flat min-w-0" aria-label="报告完成后的操作">
      <div className={`report-completion-heading ${diagnosticsComplete ? "is-complete" : "is-pending"}`}>
        <span className="report-completion-icon" aria-hidden="true"><CheckCircle2 className="size-5" /></span>
        <div>
          <p>{diagnosticsComplete ? "审查报告已生成" : "正在生成审查报告"}</p>
          <span>
            {totalCount
              ? `${completedCount} / ${totalCount} 项诊断，${evidenceCount} 条逐字引用`
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
      <p className="report-completion-note">修改建议需人工核对，不承诺排名或结果提升。</p>
    </aside>
  );
}
