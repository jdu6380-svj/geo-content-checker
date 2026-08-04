import type { EvaluateScoringResponse } from "@/lib/schemas/geo";

type ReportDimensionLedgerProps = {
  report: EvaluateScoringResponse;
};

const DIMENSIONS = [
  { key: "questionCoverage", label: "问题覆盖度", icon: "Q", direction: "补充 FAQ 与读者问题拆解" },
  { key: "factCompleteness", label: "事实完整度", icon: "F", direction: "补充数据、来源与适用边界" },
  { key: "structureClarity", label: "结构清晰度", icon: "S", direction: "拆分信息层级并明确结论与步骤" },
  { key: "freshness", label: "时效性", icon: "T", direction: "补充发布日期、版本与时效边界" },
] as const;

export function ReportDimensionLedger({ report }: ReportDimensionLedgerProps) {
  return (
    <section className="report-dimension-ledger" aria-labelledby="dimension-ledger-heading">
      <div className="report-section-heading">
        <div>
          <p className="section-kicker">评分维度</p>
          <h2 id="dimension-ledger-heading">四项评分如何构成结论</h2>
        </div>
        <span>合计 100 分</span>
      </div>

      <ol className="report-dimension-cards">
          {DIMENSIONS.map(({ key, label, icon, direction }, index) => {
            const dimension = report.dimensions[key];
            const percentage = Math.round((dimension.score / dimension.max) * 100);
            return (
              <li key={key} className="report-dimension-card">
                <div className="report-dimension-card-heading">
                  <span className="report-dimension-icon">{icon}</span>
                  <span>
                    <span className="report-dimension-index">{String(index + 1).padStart(2, "0")}</span>
                    <strong>{label}</strong>
                  </span>
                </div>
                <div className="report-dimension-score">
                  <strong>{dimension.score}</strong>
                  <span>/ {dimension.max}</span>
                </div>
                <div className="report-dimension-meter" aria-label={`${label} ${percentage}%`}>
                  <span>{percentage}%</span>
                  <div className="metric-track"><div style={{ width: `${percentage}%` }} /></div>
                </div>
                <p className="report-dimension-reason">{dimension.reason}</p>
                <p className="report-dimension-direction"><span>优化方向</span>{direction}</p>
              </li>
            );
          })}
      </ol>
    </section>
  );
}
