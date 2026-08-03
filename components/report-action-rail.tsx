"use client";

import { ArrowRight, ClipboardCheck, FilePenLine, RotateCcw } from "lucide-react";

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
  const steps = [
    {
      id: "diagnostic-section",
      icon: ClipboardCheck,
      label: "核对诊断与证据",
      meta: totalCount
        ? `${completedCount} / ${totalCount} 项诊断，${evidenceCount} 条逐字引用`
        : "等待诊断结果",
      state: diagnosticsComplete ? "complete" as const : "active" as const,
      disabled: false,
      onClick: () => onScrollToSection("diagnostic-section"),
    },
    {
      id: "patch-workshop",
      icon: FilePenLine,
      label: "准备修改材料",
      meta: patchAvailable
        ? "建议与内容草稿可用，应用前需人工复核"
        : contentAvailable
          ? "完成诊断核对后进入"
          : "需要先恢复文章正文",
      state: patchAvailable ? "available" as const : "locked" as const,
      disabled: !patchAvailable,
      onClick: () => onScrollToSection("patch-workshop"),
    },
    {
      id: "recheck",
      icon: RotateCcw,
      label: "修改后重新验证",
      meta: "返回编辑器应用修改，再运行同一套审查进行对比",
      state: "pending" as const,
      disabled: !contentAvailable,
      onClick: onBackToEditor,
    },
  ];

  return (
    <aside className="report-action-rail surface-flat min-w-0 p-4 sm:p-5" aria-label="下一步操作">
      <div className="border-b border-[var(--geo-border)] pb-4">
        <p className="section-kicker">下一步</p>
        <h2 className="mt-1.5 text-base font-semibold text-[var(--geo-text-heading)]">处理当前风险</h2>
      </div>

      <ol className="report-action-list mt-2">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={step.onClick}
                disabled={step.disabled}
                className={`report-action-step group grid w-full grid-cols-[24px_minmax(0,1fr)_16px] items-center gap-3 border-b border-[var(--geo-border)] px-1 py-3 text-left last:border-b-0 disabled:cursor-not-allowed disabled:opacity-50 ${step.state === "available" || step.state === "active" ? "is-next" : ""}`}
              >
                <span className="grid size-6 place-items-center rounded-md border border-[var(--geo-border)] bg-white text-[9px] font-bold text-[var(--geo-text-soft)]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm font-semibold text-[var(--geo-text-heading)]">
                    <Icon aria-hidden="true" className="size-3.5 text-[var(--geo-text-muted)] group-hover:text-[var(--geo-primary)]" />
                    {step.label}
                  </span>
                  <span className="mt-1 block text-[11px] leading-5 text-[var(--geo-text-muted)]">{step.meta}</span>
                </span>
                <ArrowRight aria-hidden="true" className="size-3.5 text-[var(--geo-soft)] group-hover:text-[var(--geo-primary)]" />
              </button>
            </li>
          );
        })}
      </ol>

      <div className="mt-4 grid gap-2 border-t border-[#e7e9ed] pt-4">
        {restoredFromCache && !contentAvailable ? (
          <button type="button" onClick={onBackToEditor} className="dark-button h-10 w-full px-4 text-sm font-semibold">
            返回编辑器恢复正文
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onScrollToSection("diagnostic-section")}
            className="dark-button h-10 w-full px-4 text-sm font-semibold"
          >
            {diagnosticsComplete ? "先核对关键诊断" : "查看诊断进度"}
            <ArrowRight aria-hidden="true" className="size-4" />
          </button>
        )}
        {patchAvailable ? (
          <button
            type="button"
            onClick={() => onScrollToSection("patch-workshop")}
            className="secondary-button h-10 w-full px-4 text-sm font-semibold"
          >
            进入修改建议
          </button>
        ) : null}
        <p className="text-[11px] leading-5 text-[var(--geo-text-soft)]">所有修改材料均需人工核对，不承诺排名或结果提升。</p>
      </div>
    </aside>
  );
}
