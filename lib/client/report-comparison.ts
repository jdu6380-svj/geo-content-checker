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

export function isReportIssue(item: ReportComparisonDiagnostic): boolean {
  return (
    item.answerability !== "可以完全回答" ||
    item.riskLevel !== "low" ||
    item.evidenceStatus !== "valid"
  );
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
