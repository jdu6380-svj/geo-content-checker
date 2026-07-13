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
  "可以完全回答": "bg-[#e7f4f1] text-[#0e766e]",
  "信息不足": "bg-[#fff5dc] text-[#8a5b12]",
  "有风险": "bg-[#fff0ed] text-[#a43e2b]",
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
    <article className="card overflow-hidden">
      <div className="flex min-h-[76px] items-center gap-3 px-4 py-3 sm:px-5">
        <button
          type="button"
          aria-expanded={isReady ? expanded : false}
          aria-controls={contentId}
          disabled={!isReady}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#f3f5f7] text-sm font-bold text-[#687386]">
            {id}
          </span>
          <span className="min-w-0 flex-1 text-sm font-semibold leading-6 sm:text-base">{item.question}</span>
          {item.status === "queued" ? (
            <span className="shrink-0 text-xs text-[#8992a2]">等待分析</span>
          ) : null}
          {item.status === "loading" ? (
            <span className="h-5 w-16 shrink-0 animate-pulse rounded bg-[#e5e8ed] motion-reduce:animate-none" />
          ) : null}
          {item.data ? (
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[item.data.answerability]}`}>
              {item.data.answerability}
            </span>
          ) : null}
          {isReady ? (
            <span aria-hidden="true" className="w-5 shrink-0 text-center text-xl text-[#687386]">
              {expanded ? "−" : "+"}
            </span>
          ) : null}
        </button>

        {item.status === "error" ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={!canRetry}
            className="h-9 shrink-0 rounded-lg border border-[#d9dee5] px-3 text-xs font-semibold text-[#465266] hover:bg-[#f3f5f7] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {canRetry ? "重试" : "稍后再试"}
          </button>
        ) : null}
      </div>

      {item.status === "loading" ? (
        <div className="border-t border-[#edf0f2] px-5 py-4">
          <div className="h-3 w-3/4 animate-pulse rounded bg-[#edf0f2] motion-reduce:animate-none" />
          <div className="mt-3 h-3 w-1/2 animate-pulse rounded bg-[#edf0f2] motion-reduce:animate-none" />
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
            <div className="grid gap-5 px-5 py-5 text-sm sm:grid-cols-2">
              <div>
                <h3 className="font-bold">原文证据</h3>
                {item.data.evidence.length ? (
                  <div className="mt-3 grid gap-3">
                    {item.data.evidence.map((evidence) => (
                      <blockquote key={`${evidence.paragraphId}-${evidence.quote}`} className="border-l-2 border-[#93c4bd] pl-3 leading-6 text-[#465266]">
                        <span className="mb-1 block text-xs font-bold text-[#0e766e]">{evidence.paragraphId}</span>
                        {evidence.quote}
                      </blockquote>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 leading-6 text-[#687386]">未找到可逐字验证的原文证据。</p>
                )}
              </div>

              <div className="grid content-start gap-4">
                <div>
                  <h3 className="font-bold">缺失信息</h3>
                  {item.data.missingInfo.length ? (
                    <ul className="mt-2 grid gap-2 text-[#465266]">
                      {item.data.missingInfo.map((missing) => <li key={missing}>• {missing}</li>)}
                    </ul>
                  ) : (
                    <p className="mt-2 text-[#687386]">当前问题没有明显信息缺口。</p>
                  )}
                </div>
                <div className="rounded-lg bg-[#f3f7f6] p-3">
                  <h3 className="font-bold text-[#0e766e]">修改建议</h3>
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
