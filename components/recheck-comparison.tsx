"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  Link2,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";

import { AnimatedNumber } from "@/components/ui/animated-number";
import {
  getReportIssueStatus,
  isReportIssue,
  type ReportComparisonSnapshot,
} from "@/lib/client/report-comparison";

type RecheckComparisonProps = {
  baseline: ReportComparisonSnapshot;
  current: ReportComparisonSnapshot | null;
  status: "running" | "complete" | "error" | "cached";
  onOpenOverview: () => void;
};

function scoreChangeLabel(change: number): string {
  if (change > 0) return `+${change}`;
  return String(change);
}

function changePresentation(change: number) {
  if (change > 0) return { label: "提升", className: "is-positive" };
  if (change < 0) return { label: "下降", className: "is-negative" };
  return { label: "持平", className: "is-neutral" };
}

function statusCopy(status: RecheckComparisonProps["status"]) {
  if (status === "cached") {
    return {
      title: "尚未生成新的复检结果",
      description: "修改正文后再次分析，才会形成可比较的新结果。",
      icon: RotateCcw,
      className: "is-warning",
    };
  }
  if (status === "error") {
    return {
      title: "复检尚未完整结束",
      description: "本轮分析存在未完成模块，已保留修改前基线。",
      icon: AlertTriangle,
      className: "is-danger",
    };
  }
  return {
    title: "正在重新验证修改结果",
    description: "系统正在使用同一套审查规则重新检测内容。",
    icon: RotateCcw,
    className: "is-info",
  };
}

export function RecheckComparison({ baseline, current, status, onOpenOverview }: RecheckComparisonProps) {
  if (status !== "complete" || !current) {
    const presentation = statusCopy(status);
    const StatusIcon = presentation.icon;
    return (
      <section id="recheck-comparison" className="phase2-recheck-page section-anchor">
        <header className="phase2-subpage-header">
          <div>
            <p className="phase2-breadcrumb">我的审查 <span>/</span> Report Overview <span>/</span> Recheck</p>
            <h1>重新验证结果</h1>
            <p>基于原始报告重新核验已修改内容。</p>
          </div>
          <div className="phase2-subpage-actions"><button type="button" onClick={onOpenOverview}><ArrowLeft aria-hidden="true" />返回报告概览</button></div>
        </header>
        <div className={`phase2-loading-surface ${presentation.className}`} role="status" aria-live="polite">
          <StatusIcon aria-hidden="true" />
          <div><strong>{presentation.title}</strong><p>{presentation.description}</p></div>
        </div>
      </section>
    );
  }

  const scoreChange = current.totalScore - baseline.totalScore;
  const scorePresentation = changePresentation(scoreChange);
  const baselineIssues = baseline.diagnostics.filter(isReportIssue);
  const currentIssues = current.diagnostics.filter(isReportIssue);
  const improvedIssueCount = Math.max(0, baselineIssues.length - currentIssues.length);
  const dimensionCards = [
    {
      key: "factCompleteness" as const,
      label: "事实完整度",
      icon: FileCheck2,
      description: "关键事实覆盖更完整。",
    },
    {
      key: "questionCoverage" as const,
      label: "Evidence 覆盖",
      icon: Link2,
      description: "观点与来源关联更清晰。",
    },
    {
      key: "freshness" as const,
      label: "可验证性",
      icon: ShieldCheck,
      description: "来源与定位信息便于复核。",
    },
  ];
  const evidenceValidBefore = baseline.diagnostics.filter((item) => item.evidenceStatus === "valid").length;
  const evidenceValidAfter = current.diagnostics.filter((item) => item.evidenceStatus === "valid").length;
  const highRiskBefore = baseline.diagnostics.filter((item) => getReportIssueStatus(item) === "high").length;
  const highRiskAfter = current.diagnostics.filter((item) => getReportIssueStatus(item) === "high").length;
  const summaryItems = [
    evidenceValidAfter > evidenceValidBefore
      ? "更多关键观点已获得有效 Evidence 支撑"
      : evidenceValidAfter < evidenceValidBefore
        ? "有效 Evidence 数量下降，建议复核来源关联"
        : "关键观点与 Evidence 已重新核验",
    current.dimensions.factCompleteness.score > baseline.dimensions.factCompleteness.score
      ? "事实完整度得到改善"
      : current.dimensions.factCompleteness.score < baseline.dimensions.factCompleteness.score
        ? "事实完整度下降，建议核对本轮修改"
        : "事实完整度保持稳定",
    highRiskAfter < highRiskBefore
      ? "高风险问题数量已下降"
      : highRiskAfter > highRiskBefore
        ? "高风险问题数量增加，建议继续处理"
        : "高风险表述已完成复核",
  ];
  const SummaryIcon = scoreChange < 0 ? AlertTriangle : ShieldCheck;
  const summaryTitle = scoreChange > 0 ? "可信度提升" : scoreChange < 0 ? "可信度下降" : "可信度保持稳定";
  const summaryDescription = scoreChange > 0
    ? "本轮修改改善了来源透明度、Evidence 覆盖与结论可验证性。"
    : scoreChange < 0
      ? "本轮修改未形成预期改善，建议返回 Evidence 与 Diagnosis 核对新增缺口。"
      : "本轮修改完成复核，整体可信度评分保持稳定。";

  return (
    <section id="recheck-comparison" className="phase2-recheck-page section-anchor">
      <header className="phase2-subpage-header">
        <div>
          <p className="phase2-breadcrumb">我的审查 <span>/</span> Report Overview <span>/</span> Recheck</p>
          <h1>重新验证结果</h1>
          <p>已基于人工修改后的正文 · 对照原始报告重新核验</p>
          <span className={`phase2-recheck-complete ${scorePresentation.className}`}><CheckCircle2 aria-hidden="true" />复核完成 · {scorePresentation.label} {scoreChangeLabel(scoreChange)}</span>
        </div>
        <div className="phase2-subpage-actions"><button type="button" onClick={onOpenOverview}>返回报告概览</button></div>
      </header>

      <div className="phase2-recheck-layout">
        <div>
          <section className="phase2-recheck-score-card">
            <header><h2>评分变化</h2><p>人工修改后内容的可信度重新评估</p></header>
            <div className="phase2-recheck-score-change">
              <div><span>Before</span><strong><AnimatedNumber value={baseline.totalScore} duration={620} /></strong><small>/100</small></div>
              <ArrowRight aria-hidden="true" />
              <div className={`is-change ${scorePresentation.className}`}><strong><AnimatedNumber value={scoreChange} duration={520} delay={360} showSign /></strong><span>{scorePresentation.label}</span></div>
              <div className="is-after"><span>After</span><strong><AnimatedNumber value={current.totalScore} from={baseline.totalScore} duration={760} delay={180} /></strong><small>/100</small></div>
            </div>
            <p>{scoreChange > 0 ? "来源引用与 Evidence 关联完成补强，整体可信度重新计算完成。" : scoreChange < 0 ? "重新验证后评分下降，建议回到 Evidence 与 Diagnosis 核对新增缺口。" : "重新验证完成，整体评分保持稳定。"}</p>
          </section>

          <section className="phase2-recheck-metrics">
            <h2>指标变化</h2>
            <div>
              {dimensionCards.map(({ key, label, icon: Icon, description }) => {
                const before = baseline.dimensions[key].score;
                const after = current.dimensions[key].score;
                const change = after - before;
                const presentation = changePresentation(change);
                return (
                  <article key={key} className={presentation.className}>
                    <header><Icon aria-hidden="true" /><strong>{label}</strong></header>
                    <div><b>{scoreChangeLabel(change)}</b><span>{presentation.label}</span></div>
                    <p>{change > 0 ? description : change < 0 ? "该维度评分下降，建议复核本轮修改。" : "该维度评分保持稳定。"}</p>
                    <small>{before} <ArrowRight aria-hidden="true" /> {after}</small>
                  </article>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="phase2-recheck-summary">
          <h2>改进总结</h2>
          <div className={`phase2-recheck-summary-title ${scorePresentation.className}`}><SummaryIcon aria-hidden="true" /><strong>{summaryTitle}</strong></div>
          <p>{summaryDescription}</p>
          <ul>{summaryItems.map((item) => <li key={item}><CheckCircle2 aria-hidden="true" />{item}</li>)}</ul>
          <span>{improvedIssueCount} 项问题改善 · 复核完成</span>
          <button type="button" onClick={onOpenOverview}>查看完整报告</button>
        </aside>
      </div>

      <footer className="phase2-recheck-evidence-first"><ShieldCheck aria-hidden="true" /><strong>Evidence First</strong><span>每项评分变化均可追溯至应用的 Patch 与来源。</span></footer>
    </section>
  );
}
