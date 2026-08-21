import { FileCheck2, Link2, Network, ShieldCheck } from "lucide-react";

import type { EvaluateScoringResponse } from "@/lib/schemas/geo";

type ReportDimensionLedgerProps = {
  report: EvaluateScoringResponse;
};

const DIMENSIONS = [
  { key: "questionCoverage", label: "问题覆盖度", icon: FileCheck2 },
  { key: "factCompleteness", label: "事实完整度", icon: Link2 },
  { key: "structureClarity", label: "结构清晰度", icon: Network },
  { key: "freshness", label: "可验证性", icon: ShieldCheck },
] as const;

export function ReportDimensionLedger({ report }: ReportDimensionLedgerProps) {
  return (
    <section className="phase2-dimension-section" aria-labelledby="dimension-ledger-heading">
      <div className="phase2-section-heading">
        <h2 id="dimension-ledger-heading">维度评分</h2>
      </div>

      <ol className="phase2-dimension-grid">
          {DIMENSIONS.map(({ key, label, icon: Icon }) => {
            const dimension = report.dimensions[key];
            const percentage = Math.round((dimension.score / dimension.max) * 100);
            const status = percentage >= 85
              ? { label: "已验证", className: "is-success" }
              : percentage >= 65
                ? { label: "待补充", className: "is-warning" }
                : { label: "需关注", className: "is-danger" };
            return (
              <li key={key} className="phase2-dimension-card">
                <div className="phase2-dimension-title">
                  <span><Icon aria-hidden="true" /></span>
                  <strong>{label}</strong>
                </div>
                <div className="phase2-dimension-score">
                  <strong>{dimension.score}</strong>
                  <span>/{dimension.max === 35 || dimension.max === 30 || dimension.max === 20 || dimension.max === 15 ? dimension.max : 100}</span>
                </div>
                <span className={`phase2-dimension-status ${status.className}`}>{status.label}</span>
                <p>{dimension.reason}</p>
              </li>
            );
          })}
      </ol>
    </section>
  );
}
