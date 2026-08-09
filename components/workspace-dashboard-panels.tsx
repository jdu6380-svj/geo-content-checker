"use client";

import { ArrowRight } from "lucide-react";

type RecentReviewCardProps = {
  score?: number;
  title?: string;
  onOpenReport?: () => void;
};

const GUIDE_STEPS = [
  { label: "上传或粘贴内容", description: "支持多种文档格式与直接粘贴" },
  { label: "AI 分析审查", description: "多维度识别风险与可信度问题" },
  { label: "获取审查报告", description: "查看问题诊断与优化建议" },
  { label: "优化与验证", description: "应用建议并重新验证效果" },
] as const;

const SCORE_ITEMS = [
  { label: "事实完整度", value: 68, tone: "is-warning" },
  { label: "来源透明度", value: 76, tone: "is-success" },
  { label: "结构清晰度", value: 82, tone: "is-success" },
  { label: "可验证性", value: 62, tone: "is-danger" },
] as const;

export function QuickStartGuide() {
  return (
    <section className="phase-rail-card phase-guide-card" aria-labelledby="phase-guide-title">
      <h2 id="phase-guide-title">快速开始指南</h2>
      <ol className="phase-guide-list">
        {GUIDE_STEPS.map((step, index) => (
          <li key={step.label}>
            <span className="phase-guide-index">{String(index + 1).padStart(2, "0")}</span>
            <div>
              <strong>{step.label}</strong>
              <p>{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function RecentReviewCard({
  score = 72,
  title = "独立创作者如何为 AI 搜索优化长文",
  onOpenReport,
}: RecentReviewCardProps) {
  return (
    <section className="phase-rail-card phase-recent-report" aria-labelledby="phase-recent-report-title">
      <header>
        <h2 id="phase-recent-report-title">最近审查报告</h2>
        <button type="button" onClick={onOpenReport} disabled={!onOpenReport}>
          查看全部 <ArrowRight aria-hidden="true" />
        </button>
      </header>

      <div className="phase-recent-summary">
        <div className="phase-recent-score">
          <strong>{score}</strong>
          <span>/100</span>
          <small>中风险</small>
        </div>
        <div>
          <h3>{title}</h3>
          <p>审查完成 · 2025-05-28 14:30</p>
        </div>
      </div>

      <ul className="phase-recent-metrics">
        {SCORE_ITEMS.map((item) => (
          <li key={item.label}>
            <span className={`phase-metric-dot ${item.tone}`} aria-hidden="true" />
            <strong>{item.label}</strong>
            <b className={item.tone}>{item.value}</b>
            <ArrowRight aria-hidden="true" />
          </li>
        ))}
      </ul>

      <button type="button" className="phase-view-report-button" onClick={onOpenReport} disabled={!onOpenReport}>
        查看完整报告 <ArrowRight aria-hidden="true" />
      </button>
    </section>
  );
}
