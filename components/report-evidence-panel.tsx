"use client";

import { useState } from "react";
import { ArrowLeft, CheckCircle2, ChevronDown, CircleAlert, FileText, Link2, ShieldAlert, ShieldCheck } from "lucide-react";

import type { DiagnosticsState } from "@/lib/client/report-state";
import type { Paragraph } from "@/lib/schemas/geo";

type ReportEvidencePanelProps = {
  title: string;
  paragraphs: Paragraph[];
  diagnostics: DiagnosticsState;
  questionOrder: string[];
  restoredFromCache: boolean;
  onOpenOverview: () => void;
  onOpenDiagnosis: () => void;
  onOpenPatch: () => void;
};

const STATUS_META = {
  valid: {
    label: "已验证",
    className: "is-success",
    confidence: "High",
    conclusion: "多项原文信息与结论一致，可作为当前判断依据。",
    icon: CheckCircle2,
  },
  missing: {
    label: "待补充",
    className: "is-warning",
    confidence: "Medium",
    conclusion: "当前依据不足，需要补充来源或可核验事实。",
    icon: CircleAlert,
  },
  invalid: {
    label: "风险",
    className: "is-danger",
    confidence: "Low",
    conclusion: "现有引用无法支持该结论，需要重新核对。",
    icon: ShieldAlert,
  },
} as const;

export function ReportEvidencePanel({
  title,
  paragraphs,
  diagnostics,
  questionOrder,
  restoredFromCache,
  onOpenOverview,
}: ReportEvidencePanelProps) {
  const [expandedEvidenceOrder, setExpandedEvidenceOrder] = useState<number | null>(null);
  const records = questionOrder.flatMap((question, index) => {
    const item = diagnostics[question];
    return item?.data ? [{ order: index + 1, data: item.data }] : [];
  });
  const visibleRecords = records.slice(0, 3);
  const literalEvidenceCount = records.reduce(
    (count, record) => count + new Set(
      record.data.evidence.map((entry) => `${entry.paragraphId}:${entry.quote}`),
    ).size,
    0,
  );
  const verifiedCount = records.filter((record) => record.data.evidenceStatus === "valid").length;
  const articleCharacters = paragraphs.reduce((count, paragraph) => count + paragraph.text.length, 0);
  const readingMinutes = Math.max(1, Math.ceil(articleCharacters / 400));
  const articleParagraphs = paragraphs.slice(0, 5);
  const primaryRecord = records[0];
  const riskRecord = records.find((record) => record.data.riskLevel === "high" || record.data.evidenceStatus === "invalid");
  const pending = Object.values(diagnostics).some(
    (item) => item.status === "queued" || item.status === "loading",
  );

  return (
    <section id="evidence-section" className="phase2-evidence-page section-anchor">
      <header className="phase2-subpage-header">
        <div>
          <p className="phase2-breadcrumb">我的审查 <span>/</span> Report Overview <span>/</span> Evidence</p>
          <h1>Evidence 依据分析</h1>
          <p>逐条核验观点、证据与来源，让每项结论可追溯、可解释。</p>
        </div>
        <div className="phase2-subpage-actions">
          <span><ShieldCheck aria-hidden="true" />已识别 {records.length} 个关键观点 · {verifiedCount} 项已验证</span>
          <button type="button" onClick={onOpenOverview}><ArrowLeft aria-hidden="true" />返回报告概览</button>
        </div>
      </header>

      {records.length ? (
        <div className="phase2-evidence-layout">
          <article className="phase2-article-surface">
            <header>
              <p><FileText aria-hidden="true" />文章内容</p>
              <h2>{title || "未命名内容"}</h2>
              <span>{paragraphs.length} 个段落 · {articleCharacters.toLocaleString("zh-CN")} 字 · 预计阅读 {readingMinutes} 分钟</span>
            </header>
            <div className="phase2-article-body">
              {articleParagraphs.map((paragraph, index) => (
                <div key={paragraph.id} data-paragraph-id={paragraph.id}>
                  <p>{paragraph.text}</p>
                  {index === 0 && primaryRecord ? (
                    <aside className="phase2-article-highlight is-primary">
                      <span>关键观点</span>
                      <strong>{primaryRecord.data.question}</strong>
                      <small>关联证据 {primaryRecord.data.evidence.length}</small>
                    </aside>
                  ) : null}
                  {index === Math.min(articleParagraphs.length - 1, 3) && riskRecord ? (
                    <aside className="phase2-article-highlight is-risk">
                      <span>风险观点</span>
                      <strong>{riskRecord.data.question}</strong>
                    </aside>
                  ) : null}
                </div>
              ))}
              {!paragraphs.length && restoredFromCache ? (
                <p className="phase2-empty-copy">缓存报告未保留正文，请重新运行审查后查看原文定位。</p>
              ) : null}
            </div>
          </article>

          <section className="phase2-evidence-panel" aria-labelledby="phase2-evidence-panel-heading">
            <header>
              <h2 id="phase2-evidence-panel-heading">Evidence Panel</h2>
              <p>观点、依据与来源的可解释链路</p>
            </header>
            <ol>
              {visibleRecords.map(({ order, data }) => {
                const status = STATUS_META[data.evidenceStatus];
                const StatusIcon = status.icon;
                const detailId = `phase3-evidence-detail-${order}`;
                const expanded = expandedEvidenceOrder === order;
                const evidenceText = data.evidence[0]?.quote || data.missingInfo[0] || "原文未提供可核验依据";
                const sourceText = data.evidence.length
                  ? Array.from(new Set(data.evidence.map((entry) => entry.paragraphId))).join("、")
                  : "当前原文未提供来源";
                return (
                  <li key={`${order}-${data.question}`} className={`${status.className} ${order === 1 ? "is-primary" : ""} ${expanded ? "is-expanded" : ""}`}>
                    <span className="phase2-evidence-status"><StatusIcon aria-hidden="true" />{status.label}</span>
                    <dl>
                      <div><dt>Claim</dt><dd>{data.question}</dd></div>
                      <div><dt>Evidence</dt><dd>{evidenceText}</dd></div>
                      <div>
                        <dt>Source</dt>
                        <dd className="is-link">
                          <button
                            type="button"
                            className="phase3-evidence-source"
                            onClick={() => {
                              const sourceId = data.evidence[0]?.paragraphId;
                              if (!sourceId) return;
                              const source = document.querySelector<HTMLElement>(`[data-paragraph-id="${sourceId}"]`);
                              source?.scrollIntoView({ behavior: "smooth", block: "center" });
                            }}
                          >
                            <Link2 aria-hidden="true" />{sourceText}
                          </button>
                        </dd>
                      </div>
                      <div><dt>Confidence</dt><dd className={status.className}>{status.confidence}</dd></div>
                    </dl>
                    <div className="phase3-evidence-summary">
                      <p>{status.conclusion}</p>
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-controls={detailId}
                        onClick={() => setExpandedEvidenceOrder((current) => current === order ? null : order)}
                      >
                        Detail
                        <ChevronDown aria-hidden="true" />
                      </button>
                    </div>
                    {expanded ? (
                      <div id={detailId} className="phase3-evidence-detail">
                        <section>
                          <strong>原文证据</strong>
                          {data.evidence.length ? (
                            <ul>
                              {data.evidence.map((evidence) => (
                                <li key={`${evidence.paragraphId}-${evidence.quote}`}>
                                  <span>{evidence.paragraphId}</span>
                                  <p>{evidence.quote}</p>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p>当前原文未提供可逐字核验的依据。</p>
                          )}
                        </section>
                        <section>
                          <strong>判断详情</strong>
                          <p>{data.missingInfo[0] || status.conclusion}</p>
                        </section>
                        <section>
                          <strong>建议动作</strong>
                          <p>{data.recommendation}</p>
                        </section>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
            <footer><ShieldCheck aria-hidden="true" /><span><strong>Evidence First</strong> · 所有结论均应建立在可核验的证据与来源之上。</span></footer>
          </section>
        </div>
      ) : pending || Object.keys(diagnostics).length === 0 ? (
        <div className="phase2-loading-surface" role="status" aria-live="polite">正在整理 Evidence 分析…</div>
      ) : (
        <div className="phase2-loading-surface">当前报告没有可展示的诊断证据。</div>
      )}
    </section>
  );
}
