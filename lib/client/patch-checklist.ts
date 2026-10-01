import type { ReportIssueStatus } from "./report-comparison.ts";

export type PatchChecklistItem = {
  id: string;
  title: string;
  recommendation: string;
  location: string;
  status: ReportIssueStatus;
};
