import { Clock3, FileCheck2, LayoutList, MessagesSquare } from "lucide-react";

import type { EvaluateScoringResponse } from "@/lib/schemas/geo";

type ReportDimensionLedgerProps = {
  report: EvaluateScoringResponse;
};

const DIMENSIONS = [
  { key: "questionCoverage", label: "问题覆盖度", description: "是否覆盖用户与 AI 搜索可能提出的核心问题", icon: MessagesSquare, barClassName: "score-bar-question" },
  { key: "factCompleteness", label: "事实完整度", description: "关键判断是否具备事实、来源与适用边界", icon: FileCheck2, barClassName: "score-bar-fact" },
  { key: "structureClarity", label: "结构清晰度", description: "信息层级是否便于理解、扫描与引用", icon: LayoutList, barClassName: "score-bar-structure" },
  { key: "freshness", label: "时效性", description: "发布日期、更新时间与适用版本是否清楚", icon: Clock3, barClassName: "score-bar-freshness" },
] as const;

export function ReportDimensionLedger({ report }: ReportDimensionLedgerProps) {
  return (
    <section className="report-dimension-ledger border-t border-[var(--geo-border)]" aria-labelledby="dimension-ledger-heading">
      <div className="flex flex-wrap items-end justify-between gap-3 px-5 py-4 sm:px-6">
        <div>
          <p className="section-kicker">评分账本</p>
          <h2 id="dimension-ledger-heading" className="mt-1.5 text-base font-semibold text-[var(--geo-text-heading)]">四维评分账本</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--geo-text-muted)]">固定权重与模型给出的评分依据逐项对应，总分不代表平台收录或排名。</p>
        </div>
        <span className="status-badge status-neutral px-2.5 py-1 text-[11px] font-semibold">权重合计 100</span>
      </div>

      <div className="report-dimension-table border-t border-[var(--geo-border)]">
        <div className="report-dimension-table-head hidden px-5 py-2.5 text-[10px] font-semibold text-[#858c97] md:grid sm:px-6" aria-hidden="true">
          <span>维度</span>
          <span>得分</span>
          <span>完成度</span>
          <span>评分依据</span>
        </div>
        <ol>
          {DIMENSIONS.map(({ key, label, description, icon: Icon, barClassName }, index) => {
            const dimension = report.dimensions[key];
            const percentage = Math.round((dimension.score / dimension.max) * 100);
            return (
              <li key={key} className="report-dimension-row px-5 py-4 sm:px-6">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="report-ledger-index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="grid size-8 shrink-0 place-items-center rounded-md border border-[var(--geo-border)] bg-[var(--geo-surface-subtle)] text-[var(--geo-info)]">
                    <Icon aria-hidden="true" className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-[var(--geo-text-heading)]">{label}</span>
                    <span className="mt-1 block text-[11px] leading-5 text-[var(--geo-text-soft)]">{description}</span>
                  </span>
                </div>
                <div className="mt-3 flex items-baseline gap-1 md:mt-0">
                  <strong className="text-lg tabular-nums text-[var(--geo-text-heading)]">{dimension.score}</strong>
                  <span className="text-xs text-[var(--geo-text-soft)]">/ {dimension.max}</span>
                </div>
                <div className="mt-3 md:mt-0">
                  <div className="flex items-center justify-between gap-3 text-[10px] font-semibold text-[var(--geo-text-muted)]">
                    <span>{percentage}%</span>
                    <span>{dimension.max} 分权重</span>
                  </div>
                  <div className="metric-track mt-2">
                    <div className={`h-full rounded-full ${barClassName}`} style={{ width: `${percentage}%` }} />
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-[var(--geo-text-body)] md:mt-0">{dimension.reason}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
