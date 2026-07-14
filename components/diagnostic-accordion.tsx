"use client";

import type { DiagnosticItem } from "@/lib/client/report-state";

type DiagnosticAccordionProps = {
  id: string;
  item: DiagnosticItem;
  expanded: boolean;
  onToggle: () => void;
  onRetry: () => void;
  canRetry: boolean;
};

const STATUS_STYLE = {
  "可以完全回答": "bg-[#e4f2ef] text-[#0b6b63]",
  "信息不足": "bg-[#fff5dc] text-[#8a5b12]",
  "有风险": "bg-[#fff0ed] text-[#a43e2b]",
} as const;

const RISK_STYLE = {
  low: { label: "低风险", className: "bg-[#e4f2ef] text-[#0b6b63]" },
  medium: { label: "中风险", className: "bg-[#fff5dc] text-[#8a5b12]" },
  high: { label: "高风险", className: "bg-[#fff0ed] text-[#a43e2b]" },
} as const;

export function DiagnosticAccordion({
  id,
  item,
  expanded,
  onToggle,
  onRetry,
  canRetry,
}: DiagnosticAccordionProps) {
  const contentId = `diagnostic-${id}`;
  const isReady = item.status === "success" && Boolean(item.data);

  return (
    <article className={`card overflow-hidden transition-colors ${expanded ? "border-[#a9cec8]" : ""}`}>
      <div className="flex min-h-[82px] items-stretch gap-2">
        <button
          type="button"
          aria-expanded={isReady ? expanded : false}
          aria-controls={contentId}
          disabled={!isReady}
          onClick={onToggle}
          className="grid min-w-0 flex-1 grid-cols-[32px_minmax(0,1fr)_24px] items-center gap-3 px-4 py-3.5 text-left disabled:cursor-default sm:px-5"
        >
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm font-bold ${expanded ? "bg-[#e4f2ef] text-[#0b6b63]" : "bg-[#eef2f3] text-[#667085]"}`}>
            {id}
          </span>
          <span className="min-w-0">
            <span className="block break-words text-sm font-semibold leading-6 sm:text-[15px]">{item.question}</span>
            <span className="mt-1.5 flex min-h-5 flex-wrap items-center gap-2">
              {item.status === "queued" ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-[#7f8998]">
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#a8b0bc]" />
                  等待分析
                </span>
              ) : null}
              {item.status === "loading" ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#3d607d]">
                  <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#3d607d] motion-reduce:animate-none" />
                  正在分析
                </span>
              ) : null}
              {item.data ? (
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[item.data.answerability]}`}>
                  {item.data.answerability}
                </span>
              ) : null}
            </span>
          </span>
          {isReady ? (
            <span
              aria-hidden="true"
              className={`grid h-6 w-6 place-items-center text-2xl leading-none text-[#667085] transition-transform duration-200 motion-reduce:transition-none ${expanded ? "rotate-90" : ""}`}
            >
              ›
            </span>
          ) : <span aria-hidden="true" className="h-6 w-6" />}
        </button>

        {item.status === "error" ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={!canRetry}
            className="my-auto mr-4 h-9 shrink-0 rounded-lg border border-[#d6dde2] px-3 text-xs font-semibold text-[#465266] hover:bg-[#eef2f3] disabled:cursor-not-allowed disabled:opacity-45 sm:mr-5"
          >
            {canRetry ? "重试" : "稍后再试"}
          </button>
        ) : null}
      </div>

      {item.status === "loading" ? (
        <div className="border-t border-[#e8ecef] bg-[#fafbfb] px-5 py-4">
          <div className="h-3 w-3/4 animate-pulse rounded bg-[#e8ecef] motion-reduce:animate-none" />
          <div className="mt-3 h-3 w-1/2 animate-pulse rounded bg-[#e8ecef] motion-reduce:animate-none" />
        </div>
      ) : null}

      {item.status === "error" ? (
        <p className="border-t border-[#f4ddd8] bg-[#fff8f6] px-5 py-3 text-sm text-[#a43e2b]">
          {item.error || "该问题分析失败。"}
        </p>
      ) : null}

      <div
        id={contentId}
        aria-hidden={!expanded}
        className={`grid border-t transition-[grid-template-rows] duration-[250ms] motion-reduce:transition-none ${
          expanded && isReady ? "grid-rows-[1fr] border-[#e5e8ed]" : "grid-rows-[0fr] border-transparent"
        }`}
      >
        <div className="overflow-hidden">
          {item.data ? (
            <div className="grid bg-[#fafbfb] text-sm min-[760px]:grid-cols-[1.1fr_.9fr]">
              <div className="px-4 py-5 sm:px-5">
                <h3 className="font-bold">原文证据</h3>
                {item.data.evidence.length ? (
                  <div className="mt-3 grid gap-3">
                    {item.data.evidence.map((evidence) => (
                      <blockquote key={`${evidence.paragraphId}-${evidence.quote}`} className="border-l-2 border-[#77aaa2] bg-white py-2 pl-3 pr-3 leading-6 text-[#465266]">
                        <span className="mb-1 block text-xs font-bold text-[#0b6b63]">{evidence.paragraphId}</span>
                        {evidence.quote}
                      </blockquote>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 leading-6 text-[#687386]">未找到可逐字验证的原文证据。</p>
                )}
              </div>

              <div className="grid content-start gap-5 border-t border-[#e1e6ea] px-4 py-5 sm:px-5 min-[760px]:border-l min-[760px]:border-t-0">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-bold">缺失信息</h3>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${RISK_STYLE[item.data.riskLevel].className}`}>
                      {RISK_STYLE[item.data.riskLevel].label}
                    </span>
                  </div>
                  {item.data.missingInfo.length ? (
                    <ul className="mt-3 grid gap-2 text-[#465266]">
                      {item.data.missingInfo.map((missing) => (
                        <li key={missing} className="flex gap-2 leading-6">
                          <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#a66a13]" />
                          <span>{missing}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-[#687386]">当前问题没有明显信息缺口。</p>
                  )}
                </div>
                <div className="border-l-2 border-[#6f8ca4] bg-[#edf3f8] px-3 py-3">
                  <h3 className="font-bold text-[#3d607d]">修改建议</h3>
                  <p className="mt-2 leading-6 text-[#465266]">{item.data.recommendation}</p>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
