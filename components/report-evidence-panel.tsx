import { FileText } from "lucide-react";

import { EvidenceStatusBadge } from "@/components/evidence-status-badge";
import type { DiagnosticsState } from "@/lib/client/report-state";

type ReportEvidencePanelProps = {
  diagnostics: DiagnosticsState;
  restoredFromCache: boolean;
};

export function ReportEvidencePanel({ diagnostics, restoredFromCache }: ReportEvidencePanelProps) {
  const items = Object.values(diagnostics).flatMap((item) => item.data ? [item.data] : []);
  const pending = Object.values(diagnostics).some(
    (item) => item.status === "queued" || item.status === "loading",
  );
  const counts = items.reduce(
    (result, item) => ({ ...result, [item.evidenceStatus]: result[item.evidenceStatus] + 1 }),
    { valid: 0, missing: 0, invalid: 0 },
  );

  return (
    <section id="evidence-section" className="report-evidence-panel section-anchor surface-flat min-w-0">
      <div className="flex items-start justify-between gap-3 border-b border-[#e5e8ed] px-4 py-4 sm:px-5">
        <div>
          <p className="section-kicker">EVIDENCE REVIEW</p>
          <h2 className="mt-1.5 text-base font-semibold text-[#111827]">证据验证</h2>
          {items.length ? (
            <p className="mt-2 text-xs leading-5 text-[#737d89]">
              有效 {counts.valid} · 缺失 {counts.missing} · 无效 {counts.invalid}
            </p>
          ) : null}
        </div>
        <span className="grid size-8 shrink-0 place-items-center rounded-md border border-[#dce4e2] bg-[#f3f8f7] text-[#0f766e]">
          <FileText aria-hidden="true" className="size-4" />
        </span>
      </div>

      {items.length ? (
        <div className="divide-y divide-[#eceef1]">
          {items.map((item) => {
            const evidence = Array.from(
              new Map(
                item.evidence.map((entry) => [
                  `${entry.paragraphId}:${entry.quote}`,
                  entry,
                ]),
              ).values(),
            );

            return (
              <article key={item.question} className="grid gap-3 px-4 py-4 sm:px-5">
                <div className="grid gap-2">
                  <EvidenceStatusBadge status={item.evidenceStatus} />
                  <h3 className="break-words text-xs font-semibold leading-5 text-[#343a42]">{item.question}</h3>
                </div>

                {item.evidenceStatus === "invalid" ? (
                  <p className="text-xs leading-5 text-[#a43e2b]">无法逐字定位的引用已移除。</p>
                ) : null}

                {evidence.length ? (
                  <div className="grid gap-3">
                    {evidence.map((entry) => (
                      <blockquote key={`${entry.paragraphId}:${entry.quote}`} className="border-l-2 border-[#72aaa2] pl-3 text-xs leading-6 text-[#59636f]">
                        <span className="mb-1 block font-mono text-[11px] font-bold text-[#08766e]">{entry.paragraphId}</span>
                        {entry.quote}
                      </blockquote>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs leading-5 text-[#737d89]">
                    {restoredFromCache
                      ? "缓存保留验证结果，但不保留原文引用。"
                      : item.evidenceStatus === "missing"
                        ? "该诊断没有可验证的原文证据。"
                        : "当前没有可展示的有效引用。"}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      ) : pending || Object.keys(diagnostics).length === 0 ? (
        <div role="status" aria-live="polite" className="grid gap-3 px-4 py-5 sm:px-5">
          <span className="h-3 w-20 animate-pulse rounded bg-[#e8ebef] motion-reduce:animate-none" />
          <span className="h-3 w-full animate-pulse rounded bg-[#eef0f3] motion-reduce:animate-none" />
          <span className="h-3 w-4/5 animate-pulse rounded bg-[#eef0f3] motion-reduce:animate-none" />
        </div>
      ) : (
        <p className="px-4 py-5 text-sm leading-6 text-[#68707d] sm:px-5">
          当前报告没有可展示的诊断证据。
        </p>
      )}
    </section>
  );
}
