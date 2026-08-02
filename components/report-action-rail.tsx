"use client";

import { ArrowRight, ListChecks, RotateCcw, Sparkles } from "lucide-react";

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
  ready: "border-[#cfe1de] bg-[#eef8f6] text-[#0f766e]",
  neutral: "border-[#e1e5ea] bg-[#f8fafc] text-[#69717d]",
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
  const steps = [
    {
      id: "diagnostic-section",
      icon: ListChecks,
      label: "发现问题",
      meta: totalCount ? `${completedCount} / ${totalCount} 项诊断完成` : "等待诊断结果",
      ready: Boolean(totalCount && completedCount === totalCount),
      onClick: () => onScrollToSection("diagnostic-section"),
    },
    {
      id: "patch-workshop",
      icon: Sparkles,
      label: "执行优化",
      meta: contentAvailable ? "生成建议或内容草稿" : "需要恢复文章正文",
      ready: contentAvailable,
      onClick: () => onScrollToSection("patch-workshop"),
    },
    {
      id: "recheck",
      icon: RotateCcw,
      label: "重新验证",
      meta: restoredFromCache
        ? "恢复正文后重新运行分析"
        : evidenceCount
          ? `${evidenceCount} 条原文证据可供复核`
          : "应用修改后再次分析",
      ready: false,
      onClick: onBackToEditor,
    },
  ];

  return (
    <aside className="report-action-rail surface-flat min-w-0 p-4 sm:p-5">
      <div className="border-b border-[#e7e9ed] pb-4">
        <p className="section-kicker">REVIEW LOOP</p>
        <h2 className="mt-1.5 text-base font-semibold text-[#111827]">从问题到复核</h2>
        <p className="mt-2 text-xs leading-5 text-[#737d89]">每一步都保留人工判断，不自动改写原文。</p>
      </div>

      <ol className="mt-3 grid gap-2">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={step.onClick}
                className="group grid w-full grid-cols-[28px_minmax(0,1fr)_16px] items-center gap-3 rounded-md border border-transparent px-2 py-3 text-left hover:border-[#e1e5ea] hover:bg-[#fafbfc]"
              >
                <span className={`grid size-7 place-items-center rounded-md border text-[10px] font-bold ${step.ready ? STEP_STYLE.ready : STEP_STYLE.neutral}`}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm font-semibold text-[#252a31]">
                    <Icon aria-hidden="true" className="size-3.5 text-[#737d89] group-hover:text-[#0f766e]" />
                    {step.label}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-[#858c97]">{step.meta}</span>
                </span>
                <ArrowRight aria-hidden="true" className="size-3.5 text-[#a0a7b1] group-hover:text-[#0f766e]" />
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
