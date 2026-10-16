import type { ReportIssueStatus } from "./report-comparison.ts";

export type PatchChecklistItem = {
  id: string;
  /** Report hash that produced this checklist item. Optional for legacy data. */
  sourceReportHash?: string;
  title: string;
  recommendation: string;
  location: string;
  status: ReportIssueStatus;
};
