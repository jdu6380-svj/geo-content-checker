"use client";

import {
  CheckCircle2,
  CircleHelp,
  FileText,
  Lightbulb,
  Link2,
  RotateCcw,
} from "lucide-react";

export type ReportNavigationView = "overview" | "evidence" | "diagnosis" | "patch" | "recheck";

type ReportNavigationPanelProps = {
  activeView: ReportNavigationView;
  evidencePendingCount: number;
  diagnosisIssueCount: number;
  patchCount: number;
  recheckLabel: string;
  analysisComplete: boolean;
  analysisSettled?: boolean;
  patchAvailable?: boolean;
  recheckAvailable: boolean;
  showStatus?: boolean;
  title?: string;
  onNavigate: (view: ReportNavigationView) => void;
};

const NAVIGATION_ITEMS = [
  { id: "overview", label: "概览", icon: FileText },
  { id: "evidence", label: "Evidence", icon: Link2 },
  { id: "diagnosis", label: "Diagnosis", icon: CircleHelp },
  { id: "patch", label: "Patch", icon: Lightbulb },
  { id: "recheck", label: "Recheck", icon: RotateCcw },
] as const;

export function ReportNavigationPanel({
  activeView,
  evidencePendingCount,
  diagnosisIssueCount,
  patchCount,
  recheckLabel,
  analysisComplete,
  analysisSettled = analysisComplete,
  patchAvailable = analysisComplete,
  recheckAvailable,
  showStatus = true,
  title = "报告导航",
  onNavigate,
}: ReportNavigationPanelProps) {
  const meta: Record<ReportNavigationView, string> = {
    overview: activeView === "overview" ? "当前" : "查看",
    evidence: evidencePendingCount ? `${evidencePendingCount} 项待补充` : "已核对",
    diagnosis: diagnosisIssueCount ? `${diagnosisIssueCount} 个问题` : "已通过",
    patch: patchCount ? `${patchCount} 项建议` : "查看建议",
    recheck: recheckLabel,
  };

  return (
    <aside className="phase2-report-navigation" aria-label={title}>
      <h2>{title}</h2>
      <nav>
        {NAVIGATION_ITEMS.map(({ id, label, icon: Icon }, index) => {
          const disabled = (id === "patch" && !patchAvailable) ||
            (id === "recheck" && !recheckAvailable);
          const disabledReason = id === "patch" && !patchAvailable
            ? "诊断完成后可用"
            : id === "recheck" && !recheckAvailable
              ? (recheckLabel === "暂无正文" ? "完成报告并保留正文后可用" : "分析完成后可用")
              : null;
          const active = activeView === id;
          return (
            <button
              key={id}
              type="button"
              className={active ? "is-active" : ""}
              aria-current={active ? "page" : undefined}
              aria-label={disabledReason ? `${label}（${disabledReason}）` : label}
              title={disabledReason ?? undefined}
              disabled={disabled}
              onClick={() => onNavigate(id)}
            >
              <span className="phase2-report-navigation-icon"><Icon aria-hidden="true" /></span>
              <span className="phase2-report-navigation-label">
                <b>{String(index + 1).padStart(2, "0")}</b>
                {label}
              </span>
              <small>{disabledReason ?? meta[id]}</small>
            </button>
          );
        })}
      </nav>
      {showStatus ? (
        <div className={`phase2-report-navigation-status ${analysisComplete ? "is-complete" : analysisSettled ? "is-partial" : ""}`}>
          <CheckCircle2 aria-hidden="true" />
          <span>{analysisComplete ? "分析已完成" : analysisSettled ? "分析部分完成" : "分析进行中"}</span>
        </div>
      ) : null}
    </aside>
  );
}
