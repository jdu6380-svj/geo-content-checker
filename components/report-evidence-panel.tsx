import { Check, ChevronDown, Files, MapPin, ShieldAlert } from "lucide-react";

import { EvidenceStatusBadge } from "@/components/evidence-status-badge";
import type { DiagnosticsState } from "@/lib/client/report-state";

type ReportEvidencePanelProps = {
  diagnostics: DiagnosticsState;
  questionOrder: string[];
  restoredFromCache: boolean;
};

const STATUS_DETAIL = {
  valid: "已通过原文逐字校验",
  missing: "原文缺少足够依据",
  invalid: "未通过逐字校验",
} as const;

const STATUS_VALUE = {
  valid: "支持该诊断结论",
  missing: "需要补充可核验来源",
  invalid: "当前引用未通过原文校验",
} as const;

export function ReportEvidencePanel({
  diagnostics,
  questionOrder,
  restoredFromCache,
}: ReportEvidencePanelProps) {
  const records = questionOrder.flatMap((question, index) => {
    const item = diagnostics[question];
    return item?.data ? [{ order: index + 1, data: item.data }] : [];
  });
  const pending = Object.values(diagnostics).some(
    (item) => item.status === "queued" || item.status === "loading",
  );
  const counts = records.reduce(
    (result, record) => ({
      ...result,
      [record.data.evidenceStatus]: result[record.data.evidenceStatus] + 1,
    }),
    { valid: 0, missing: 0, invalid: 0 },
  );
  const literalEvidenceCount = records.reduce(
    (count, record) => count + new Set(
      record.data.evidence.map((entry) => `${entry.paragraphId}:${entry.quote}`),
    ).size,
    0,
  );
  return (
    <section id="evidence-section" className="report-evidence-panel section-anchor min-w-0">
      <div className="report-section-heading">
        <div>
          <p className="section-kicker">可信度依据</p>
          <h2>为什么这样判断</h2>
        </div>
        <div className="evidence-header-summary">
          <span><Files aria-hidden="true" className="size-4" />{literalEvidenceCount} 条原文引用</span>
          <span className="evidence-count-valid">有效 {counts.valid}</span>
          <span className="evidence-count-missing">缺失 {counts.missing}</span>
          <span className="evidence-count-invalid">无效 {counts.invalid}</span>
        </div>
      </div>

      {records.length ? (
        <ol className="evidence-ledger-list">
            {records.map(({ order, data }) => {
              const evidence = Array.from(
                new Map(
                  data.evidence.map((entry) => [
                    `${entry.paragraphId}:${entry.quote}`,
                    entry,
                  ]),
                ).values(),
              );
              const locations = Array.from(new Set(evidence.map((entry) => entry.paragraphId)));
              const ledgerId = `EV-${String(order).padStart(2, "0")}`;

              return (
                <li key={`${ledgerId}-${data.question}`} className={`evidence-ledger-row evidence-card-status-${data.evidenceStatus}`}>
                  <details className="evidence-record" open={order === 1}>
                    <summary className="evidence-card-header">
                      <span className="report-ledger-index">{ledgerId}</span>
                      <span className="evidence-card-title-group">
                        <span className="evidence-card-label">判断依据 {String(order).padStart(2, "0")}</span>
                        <strong>{data.question}</strong>
                      </span>
                      <span className="evidence-card-status"><EvidenceStatusBadge status={data.evidenceStatus} /></span>
                      <ChevronDown aria-hidden="true" className="evidence-card-expand size-4" />
                    </summary>
                    <div className="evidence-card-body">
                      <div className="evidence-card-main">
                        <span className="evidence-card-field">原文依据</span>
                        {evidence.length ? (
                          <div className="evidence-quote-list">
                            {evidence.map((entry) => (
                              <blockquote key={`${entry.paragraphId}:${entry.quote}`}>
                                <span className="evidence-quote-location">原文 · {entry.paragraphId}</span>
                                {entry.quote}
                              </blockquote>
                            ))}
                          </div>
                        ) : (
                          <p className="evidence-card-empty">
                            {restoredFromCache
                              ? "缓存报告保留校验状态，但不保留原文逐字引用。"
                              : data.evidenceStatus === "missing"
                                ? "该诊断没有可展示的原文依据。"
                                : "未保留可作为依据的有效引用。"}
                          </p>
                        )}
                      </div>
                      <div className="evidence-card-guidance">
                        <div>
                          <span>为什么这样判断</span>
                          <strong>{STATUS_VALUE[data.evidenceStatus]}</strong>
                        </div>
                        <div>
                          <span>建议怎么处理</span>
                          <strong>{data.recommendation}</strong>
                        </div>
                      </div>
                      <details className="evidence-audit-details">
                        <summary>
                          查看详细校验记录
                          <ChevronDown aria-hidden="true" className="size-4" />
                        </summary>
                        <dl className="evidence-card-meta">
                          <div>
                            <dt><MapPin aria-hidden="true" className="size-3.5" />原文位置</dt>
                            <dd>{locations.length ? locations.join("、") : "无可定位段落"}</dd>
                          </div>
                          <div>
                            <dt>{data.evidenceStatus === "valid" ? <Check aria-hidden="true" className="size-3.5" /> : <ShieldAlert aria-hidden="true" className="size-3.5" />}校验结果</dt>
                            <dd>{STATUS_DETAIL[data.evidenceStatus]}</dd>
                          </div>
                        </dl>
                      </details>
                    </div>
                  </details>
                </li>
              );
            })}
        </ol>
      ) : pending || Object.keys(diagnostics).length === 0 ? (
        <div role="status" aria-live="polite" className="grid gap-3 px-4 py-5 sm:px-5">
          <span className="h-3 w-20 animate-pulse rounded bg-[var(--geo-surface-inset)] motion-reduce:animate-none" />
          <span className="h-3 w-full animate-pulse rounded bg-[var(--geo-surface-subtle)] motion-reduce:animate-none" />
          <span className="h-3 w-4/5 animate-pulse rounded bg-[var(--geo-surface-subtle)] motion-reduce:animate-none" />
        </div>
      ) : (
        <p className="px-4 py-5 text-sm leading-6 text-[var(--geo-text-muted)] sm:px-5">
          当前报告没有可展示的诊断证据。
        </p>
      )}
    </section>
  );
}
