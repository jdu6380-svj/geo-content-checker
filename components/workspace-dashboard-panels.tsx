"use client";

import { ArrowRight, CheckCircle2 } from "lucide-react";

type RecentReviewCardProps = {
  onOpenReport?: () => void;
};

const GUIDE_STEPS = [
  { label: "上传或粘贴内容", description: "支持 Markdown、TXT 与直接粘贴" },
  { label: "AI 分析审查", description: "多维度识别风险与可信度问题" },
  { label: "获取审查报告", description: "查看问题诊断与优化建议" },
  { label: "优化与验证", description: "记录建议，人工修改后重新验证" },
] as const;

const REPORT_DIMENSIONS = [
  { label: "问题覆盖度", description: "是否直接回答读者会提出的关键问题" },
  { label: "事实完整度", description: "关键结论是否有事实、数字或案例支撑" },
  { label: "结构清晰度", description: "标题、段落与结论是否容易定位" },
  { label: "可验证性", description: "来源、时间与适用边界是否清楚" },
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
  onOpenReport,
}: RecentReviewCardProps) {
  return (
    <section className="phase-rail-card phase-recent-report" aria-labelledby="phase-recent-report-title">
      <header>
        <h2 id="phase-recent-report-title">报告评分维度</h2>
        {onOpenReport ? <button type="button" onClick={onOpenReport}>打开报告 <ArrowRight aria-hidden="true" /></button> : null}
      </header>

      <p className="phase-report-intro">开始分析后，系统会基于你的文章生成真实评分，不使用预置结果。</p>
      <ul className="phase-report-dimensions">
        {REPORT_DIMENSIONS.map((item) => (
          <li key={item.label}>
            <CheckCircle2 aria-hidden="true" />
            <div><strong>{item.label}</strong><span>{item.description}</span></div>
          </li>
        ))}
      </ul>

      {onOpenReport ? <button type="button" className="phase-view-report-button" onClick={onOpenReport}>打开当前报告 <ArrowRight aria-hidden="true" /></button> : null}
    </section>
  );
}
