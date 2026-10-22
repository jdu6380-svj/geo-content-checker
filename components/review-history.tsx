"use client";

import { ArrowRight, CalendarClock, FileText, History, ShieldAlert } from "lucide-react";

import type { CacheEnvelope } from "@/lib/client/report-state";

type ReviewHistoryProps = {
  items: CacheEnvelope[];
  onOpen: (item: CacheEnvelope) => void;
  onStartNew: () => void;
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function riskLabel(item: CacheEnvelope): { label: string; className: string } {
  const results = item.report.questionOrder.flatMap((question) => {
    const diagnostic = item.report.diagnostics[question];
    return diagnostic?.data ? [diagnostic.data] : [];
  });
  if (results.some((result) => result.riskLevel === "high")) return { label: "有高风险", className: "is-danger" };
  if (results.some((result) => result.riskLevel === "medium")) return { label: "需重点查看", className: "is-warning" };
  return { label: "风险较低", className: "is-success" };
}

export function ReviewHistory({ items, onOpen, onStartNew }: ReviewHistoryProps) {
  return (
    <main className="review-history-page" aria-labelledby="review-history-title">
      <header className="review-history-header">
        <div>
          <p className="phase-editor-kicker">本地审查记录</p>
          <h1 id="review-history-title">审查历史</h1>
          <p>查看当前浏览器保存的报告，继续阅读已完成的审查。</p>
        </div>
        <button type="button" className="phase-primary-button" onClick={onStartNew}>
          新建审查 <ArrowRight aria-hidden="true" />
        </button>
      </header>

      {items.length ? (
        <section className="review-history-list" aria-label="历史审查记录">
          {items.map((item) => {
            const risk = riskLabel(item);
            return (
              <article key={item.analysisHash} className="review-history-item">
                <span className="review-history-icon"><FileText aria-hidden="true" /></span>
                <div className="review-history-main">
                  <h2>{item.report.title || "未命名文章"}</h2>
                  <p>
                    <CalendarClock aria-hidden="true" />
                    {formatDate(item.savedAt)}
                    <span aria-hidden="true">·</span>
                    {item.report.questionOrder.length} 个问题已分析
                  </p>
                </div>
                <div className="review-history-score"><strong>{item.report.scoring.totalScore}</strong><span>/100</span></div>
                <span className={`review-history-risk ${risk.className}`}><ShieldAlert aria-hidden="true" />{risk.label}</span>
                <button type="button" className="review-history-open" onClick={() => onOpen(item)}>
                  打开报告 <ArrowRight aria-hidden="true" />
                </button>
              </article>
            );
          })}
        </section>
      ) : (
        <section className="review-history-empty">
          <History aria-hidden="true" />
          <h2>还没有审查记录</h2>
          <p>完成一次分析后，报告会自动保存在此浏览器中。</p>
          <button type="button" className="phase-primary-button" onClick={onStartNew}>
            开始第一次审查 <ArrowRight aria-hidden="true" />
          </button>
        </section>
      )}

      <p className="review-history-note">记录仅保存在当前浏览器，不会同步到账号或公开给其他人。</p>
    </main>
  );
}
