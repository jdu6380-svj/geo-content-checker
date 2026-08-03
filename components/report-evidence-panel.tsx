import { AlertTriangle, CheckCircle2, CircleSlash2, FileCheck2, Files } from "lucide-react";

import { EvidenceStatusBadge } from "@/components/evidence-status-badge";
import type { DiagnosticsState } from "@/lib/client/report-state";

type ReportEvidencePanelProps = {
  diagnostics: DiagnosticsState;
  questionOrder: string[];
  restoredFromCache: boolean;
};

const STATUS_DETAIL = {
  valid: "段落编号存在，引用可在原文中逐字定位。",
  missing: "该诊断没有足够的原文证据支持判断。",
  invalid: "返回的引用未通过逐字校验，不能作为审查依据。",
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
  const evidenceStates = [
    {
      status: "valid" as const,
      label: "valid",
      description: "证据有效的诊断",
      count: counts.valid,
      icon: CheckCircle2,
      className: "geo-tone-success",
    },
    {
      status: "missing" as const,
      label: "missing",
      description: "缺少原文依据的诊断",
      count: counts.missing,
      icon: CircleSlash2,
      className: "geo-tone-warning",
    },
    {
      status: "invalid" as const,
      label: "invalid",
      description: "引用未通过校验的诊断",
      count: counts.invalid,
      icon: AlertTriangle,
      className: "geo-tone-danger",
    },
    {
      status: "literal" as const,
      label: "逐字引用",
      description: "已保留的逐字引用总数",
      count: literalEvidenceCount,
      icon: FileCheck2,
      className: "geo-tone-info",
    },
  ];

  return (
    <section id="evidence-section" className="report-evidence-panel section-anchor surface-flat min-w-0">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--geo-border)] px-4 py-4 sm:px-6 sm:py-5">
        <div>
          <p className="section-kicker">证据账本</p>
          <h2 className="geo-heading mt-1.5 text-xl font-semibold sm:text-2xl">可审计证据账本</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--geo-text-muted)]">
            每项诊断关联原文位置、逐字引用与校验状态。状态统计按诊断计数，引用总数单独列示。
          </p>
        </div>
        <span className="grid size-8 shrink-0 place-items-center rounded-md border border-[var(--geo-border)] bg-[var(--geo-surface-subtle)] text-[var(--geo-info)]">
          <Files aria-hidden="true" className="size-4" />
        </span>
      </div>

      <div className="evidence-status-summary grid border-b border-[var(--geo-border)] sm:grid-cols-2 xl:grid-cols-4">
        {evidenceStates.map((state) => {
          const Icon = state.icon;
          return (
            <div key={state.status} className="flex min-w-0 items-start gap-3 px-4 py-4 sm:px-5">
              <Icon aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${state.className}`} />
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className={`text-[10px] font-semibold uppercase ${state.className}`}>{state.label}</span>
                  <strong className="text-base tabular-nums text-[var(--geo-text-heading)]">{state.count}</strong>
                </div>
                <p className="mt-1 text-xs leading-5 text-[var(--geo-text-muted)]">{state.description}</p>
              </div>
            </div>
          );
        })}
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
                    <span className="text-[10px] font-medium text-[#8b939e] md:mt-2 md:block">诊断记录</span>
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
                    <p className="mt-2 text-xs leading-5 text-[var(--geo-text-muted)]">{STATUS_DETAIL[data.evidenceStatus]}</p>
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
