import type { EvidenceStatus } from "@/lib/schemas/geo";

const EVIDENCE_STATUS = {
  valid: {
    label: "有效",
    className: "status-success",
  },
  missing: {
    label: "缺失",
    className: "status-warning",
  },
  invalid: {
    label: "无效",
    className: "status-danger",
  },
} as const;

export function EvidenceStatusBadge({ status }: { status: EvidenceStatus }) {
  const presentation = EVIDENCE_STATUS[status];

  return (
    <span className={`evidence-status-label ${presentation.className}`}>{presentation.label}</span>
  );
}
