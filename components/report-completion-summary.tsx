"use client";

import {
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  Link2,
  RotateCcw,
  Wrench,
} from "lucide-react";

import { ReportNavigationPanel, type ReportNavigationView } from "@/components/report-navigation-panel";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { isReportIssue, type ReportComparisonSnapshot } from "@/lib/client/report-comparison";
import type { DiagnosticsState } from "@/lib/client/report-state";
import type { EvaluateScoringResponse } from "@/lib/schemas/geo";

type ReportCompletionSummaryProps = {
  title: string;
  scoring: EvaluateScoringResponse;
  diagnostics: DiagnosticsState;
  questionOrder: string[];
  baseline: ReportComparisonSnapshot;
  current: ReportComparisonSnapshot;
  onNavigate: (view: ReportNavigationView) => void;
};

export function ReportCompletionSummary({
  title,
  scoring,
  diagnostics,
  questionOrder,
  baseline,
  current,
  onNavigate,
}: ReportCompletionSummaryProps) {
  const diagnosticItems = questionOrder.flatMap((question) => {
    const item = diagnostics[question];
    return item?.data ? [item.data] : [];
  });
  const validCount = diagnosticItems.filter((item) => item.evidenceStatus === "valid").length;
  const pendingCount = diagnosticItems.filter((item) => item.evidenceStatus !== "valid").length;
  const issueCount = current.diagnostics.filter(isReportIssue).length;
  const baselineIssueCount = baseline.diagnostics.filter(isReportIssue).length;
  const resolvedCount = Math.max(0, baselineIssueCount - issueCount);
  const highRiskCount = diagnosticItems.filter((item) => item.riskLevel === "high").length;
  const riskLabel = highRiskCount ? "高风险" : issueCount ? "中风险" : "低风险";
  const riskClassName = highRiskCount ? "is-danger" : issueCount ? "is-warning" : "is-success";
  const scoreChange = current.totalScore - baseline.totalScore;
  const scoreChangeLabel = scoreChange > 0 ? "提升" : scoreChange < 0 ? "下降" : "持平";
  const scoreChangeClassName = scoreChange > 0 ? "is-success" : scoreChange < 0 ? "is-danger" : "is-neutral";
  const highlightedQuestions = diagnosticItems.slice(0, 2).map((item) => item.question);

  return (
    <section id="report-core" className="phase2-complete-report section-anchor">
      <header className="phase2-complete-report-header">
        <p className="phase2-breadcrumb">我的审查 <span>/</span> 报告详情</p>
        <div><h1>内容可信度审查报告</h1><span>已完成</span></div>
        <p>文章：{title || "未命名内容"}</p>
        <small>最终审查完成 · 基于 Evidence First 原则，逐项核验观点、证据与来源。</small>
      </header>

      <div className="phase2-report-layout">
        <div className="phase2-complete-main">
          <div className="phase2-complete-hero">
            <section>
              <span>可信度评分</span>
              <div><strong><AnimatedNumber value={scoring.totalScore} from={baseline.totalScore} /></strong><small>/100</small></div>
              <p>Patch 已应用并完成重新验证，内容可信度已重新评估。</p>
              <span>{validCount} 项已验证 · {pendingCount} 项待跟进 · {highRiskCount} 项高风险</span>
              <b>Before {baseline.totalScore} <span>→</span> After {current.totalScore} · {scoreChangeLabel} <em className={scoreChangeClassName}>{scoreChange > 0 ? `+${scoreChange}` : scoreChange}</em></b>
            </section>
            <section>
              <h2>风险总结</h2>
              <p>风险等级 · <strong className={riskClassName}>{riskLabel}</strong></p>
              <b>原发现 {baselineIssueCount} 个可信度问题</b>
              <span>{resolvedCount} 项已解决 · {issueCount} 项待跟进 · {diagnosticItems.length - issueCount} 项通过</span>
              <small>{highlightedQuestions[0] || "主要风险已完成复核"}</small>
            </section>
          </div>

          <div className="phase2-complete-sections">
            <button type="button" onClick={() => onNavigate("evidence")}>
              <span className="is-success"><FileCheck2 aria-hidden="true" /></span>
              <strong>Evidence 证据分析<small>{questionOrder.length} 个关键观点 · {validCount} 项已验证 · {pendingCount} 项待补充</small></strong>
              <p>{highlightedQuestions.map((question) => <span key={question}>· {question}</span>)}</p>
              <b>查看全部 Evidence</b>
            </button>
            <button type="button" onClick={() => onNavigate("diagnosis")}>
              <span className="is-warning"><AlertTriangle aria-hidden="true" /></span>
              <strong>Diagnosis 问题诊断<small>{questionOrder.length} 个问题 · {resolvedCount} 项已解决 · {issueCount} 项待跟进</small></strong>
              <p>{highlightedQuestions.map((question) => <span key={question}>· {question}</span>)}</p>
              <b>查看 Diagnosis</b>
            </button>
            <button type="button" onClick={() => onNavigate("patch")}>
              <span className="is-success"><Wrench aria-hidden="true" /></span>
              <strong>Patch 修复建议<small>{Math.max(resolvedCount, 1)} 项建议 · 已完成人工应用流程</small></strong>
              <p><span>· 补充可核验来源</span><span>· 建立观点与 Evidence 对应</span></p>
              <b>查看 Patch 记录</b>
            </button>
            <button type="button" onClick={() => onNavigate("recheck")}>
              <span className="is-info"><RotateCcw aria-hidden="true" /></span>
              <strong>Recheck 重新验证结果<small>Before {baseline.totalScore} → After {current.totalScore}</small></strong>
              <p><span className={scoreChangeClassName}>{scoreChange > 0 ? `+${scoreChange}` : scoreChange}</span><span>评分变化均可追溯至应用的 Patch 与来源。</span></p>
              <b>查看 Recheck 详情</b>
            </button>
          </div>
        </div>

        <div className="phase2-complete-rail">
          <ReportNavigationPanel
            activeView="overview"
            evidencePendingCount={pendingCount}
            diagnosisIssueCount={issueCount}
            patchCount={Math.max(resolvedCount, 1)}
            recheckLabel={`${scoreChange > 0 ? `+${scoreChange}` : scoreChange} 已完成`}
            analysisComplete
            recheckAvailable
            showStatus={false}
            title="报告目录"
            onNavigate={onNavigate}
          />
          <div className="phase2-complete-stamp"><CheckCircle2 aria-hidden="true" /><strong>报告已完成</strong><span>Evidence First · 全程透明可追溯</span></div>
        </div>
      </div>
    </section>
  );
}
