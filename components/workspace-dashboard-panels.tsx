"use client";

import { Check, FileSearch2, RotateCcw, ShieldCheck } from "lucide-react";

const REVIEW_STEPS = [
  { label: "主张识别", description: "识别文章中的可验证主张", icon: FileSearch2 },
  { label: "证据定位", description: "定位原文证据并评估支持范围", icon: ShieldCheck },
  { label: "修改建议", description: "基于证据缺口给出可追溯建议", icon: Check },
  { label: "重新验证", description: "修改后重新验证支持状态", icon: RotateCcw },
] as const;

const GUIDE_STEPS = [
  { label: "上传或粘贴内容", description: "支持文本文件与直接粘贴" },
  { label: "智能分析审查", description: "多维度识别风险与可信度问题" },
  { label: "查看证据报告", description: "逐条理解主张与原文证据的关系" },
  { label: "修改与重新验证", description: "应用证据驱动修改后重新验证" },
] as const;

export function QuickStartGuide() {
  return (
    <section className="phase-rail-card phase-guide-card" aria-labelledby="phase-guide-title">
      <h2 id="phase-guide-title">快速开始指南</h2>
      <p className="phase-guide-audience">适合官网、帮助中心和 GEO 内容团队做发布前检查。</p>
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

export function RecentReviewCard() {
  return (
    <section className="phase-rail-card phase-recent-report" aria-labelledby="phase-recent-report-title">
      <header>
        <div>
          <span className="phase-core-workflow-kicker">核心工作流</span>
          <h2 id="phase-recent-report-title">证据优先审查闭环</h2>
        </div>
        <span className="phase-core-workflow-status"><i />实时生成</span>
      </header>

      <p className="phase-core-workflow-description">提交文章后，系统会生成本次审查报告。每个结论都来自本次输入与原文证据。</p>

      <ul className="phase-recent-metrics">
        {REVIEW_STEPS.map((step, index) => {
          const Icon = step.icon;
          return (
          <li key={step.label}>
            <span className="phase-core-workflow-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <span className="phase-core-workflow-icon"><Icon aria-hidden="true" /></span>
            <div><strong>{step.label}</strong><p>{step.description}</p></div>
          </li>
          );
        })}
      </ul>

      <footer className="phase-core-workflow-footer"><ShieldCheck aria-hidden="true" />每个结论都保留与原文证据的对应关系</footer>
    </section>
  );
}
