"use client";

import { FileText, ListChecks, Sparkles } from "lucide-react";

type ReportActionRailProps = {
  completedCount: number;
  totalCount: number;
  evidenceCount: number;
  contentAvailable: boolean;
  restoredFromCache: boolean;
  onScrollToSection: (sectionId: string) => void;
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
}: ReportActionRailProps) {
  const steps = [
    {
      id: "diagnostic-section",
      icon: ListChecks,
      label: "关键诊断",
      meta: totalCount ? `${completedCount} / ${totalCount} 已完成` : "等待生成问题",
      ready: Boolean(totalCount && completedCount === totalCount),
    },
    {
      id: "patch-workshop",
      icon: Sparkles,
      label: "内容补丁",
      meta: contentAvailable ? "可基于原文生成" : "需要重新运行体检",
      ready: contentAvailable,
    },
    {
      id: "evidence-section",
      icon: FileText,
      label: "证据锚点",
      meta: evidenceCount ? `${evidenceCount} 个原文段落` : restoredFromCache ? "缓存报告未保留" : "等待评分结果",
      ready: evidenceCount > 0,
    },
  ];

  return (
    <aside className="report-action-rail surface-flat min-w-0 p-4 sm:p-5">
      <div className="border-b border-[#e7e9ed] pb-4">
        <p className="section-kicker">REPORT FLOW</p>
        <h2 className="mt-1.5 text-base font-semibold text-[#111827]">分析输出</h2>
      </div>

      <ol className="mt-3 grid gap-2">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => onScrollToSection(step.id)}
                className="group grid w-full grid-cols-[28px_minmax(0,1fr)] gap-3 rounded-md border border-transparent px-2 py-3 text-left hover:border-[#e1e5ea] hover:bg-[#fafbfc]"
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
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
