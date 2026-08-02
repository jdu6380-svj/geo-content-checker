import { AlertTriangle, CheckCircle2, CircleSlash2 } from "lucide-react";

import type { EvidenceStatus } from "@/lib/schemas/geo";

const EVIDENCE_STATUS = {
  valid: {
    label: "证据已验证",
    className: "status-success",
    icon: CheckCircle2,
  },
  missing: {
    label: "缺少证据",
    className: "status-warning",
    icon: CircleSlash2,
  },
  invalid: {
    label: "证据无效",
    className: "status-danger",
    icon: AlertTriangle,
  },
} as const;

export function EvidenceStatusBadge({ status }: { status: EvidenceStatus }) {
  const presentation = EVIDENCE_STATUS[status];
  const Icon = presentation.icon;

  return (
    <span className={`status-badge inline-flex items-center gap-1.5 border px-2.5 py-1 text-xs font-semibold ${presentation.className}`}>
      <Icon aria-hidden="true" className="size-3.5" />
      {presentation.label}
    </span>
  );
}
