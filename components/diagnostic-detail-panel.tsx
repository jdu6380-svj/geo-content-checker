"use client";

import { AlertTriangle, FileSearch, RefreshCw } from "lucide-react";

import { EvidenceStatusBadge } from "@/components/evidence-status-badge";
import { DiagnosisFeedback } from "@/components/diagnosis-feedback";
import type { DiagnosticItem } from "@/lib/client/report-state";

type DiagnosticDetailPanelProps = {
  item: DiagnosticItem | null;
  fromCachedReport: boolean;
  canRetry: boolean;
  feedback?: boolean;
  feedbackEnabled: boolean;
  onRetry: () => void;
  onFeedback: (helpful: boolean) => void;
};

const STATUS_STYLE = {
  "可以完全回答": "status-success",
  "信息不足": "status-warning",
  "有风险": "status-danger",
} as const;

const RISK_STYLE = {
  low: { label: "低风险", className: "status-success" },
  medium: { label: "中风险", className: "status-warning" },
  high: { label: "高风险", className: "status-danger" },
} as const;

export function DiagnosticDetailPanel({
  item,
  fromCachedReport,
  canRetry,
  feedback,
  feedbackEnabled,
  onRetry,
  onFeedback,
}: DiagnosticDetailPanelProps) {
  if (!item) {
    return (
      <div id="diagnosis-detail-panel" className="grid min-h-[420px] place-items-center bg-[#fafbfc] p-8 text-center">
        <div className="max-w-xs">
          <FileSearch aria-hidden="true" className="mx-auto size-6 text-[#8b939e]" />
          <h3 className="mt-4 text-sm font-semibold text-[#343a42]">暂无可展示诊断</h3>
          <p className="mt-2 text-xs leading-6 text-[#858c97]">问题生成完成后，证据与建议将在这里显示。</p>
        </div>
      </div>
    );
  }

  if (item.status === "loading" || item.status === "queued") {
    return (
      <div id="diagnosis-detail-panel" role="status" aria-live="polite" className="min-h-[420px] bg-[var(--geo-surface-subtle)] p-6">
        <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--geo-surface-inset)] motion-reduce:animate-none" />
        <div className="mt-8 grid gap-4">
          <div className="h-24 animate-pulse rounded-md bg-[var(--geo-surface-inset)] motion-reduce:animate-none" />
          <div className="h-32 animate-pulse rounded-md bg-[var(--geo-surface-inset)] motion-reduce:animate-none" />
        </div>
      </div>
    );
  }

  if (item.status === "error") {
    return (
      <div id="diagnosis-detail-panel" className="grid min-h-[420px] place-items-center bg-[#fff9f7] p-8 text-center">
        <div className="max-w-sm">
          <AlertTriangle aria-hidden="true" className="mx-auto size-6 text-[#c85745]" />
          <h3 className="mt-4 text-sm font-semibold text-[#963d2e]">该问题分析失败</h3>
          <p role="alert" aria-live="assertive" className="mt-2 text-sm leading-6 text-[#765047]">
            {item.error || "暂时无法生成诊断结果。"}
          </p>
          {canRetry ? (
            <button type="button" onClick={onRetry} className="primary-button mt-4 h-9 px-4 text-sm font-semibold">
              <RefreshCw aria-hidden="true" className="size-4" />
              重新分析
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (!item.data) return null;

  const risk = RISK_STYLE[item.data.riskLevel];
  const evidenceEmptyMessage = fromCachedReport
    ? "本地缓存报告未保留可展示的逐字证据，请重新运行体检。"
    : "未找到可逐字验证的原文证据。";
  const missingInfoEmptyMessage = fromCachedReport
    ? "本地缓存报告未保留缺失信息明细。"
    : "当前问题没有明显信息缺口。";

  return (
    <div id="diagnosis-detail-panel" className="min-h-[420px] bg-[#fafbfc]">
      <section className="border-b border-[#e3e7eb] bg-white px-5 py-5" aria-labelledby="diagnosis-problem-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <p id="diagnosis-problem-heading" className="diagnosis-step-label"><span>01</span>问题</p>
            <h3 className="mt-2 text-base font-semibold leading-7 text-[#111827]">{item.question}</h3>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className={`status-badge px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[item.data.answerability]}`}>
              {item.data.answerability}
            </span>
            <span className={`status-badge px-2.5 py-1 text-xs font-semibold ${risk.className}`}>
              {risk.label}
            </span>
            <EvidenceStatusBadge status={item.data.evidenceStatus} />
          </div>
        </div>
      </section>

      <div className="grid">
        <section className="px-5 py-5">
          <p className="diagnosis-step-label"><span>02</span>原文证据</p>
          {item.data.evidenceStatus === "invalid" ? (
            <p className="mt-3 border-l-2 border-[#c85745] bg-[#fff8f6] px-3 py-2 text-xs leading-5 text-[#963d2e]">
              模型返回了无法逐字定位的引用；无效内容已移除。
            </p>
          ) : null}
          {item.data.evidence.length ? (
            <div className="mt-4 grid gap-4">
              {item.data.evidence.map((evidence) => (
                <blockquote key={`${evidence.paragraphId}-${evidence.quote}`} className="border-l-2 border-[#72aaa2] pl-4 text-sm leading-7 text-[#46545e]">
                  <span className="mb-1 block font-mono text-xs font-bold text-[#08766e]">{evidence.paragraphId}</span>
                  {evidence.quote}
                </blockquote>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm leading-7 text-[#687386]">{evidenceEmptyMessage}</p>
          )}
        </section>

        <div className="grid content-start gap-5 border-t border-[#e1e6ea] px-5 py-5">
          <section>
            <p className="diagnosis-step-label"><span>03</span>缺失信息</p>
            {item.data.missingInfo.length ? (
              <ul className="mt-3 grid gap-2 text-sm text-[#465266]">
                {item.data.missingInfo.map((missing) => (
                  <li key={missing} className="flex gap-2 leading-6">
                    <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rounded-full bg-[#a66a13]" />
                    <span>{missing}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm leading-6 text-[#687386]">{missingInfoEmptyMessage}</p>
            )}
          </section>

          <section className="border-l-2 border-[#6f8ca4] bg-[#edf3f7] px-4 py-4">
            <p className="diagnosis-step-label text-[#416b8a]"><span>04</span>修改建议</p>
            <p className="mt-2 text-sm leading-7 text-[#46545e]">{item.data.recommendation}</p>
          </section>
          <DiagnosisFeedback value={feedback} enabled={feedbackEnabled} onSubmit={onFeedback} />
        </div>
      </div>
    </div>
  );
}
