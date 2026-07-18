import { FileText } from "lucide-react";

import type { LoadState } from "@/lib/client/report-state";
import type { EvaluateScoringResponse } from "@/lib/schemas/geo";

type ReportEvidencePanelProps = {
  scoring: LoadState<EvaluateScoringResponse>;
  restoredFromCache: boolean;
};

export function ReportEvidencePanel({ scoring, restoredFromCache }: ReportEvidencePanelProps) {
  const paragraphs = scoring.status === "success" ? scoring.data.numbered_paragraphs : [];

  return (
    <section id="evidence-section" className="report-evidence-panel section-anchor surface-flat min-w-0">
      <div className="flex items-start justify-between gap-3 border-b border-[#e5e8ed] px-4 py-4 sm:px-5">
        <div>
          <p className="section-kicker">SOURCE INDEX</p>
          <h2 className="mt-1.5 text-base font-semibold text-[#111827]">证据锚点</h2>
        </div>
        <span className="grid size-8 shrink-0 place-items-center rounded-md border border-[#dce4e2] bg-[#f3f8f7] text-[#0f766e]">
          <FileText aria-hidden="true" className="size-4" />
        </span>
      </div>

      {paragraphs.length ? (
        <div className="divide-y divide-[#eceef1]">
          {paragraphs.map((paragraph) => (
            <article key={paragraph.id} className="grid gap-2 px-4 py-4 sm:px-5">
              <span className="font-mono text-[11px] font-bold text-[#5b61d6]">{paragraph.id}</span>
              <p className="break-words text-xs leading-6 text-[#59636f]">{paragraph.text}</p>
            </article>
          ))}
        </div>
      ) : scoring.status === "loading" || scoring.status === "idle" ? (
        <div role="status" aria-live="polite" className="grid gap-3 px-4 py-5 sm:px-5">
          <span className="h-3 w-20 animate-pulse rounded bg-[#e8ebef] motion-reduce:animate-none" />
          <span className="h-3 w-full animate-pulse rounded bg-[#eef0f3] motion-reduce:animate-none" />
          <span className="h-3 w-4/5 animate-pulse rounded bg-[#eef0f3] motion-reduce:animate-none" />
        </div>
      ) : scoring.status === "error" ? (
        <p role="alert" className="px-4 py-5 text-sm leading-6 text-[#a43e2b] sm:px-5">
          评分失败，暂时无法建立证据索引。
        </p>
      ) : (
        <p className="px-4 py-5 text-sm leading-6 text-[#68707d] sm:px-5">
          {restoredFromCache
            ? "缓存报告不保留原文段落。重新运行体检可查看完整证据锚点。"
            : "当前报告没有可展示的证据段落。"}
        </p>
      )}
    </section>
  );
}
