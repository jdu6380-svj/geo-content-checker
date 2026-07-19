"use client";

import { useRef } from "react";
import { ChevronRight } from "lucide-react";

import { EvidenceStatusBadge } from "@/components/evidence-status-badge";
import { DiagnosisFeedback } from "@/components/diagnosis-feedback";
import type { DiagnosticItem } from "@/lib/client/report-state";

type DiagnosticAccordionItemProps = {
  id: string;
  item: DiagnosticItem;
  expanded: boolean;
  onToggle: () => void;
  onRetry: () => void;
  canRetry: boolean;
  fromCachedReport: boolean;
  feedback?: boolean;
  feedbackEnabled: boolean;
  onFeedback: (helpful: boolean) => void;
};

type DiagnosticPresentation = Readonly<{
  evidenceEmptyMessage: string;
  missingInfoEmptyMessage: string;
}>;

const STATUS_STYLE = {
  "可以完全回答": "bg-[#e4f2ef] text-[#0b6b63]",
  "信息不足": "bg-[#fff5dc] text-[#8a5b12]",
  "有风险": "bg-[#fff0ed] text-[#a43e2b]",
} as const;

const STATUS_ACCENT = {
  "可以完全回答": "border-l-[#08766e]",
  "信息不足": "border-l-[#b7791f]",
  "有风险": "border-l-[#c65d4b]",
} as const;

const RISK_STYLE = {
  low: { label: "低风险", className: "bg-[#e4f2ef] text-[#0b6b63]" },
  medium: { label: "中风险", className: "bg-[#fff5dc] text-[#8a5b12]" },
  high: { label: "高风险", className: "bg-[#fff0ed] text-[#a43e2b]" },
} as const;

function selectDiagnosticPresentation(fromCachedReport: boolean): DiagnosticPresentation {
  return {
    evidenceEmptyMessage: fromCachedReport
      ? "本地缓存报告未保留可展示的逐字证据，请重新运行体检。"
      : "未找到可逐字验证的原文证据。",
    missingInfoEmptyMessage: fromCachedReport
      ? "本地缓存报告未保留缺失信息明细。"
      : "当前问题没有明显信息缺口。",
  };
}

export function DiagnosticAccordionItem({
  id,
  item,
  expanded,
  onToggle,
  onRetry,
  canRetry,
  fromCachedReport,
  feedback,
  feedbackEnabled,
  onFeedback,
}: DiagnosticAccordionItemProps) {
  const contentId = `diagnostic-${id}`;
  const isReady = item.status === "success" && Boolean(item.data);
  const accent = item.data ? STATUS_ACCENT[item.data.answerability] : "border-l-transparent";
  const presentation = selectDiagnosticPresentation(fromCachedReport);
  const articleRef = useRef<HTMLElement>(null);

  function handleRetry() {
    onRetry();
    window.requestAnimationFrame(() => articleRef.current?.focus());
  }

  return (
    <article
      ref={articleRef}
      tabIndex={-1}
      className={`overflow-hidden border-l-[3px] bg-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f766e] ${accent} ${expanded ? "bg-[#fbfcfb]" : ""}`}
    >
      <div className="flex min-h-[78px] items-stretch gap-2">
        <button
          type="button"
          aria-expanded={isReady ? expanded : false}
          aria-controls={contentId}
          disabled={!isReady}
          onClick={onToggle}
          className="grid min-w-0 flex-1 grid-cols-[30px_minmax(0,1fr)_24px] items-center gap-3 px-3.5 py-3 text-left disabled:cursor-default sm:px-5"
        >
          <span className={`grid h-[30px] w-[30px] shrink-0 place-items-center rounded-md font-mono text-xs font-bold ${expanded ? "bg-[#dff0ed] text-[#08766e]" : "bg-[#eef2f1] text-[#687681]"}`}>
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
                <>
                  <span className={`status-badge px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[item.data.answerability]}`}>
                    {item.data.answerability}
                  </span>
                  <EvidenceStatusBadge status={item.data.evidenceStatus} />
                </>
              ) : null}
            </span>
          </span>
          {isReady ? (
            <ChevronRight
              aria-hidden="true"
              className={`size-4 justify-self-center text-[#667085] transition-transform duration-200 motion-reduce:transition-none ${expanded ? "rotate-90" : ""}`}
            />
          ) : <span aria-hidden="true" className="h-6 w-6" />}
        </button>

        {item.status === "error" ? (
          <button
            type="button"
            onClick={handleRetry}
            disabled={!canRetry}
            className="secondary-button my-auto mr-4 h-9 shrink-0 px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-45 sm:mr-5"
          >
            {canRetry ? "重试" : "稍后再试"}
          </button>
        ) : null}
      </div>

      {item.status === "loading" ? (
        <div className="border-t border-[#e4e9e7] bg-[#f7f9f8] px-5 py-4">
          <div className="h-3 w-3/4 animate-pulse rounded bg-[#e8ecef] motion-reduce:animate-none" />
          <div className="mt-3 h-3 w-1/2 animate-pulse rounded bg-[#e8ecef] motion-reduce:animate-none" />
        </div>
      ) : null}

      {item.status === "error" ? (
        <p role="alert" aria-live="assertive" className="border-t border-[#f4ddd8] bg-[#fff8f6] px-5 py-3 text-sm text-[#a43e2b]">
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
            <div className="grid bg-[#f7f9f8] text-sm min-[760px]:grid-cols-[1.1fr_.9fr]">
              <div className="px-4 py-5 sm:px-5">
                <h3 className="text-sm font-bold">原文证据</h3>
                {item.data.evidenceStatus === "invalid" ? (
                  <p className="mt-3 border-l-2 border-[#c85745] bg-[#fff8f6] px-3 py-2 text-xs leading-5 text-[#963d2e]">
                    无法定位的引用已被移除。
                  </p>
                ) : null}
                {item.data.evidence.length ? (
                  <div className="mt-3 grid gap-3">
                    {item.data.evidence.map((evidence) => (
                      <blockquote key={`${evidence.paragraphId}-${evidence.quote}`} className="border-l-2 border-[#72aaa2] py-1 pl-3 pr-2 leading-6 text-[#46545e]">
                        <span className="mb-1 block font-mono text-xs font-bold text-[#08766e]">{evidence.paragraphId}</span>
                        {evidence.quote}
                      </blockquote>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 leading-6 text-[#687386]">{presentation.evidenceEmptyMessage}</p>
                )}
              </div>

              <div className="grid content-start gap-5 border-t border-[#e1e6ea] px-4 py-5 sm:px-5 min-[760px]:border-l min-[760px]:border-t-0">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-bold">缺失信息</h3>
                    <span className={`status-badge px-2.5 py-1 text-xs font-semibold ${RISK_STYLE[item.data.riskLevel].className}`}>
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
                    <p className="mt-2 text-[#687386]">{presentation.missingInfoEmptyMessage}</p>
                  )}
                </div>
                <div className="border-l-2 border-[#6f8ca4] bg-[#edf3f7] px-3 py-3">
                  <h3 className="font-bold text-[#416b8a]">修改建议</h3>
                  <p className="mt-2 leading-6 text-[#46545e]">{item.data.recommendation}</p>
                </div>
                <DiagnosisFeedback value={feedback} enabled={feedbackEnabled} onSubmit={onFeedback} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
