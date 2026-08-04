import { Files } from "lucide-react";

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
    <section id="evidence-section" className="report-evidence-panel section-anchor surface-flat min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--geo-border)] px-4 py-4 sm:px-6">
        <div>
          <p className="section-kicker">可审计依据</p>
          <h2 className="geo-heading mt-1.5 text-xl font-semibold">原文证据账本</h2>
        </div>
        <div className="evidence-header-summary">
          <span><Files aria-hidden="true" className="size-4" />{literalEvidenceCount} 条逐字引用</span>
          <span className="evidence-count-valid">有效 {counts.valid}</span>
          <span className="evidence-count-missing">缺失 {counts.missing}</span>
          <span className="evidence-count-invalid">无效 {counts.invalid}</span>
        </div>
      </div>

      {records.length ? (
        <div className="evidence-ledger-table">
          <div className="evidence-ledger-head hidden px-4 py-2.5 text-[10px] font-semibold text-[#858c97] md:grid sm:px-5" aria-hidden="true">
            <span>账本 ID</span>
            <span>诊断与原文依据</span>
            <span>原文位置</span>
            <span>校验状态</span>
          </div>
          <ol>
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
                <li key={`${ledgerId}-${data.question}`} className="evidence-ledger-row px-4 py-5 sm:px-5">
                  <div className="flex items-center gap-2 md:block">
                    <span className="report-ledger-index">{ledgerId}</span>
                  </div>

                  <div className="mt-4 min-w-0 md:mt-0">
                    <h3 className="break-words text-sm font-semibold leading-6 text-[var(--geo-text-heading)]">{data.question}</h3>
                    {evidence.length ? (
                      <div className="mt-3 grid gap-3">
                        {evidence.map((entry) => (
                          <blockquote
                            key={`${entry.paragraphId}:${entry.quote}`}
                            className="border-l-2 border-[var(--geo-info)] pl-3 text-sm leading-6 text-[var(--geo-text-body)]"
                          >
                            <span className="sr-only">原文 {entry.paragraphId}：</span>
                            {entry.quote}
                          </blockquote>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs leading-5 text-[var(--geo-text-muted)]">
                        {restoredFromCache
                          ? "缓存报告保留校验状态，但不保留原文逐字引用。"
                          : data.evidenceStatus === "missing"
                            ? "该诊断没有可展示的原文依据。"
                            : "未保留可作为依据的有效引用。"}
                      </p>
                    )}
                  </div>

                  <div className="mt-4 md:mt-0">
                    <p className="mb-2 text-[10px] font-semibold text-[#858c97] md:hidden">原文位置</p>
                    {locations.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {locations.map((paragraphId) => (
                          <span key={paragraphId} className="report-paragraph-chip">{paragraphId}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs leading-5 text-[#8b939e]">无可定位段落</span>
                    )}
                  </div>

                  <div className="mt-4 md:mt-0">
                    <p className="mb-2 text-[10px] font-semibold text-[#858c97] md:hidden">校验状态</p>
                    <EvidenceStatusBadge status={data.evidenceStatus} />
                    <p className="mt-2 text-[11px] leading-5 text-[var(--geo-text-muted)]">{STATUS_DETAIL[data.evidenceStatus]}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
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
