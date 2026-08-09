"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, Circle, Scale } from "lucide-react";

import { ReportDimensionLedger } from "@/components/report-dimension-ledger";
import { ReportNavigationPanel } from "@/components/report-navigation-panel";
import { ReportScoreRail, type ReportScoreBand } from "@/components/report-score-rail";
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
  onBackToEditor: () => void;
};

const RISK_PRIORITY = { low: 1, medium: 2, high: 3 } as const;

const RISK_META = {
  low: {
    label: "低风险",
    shortLabel: "低",
    className: "is-success",
    impact: "内容已具备较完整的事实与结构基础，发布前建议继续核对引用边界。",
  },
  medium: {
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
}: ReportContextRailProps) {
  const diagnosticItems = questionOrder.flatMap((question) => {
    const item = diagnostics[question];
    return item?.status === "success" && item.data ? [item.data] : [];
  });
  const riskItems = diagnosticItems.filter((item) => (
    item.riskLevel !== "low" || item.evidenceStatus !== "valid" || item.answerability !== "可以完全回答"
  ));
  const priorityItem = diagnosticItems.reduce<(typeof diagnosticItems)[number] | null>(
    (current, item) => (
      !current || RISK_PRIORITY[item.riskLevel] > RISK_PRIORITY[current.riskLevel] ? item : current
    ),
    null,
  );
  const priorityRisk = priorityItem ? RISK_META[priorityItem.riskLevel] : RISK_META.low;
  const verifiedCount = diagnosticItems.filter((item) => item.evidenceStatus === "valid").length;
  const pendingCount = diagnosticItems.filter((item) => item.evidenceStatus === "missing").length;
  const riskCount = diagnosticItems.filter((item) => item.evidenceStatus === "invalid" || item.riskLevel === "high").length;
  const primaryProblems = riskItems.slice(0, 2).map((item) => item.question);

  return (
    <section id="report-core" className="phase2-report-overview section-anchor">
      <header className="phase2-report-page-header">
        <div>
          <p className="phase2-breadcrumb">我的审查 <span>/</span> Report Overview</p>
          <h1>内容可信度审查报告</h1>
          <p className="phase2-report-article">文章：{title || "未命名内容"}</p>
          <span className="phase2-report-complete-copy">
            {restoredFromCache ? reportStatus.label : "分析已完成"} · Evidence First
          </span>
        </div>
        <div className="phase2-report-stat-strip" aria-label="报告状态摘要">
          <span className="is-success"><CheckCircle2 aria-hidden="true" />{verifiedCount} 项已验证</span>
          <span className="is-warning"><Circle aria-hidden="true" />{pendingCount} 项待补充</span>
          <span className="is-danger"><AlertTriangle aria-hidden="true" />{riskCount} 项风险</span>
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
              <strong>{scoreBand?.label || primaryProblems[0] || "当前未发现明显高风险问题"}</strong>
              <p>{priorityRisk.impact}</p>
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
          diagnosisIssueCount={riskItems.length}
          patchCount={Math.min(riskItems.length, 3)}
          recheckLabel={contentAvailable ? "待复核" : "暂无正文"}
          analysisComplete={diagnosticItems.length > 0 && completedCount === diagnosticItems.length}
          recheckAvailable={contentAvailable}
          onNavigate={(view) => {
            if (view === "overview") return;
            if (view === "evidence") onScrollToSection("evidence-section");
            if (view === "diagnosis") onScrollToSection("diagnostic-section");
            if (view === "patch") onScrollToSection("patch-workshop");
            if (view === "recheck") onScrollToSection("recheck-comparison");
          }}
        />
      </div>
    </section>
  );
}
