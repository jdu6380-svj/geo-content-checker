import type { DiagnosticsState } from "./report-state.ts";
import type { EvaluateScoringResponse, EvidenceStatus } from "../schemas/geo.ts";

export const REPORT_DIMENSION_KEYS = [
  "questionCoverage",
  "factCompleteness",
  "structureClarity",
  "freshness",
] as const;

export type ReportDimensionKey = (typeof REPORT_DIMENSION_KEYS)[number];

export type ReportComparisonDiagnostic = {
  question: string;
  answerability: "可以完全回答" | "信息不足" | "有风险";
  riskLevel: "low" | "medium" | "high";
  evidenceStatus: EvidenceStatus;
};

export type ReportComparisonSnapshot = {
  totalScore: number;
  dimensions: Record<ReportDimensionKey, { score: number; max: number }>;
  diagnostics: ReportComparisonDiagnostic[];
};

export type ReportIssueStatus = "high" | "attention" | "passed";

export type ReportIssueSummary = Record<ReportIssueStatus, number>;

export function isReportIssue(item: ReportComparisonDiagnostic): boolean {
  return (
    item.answerability !== "可以完全回答" ||
    item.riskLevel !== "low" ||
    item.evidenceStatus !== "valid"
  );
}

export function getReportIssueStatus(item: ReportComparisonDiagnostic): ReportIssueStatus {
  if (
    item.riskLevel === "high" ||
    item.answerability === "有风险" ||
    item.evidenceStatus === "invalid"
  ) {
    return "high";
  }

  return isReportIssue(item) ? "attention" : "passed";
}

export function summarizeReportIssueStatuses(
  items: ReportComparisonDiagnostic[],
): ReportIssueSummary {
  return items.reduce<ReportIssueSummary>((summary, item) => {
    summary[getReportIssueStatus(item)] += 1;
    return summary;
  }, { high: 0, attention: 0, passed: 0 });
}

export function createReportComparisonSnapshot(
  scoring: EvaluateScoringResponse,
  questionOrder: string[],
  diagnostics: DiagnosticsState,
): ReportComparisonSnapshot {
  return {
    totalScore: scoring.totalScore,
    dimensions: Object.fromEntries(
      REPORT_DIMENSION_KEYS.map((key) => [
        key,
        {
          score: scoring.dimensions[key].score,
          max: scoring.dimensions[key].max,
        },
      ]),
    ) as ReportComparisonSnapshot["dimensions"],
    diagnostics: questionOrder.flatMap((question) => {
      const item = diagnostics[question];
      if (item?.status !== "success" || !item.data) return [];

      return [{
        question,
        answerability: item.data.answerability,
        riskLevel: item.data.riskLevel,
        evidenceStatus: item.data.evidenceStatus,
      }];
    }),
  };
}
