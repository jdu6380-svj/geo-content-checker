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

const STEP_STYLE = {
  complete: { badge: "status-success", label: "已完成" },
  active: { badge: "status-warning", label: "进行中" },
  available: { badge: "status-info", label: "可开始" },
  locked: { badge: "status-neutral", label: "待前置" },
  pending: { badge: "status-neutral", label: "待处理" },
} as const;

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
      <div className="border-b border-[#e7e9ed] pb-4">
        <p className="section-kicker">ACTION PANEL</p>
        <h2 className="mt-1.5 text-base font-semibold text-[#111827]">审查处理路径</h2>
        <p className="mt-2 text-xs leading-5 text-[#737d89]">先核对依据，再决定修改范围；生成材料不代表审查完成。</p>
      </div>

      <ol className="mt-3 grid gap-2">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const presentation = STEP_STYLE[step.state];
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={step.onClick}
                disabled={step.disabled}
                className={`report-action-step group grid w-full grid-cols-[28px_minmax(0,1fr)_16px] items-center gap-3 rounded-md border border-transparent px-2 py-3 text-left disabled:cursor-not-allowed disabled:opacity-60 ${step.state === "available" || step.state === "active" ? "is-next" : ""}`}
              >
                <span className={`grid size-7 place-items-center rounded-md border text-[10px] font-bold ${presentation.badge}`}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#252a31]">
                    <Icon aria-hidden="true" className="size-3.5 text-[#737d89] group-hover:text-[#0f766e]" />
                    {step.label}
                    <span className={`status-badge px-1.5 py-0.5 text-[9px] font-semibold ${presentation.badge}`}>
                      {presentation.label}
                    </span>
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-[#858c97]">{step.meta}</span>
                </span>
                <ArrowRight aria-hidden="true" className="size-3.5 text-[#a0a7b1] group-hover:text-[#0f766e]" />
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
        <p className="text-xs leading-5 text-[#858c97]">
          修改建议与内容草稿均需人工核对，Evidra 不承诺排名或结果提升。
        </p>
      </div>
    </aside>
  );
}
