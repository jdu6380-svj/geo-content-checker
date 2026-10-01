"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, Circle, Scale } from "lucide-react";

import { ReportDimensionLedger } from "@/components/report-dimension-ledger";
import { ReportNavigationPanel } from "@/components/report-navigation-panel";
import { ReportScoreRail, type ReportScoreBand } from "@/components/report-score-rail";
import {
  getReportIssueStatus,
  summarizeReportIssueStatuses,
} from "@/lib/client/report-comparison";
import type { DiagnosticsState, LoadState } from "@/lib/client/report-state";
import type { EvaluateScoringResponse } from "@/lib/schemas/geo";

type ReportContextRailProps = {
  title: string;
  reportStatus: {
    label: string;
    className: string;
  };
  scoring: LoadState<EvaluateScoringResponse>;
  scoreBand: ReportScoreBand | null;
  diagnostics: DiagnosticsState;
  questionOrder: string[];
  announceLoading: boolean;
  canRetry: boolean;
  onRetryScoring: () => void;
  onFocusQuestion: (question: string) => void;
  onScrollToSection: (sectionId: string) => void;
  completedCount: number;
  evidenceCount: number;
  contentAvailable: boolean;
  restoredFromCache: boolean;
  analysisSettled: boolean;
  analysisSucceeded: boolean;
  hasRecheckBaseline: boolean;
  onBackToEditor: () => void;
};

const RISK_PRIORITY = { passed: 1, attention: 2, high: 3 } as const;

const RISK_META = {
  passed: {
    label: "低风险",
    shortLabel: "低",
    className: "is-success",
    impact: "内容已具备较完整的事实与结构基础，发布前建议继续核对引用边界。",
  },
  attention: {
    label: "中风险",
    shortLabel: "中",
    className: "is-warning",
    impact: "整体具备可信基础，建议优先补齐来源与证据关联。",
  },
  high: {
    label: "高风险",
    shortLabel: "高",
    className: "is-danger",
    impact: "关键信息不足可能影响可信判断，建议在发布前优先处理。",
  },
} as const;

const PENDING_RISK = {
  label: "待确认",
  shortLabel: "待确认",
  className: "is-warning",
  impact: "部分问题尚未完成诊断，当前风险等级待确认。",
} as const;

export function ReportContextRail({
  title,
  reportStatus,
  scoring,
  scoreBand,
  diagnostics,
  questionOrder,
  announceLoading,
  canRetry,
  onRetryScoring,
  onScrollToSection,
  completedCount,
  contentAvailable,
  restoredFromCache,
  analysisSettled,
  analysisSucceeded,
  hasRecheckBaseline,
  onBackToEditor,
}: ReportContextRailProps) {
  const diagnosticItems = questionOrder.flatMap((question) => {
    const item = diagnostics[question];
    return item?.status === "success" && item.data ? [item.data] : [];
  });
  const riskItems = diagnosticItems.filter((item) => getReportIssueStatus(item) !== "passed");
  const failedCount = questionOrder.filter((question) => diagnostics[question]?.status === "error").length;
  const riskSummary = summarizeReportIssueStatuses(diagnosticItems);
  const priorityItem = diagnosticItems.reduce<(typeof diagnosticItems)[number] | null>(
    (current, item) => (
      !current || RISK_PRIORITY[getReportIssueStatus(item)] > RISK_PRIORITY[getReportIssueStatus(current)]
        ? item
        : current
    ),
    null,
  );
  const hasIncompleteDiagnostics = analysisSettled && !analysisSucceeded;
  const priorityRisk = hasIncompleteDiagnostics
    ? priorityItem && getReportIssueStatus(priorityItem) === "high"
      ? RISK_META.high
      : priorityItem && getReportIssueStatus(priorityItem) === "attention"
        ? RISK_META.attention
        : PENDING_RISK
    : priorityItem
      ? RISK_META[getReportIssueStatus(priorityItem)]
      : PENDING_RISK;
  const pendingCount = diagnosticItems.filter((item) => item.evidenceStatus === "missing").length;
  const primaryProblems = riskItems.slice(0, 2).map((item) => item.question);

  return (
    <section id="report-core" className="phase2-report-overview section-anchor">
      <header className="phase2-report-page-header">
        <div>
          <p className="phase2-breadcrumb">我的审查 <span>/</span> Report Overview</p>
          <h1>内容可信度审查报告</h1>
          <p className="phase2-report-article">文章：{title || "未命名内容"}</p>
          <span className="phase2-report-complete-copy">
            {restoredFromCache
              ? reportStatus.label
              : analysisSucceeded
                ? "分析已完成"
                : analysisSettled
                  ? "分析部分完成"
                  : "分析进行中"} · Evidence First
          </span>
        </div>
        <div className="phase2-report-stat-strip" aria-label="报告状态摘要">
          <span className="is-danger"><AlertTriangle aria-hidden="true" />{riskSummary.high} 项高风险</span>
          <span className="is-warning"><Circle aria-hidden="true" />{riskSummary.attention} 项注意</span>
          <span className="is-success"><CheckCircle2 aria-hidden="true" />{riskSummary.passed} 项已通过</span>
          {failedCount ? <span className="is-warning"><AlertTriangle aria-hidden="true" />{failedCount} 项分析失败</span> : null}
        </div>
      </header>

      <div className="phase2-report-layout">
        <div className="phase2-report-main">
          <section className="phase2-report-hero-card">
            <ReportScoreRail
              scoring={scoring}
              announceLoading={announceLoading}
              canRetry={canRetry}
              onRetry={onRetryScoring}
            />
            <div className="phase2-report-risk">
              <span>风险等级</span>
              <strong className={priorityRisk.className}>{priorityRisk.label}</strong>
            </div>
            <div className="phase2-report-conclusion">
              <p>结论</p>
              <strong>{hasIncompleteDiagnostics ? "部分诊断未完成" : scoreBand?.label || primaryProblems[0] || "当前未发现明显高风险问题"}</strong>
              <p>{hasIncompleteDiagnostics ? "部分问题未能完成诊断；重试成功后才能生成修改建议。" : priorityRisk.impact}</p>
              <span className="phase2-report-evidence-progress">已完成 {completedCount} 项 Evidence 检查</span>
            </div>
          </section>

          {scoring.status === "success" ? <ReportDimensionLedger report={scoring.data} /> : null}

          <section className="phase2-evidence-first-callout">
            <div>
              <span aria-hidden="true"><Scale /></span>
              <p><strong>Evidence First</strong> · 每项结论均建立在可核验的证据与来源之上。</p>
              <small>优先查看来源透明度与可验证性中的待补充项。</small>
            </div>
            <button type="button" onClick={() => onScrollToSection("evidence-section")}>
              查看 Evidence 分析 <ArrowRight aria-hidden="true" />
            </button>
          </section>
        </div>

        <ReportNavigationPanel
          activeView="overview"
          evidencePendingCount={pendingCount}
          diagnosisIssueCount={riskItems.length + failedCount}
          patchCount={Math.min(riskItems.length, 3)}
          recheckLabel={contentAvailable ? "待复核" : "暂无正文"}
          analysisComplete={analysisSucceeded}
          analysisSettled={analysisSettled}
          patchAvailable={analysisSucceeded}
          recheckAvailable={analysisSucceeded && contentAvailable}
          onNavigate={(view) => {
            if (view === "overview") return;
            if (view === "evidence") onScrollToSection("evidence-section");
            if (view === "diagnosis") onScrollToSection("diagnostic-section");
            if (view === "patch") onScrollToSection("patch-workshop");
            if (view === "recheck") {
              if (hasRecheckBaseline) onScrollToSection("recheck-comparison");
              else onBackToEditor();
            }
          }}
        />
      </div>
    </section>
  );
}
