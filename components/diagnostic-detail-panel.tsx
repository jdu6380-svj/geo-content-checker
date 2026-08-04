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

const RISK_IMPACT = {
  low: "当前信息基本能够支撑判断，发布前仍应核对引用与适用边界。",
  medium: "信息缺口会增加读者与 AI 系统确认内容可靠性的成本。",
  high: "关键依据不足可能直接影响内容可信判断，应在发布前优先处理。",
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
      <div id="diagnosis-detail-panel" className="grid min-h-[420px] place-items-center bg-[var(--geo-surface-subtle)] p-8 text-center">
        <div className="max-w-xs">
          <FileSearch aria-hidden="true" className="mx-auto size-6 text-[var(--geo-text-soft)]" />
          <h3 className="mt-4 text-sm font-semibold text-[var(--geo-text-heading)]">暂无可展示诊断</h3>
          <p className="mt-2 text-xs leading-6 text-[var(--geo-text-soft)]">问题生成完成后，证据与建议将在这里显示。</p>
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
      <div id="diagnosis-detail-panel" className="grid min-h-[420px] place-items-center bg-[var(--geo-status-danger-soft)] p-8 text-center">
        <div className="max-w-sm">
          <AlertTriangle aria-hidden="true" className="mx-auto size-6 text-[var(--geo-status-danger)]" />
          <h3 className="mt-4 text-sm font-semibold text-[var(--geo-status-danger)]">该问题分析失败</h3>
          <p role="alert" aria-live="assertive" className="mt-2 text-sm leading-6 text-[var(--geo-text-body)]">
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
    <div id="diagnosis-detail-panel" className="diagnosis-detail-panel">
      <section className="diagnosis-detail-hero" aria-labelledby="diagnosis-problem-heading">
        <p id="diagnosis-problem-heading" className="diagnosis-step-label"><span>01</span>发现的问题</p>
        <h3>{item.question}</h3>
        <div className="diagnosis-detail-status">
          <span className={risk.className}>{risk.label}</span>
          <span className={`diagnosis-answerability ${STATUS_STYLE[item.data.answerability]}`}>
            判断：{item.data.answerability}
          </span>
          <span className="diagnosis-evidence-state">依据：<EvidenceStatusBadge status={item.data.evidenceStatus} /></span>
        </div>
      </section>

      <div className="diagnosis-detail-grid">
        <section className="diagnosis-detail-card is-impact">
          <p className="diagnosis-step-label"><span>02</span>为什么重要</p>
          <p className="diagnosis-impact-copy">{RISK_IMPACT[item.data.riskLevel]}</p>
        </section>

        <section className="diagnosis-detail-card is-evidence">
          <p className="diagnosis-step-label"><span>03</span>原文依据</p>
          {item.data.evidenceStatus === "invalid" ? (
            <p className="diagnosis-invalid-evidence">
              模型返回了无法逐字定位的引用；无效内容已移除。
            </p>
          ) : null}
          {item.data.evidence.length ? (
            <div className="diagnosis-evidence-list">
              {item.data.evidence.map((evidence) => (
                <blockquote key={`${evidence.paragraphId}-${evidence.quote}`}>
                  <span>{evidence.paragraphId}</span>
                  {evidence.quote}
                </blockquote>
              ))}
            </div>
          ) : (
            <p className="diagnosis-empty-copy">{evidenceEmptyMessage}</p>
          )}
        </section>

        <section className="diagnosis-detail-card is-missing">
          <p className="diagnosis-step-label"><span>04</span>需要补充</p>
          {item.data.missingInfo.length ? (
            <ul className="diagnosis-missing-list">
              {item.data.missingInfo.map((missing) => <li key={missing}>{missing}</li>)}
            </ul>
          ) : (
            <p className="diagnosis-empty-copy">{missingInfoEmptyMessage}</p>
          )}
        </section>

        <section className="diagnosis-detail-card diagnosis-recommendation">
          <p className="diagnosis-step-label"><span>05</span>怎么修改</p>
          <p className="diagnosis-recommendation-copy">{item.data.recommendation}</p>
        </section>
      </div>
      <DiagnosisFeedback value={feedback} enabled={feedbackEnabled} onSubmit={onFeedback} />
    </div>
  );
}
