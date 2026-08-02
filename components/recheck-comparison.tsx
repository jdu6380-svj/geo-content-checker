"use client";

import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  CircleDot,
  Minus,
  RotateCcw,
} from "lucide-react";

import {
  REPORT_DIMENSION_KEYS,
  isReportIssue,
  type ReportComparisonDiagnostic,
  type ReportComparisonSnapshot,
  type ReportDimensionKey,
} from "@/lib/client/report-comparison";

type RecheckComparisonProps = {
  baseline: ReportComparisonSnapshot;
  current: ReportComparisonSnapshot | null;
  status: "running" | "complete" | "error" | "cached";
};

const DIMENSION_LABELS: Record<ReportDimensionKey, string> = {
  questionCoverage: "问题覆盖度",
  factCompleteness: "事实完整度",
  structureClarity: "结构清晰度",
  freshness: "时效性",
};

const RISK_RANK = { low: 0, medium: 1, high: 2 } as const;
const ANSWERABILITY_RANK = { "有风险": 0, "信息不足": 1, "可以完全回答": 2 } as const;

type ComparisonOutcome = "improved" | "unchanged" | "regressed";

function normalizedQuestion(question: string): string {
  return question.trim().replace(/\s+/g, " ");
}

function comparisonStatus(
  before: ReportComparisonDiagnostic,
  after: ReportComparisonDiagnostic,
): ComparisonOutcome {
  const evidenceChange = before.evidenceStatus === after.evidenceStatus
    ? 0
    : after.evidenceStatus === "valid"
      ? 1
      : before.evidenceStatus === "valid"
        ? -1
        : 0;
  const changes = [
    RISK_RANK[before.riskLevel] - RISK_RANK[after.riskLevel],
    ANSWERABILITY_RANK[after.answerability] - ANSWERABILITY_RANK[before.answerability],
    evidenceChange,
  ];
  const hasImprovement = changes.some((change) => change > 0);
  const hasRegression = changes.some((change) => change < 0);
  if (hasRegression) return "regressed";
  return hasImprovement ? "improved" : "unchanged";
}

function scoreChangeLabel(change: number): string {
  if (change > 0) return `+${change}`;
  if (change < 0) return String(change);
  return "无变化";
}

function statusCopy(status: RecheckComparisonProps["status"]) {
  if (status === "cached") {
    return {
      title: "尚未生成新的复检结果",
      description: "当前内容与上次分析输入一致，因此显示的是缓存报告。修改正文后再次分析，才会形成可比较的新结果。",
      icon: RotateCcw,
      className: "status-warning",
    };
  }
  if (status === "error") {
    return {
      title: "复检尚未完整结束",
      description: "本轮分析存在未完成模块。已保留修改前基线，待完整分析成功后再显示变化判断。",
      icon: AlertTriangle,
      className: "status-danger",
    };
  }
  return {
    title: "正在重新验证修改结果",
    description: "系统正在运行同一套完整审查。结果完成前，不提前判断风险是否改善。",
    icon: RotateCcw,
    className: "status-info",
  };
}

export function RecheckComparison({ baseline, current, status }: RecheckComparisonProps) {
  if (status !== "complete" || !current) {
    const presentation = statusCopy(status);
    const StatusIcon = presentation.icon;
    const baselineIssueCount = baseline.diagnostics.filter(isReportIssue).length;

    return (
      <section id="recheck-comparison" className={`recheck-comparison surface-flat mt-4 overflow-hidden border-l-[3px] ${presentation.className}`}>
        <div className="flex items-start gap-3 px-4 py-4 sm:px-5">
          <StatusIcon aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${status === "running" ? "animate-spin motion-reduce:animate-none" : ""}`} />
          <div className="min-w-0">
            <p className="text-sm font-semibold">{presentation.title}</p>
            <p className="mt-1 text-xs leading-5 opacity-80">{presentation.description}</p>
            <p className="mt-2 text-[11px] font-semibold opacity-75">
              修改前基线：{baseline.totalScore} 分 · {baselineIssueCount} 项需关注
            </p>
          </div>
        </div>
      </section>
    );
  }

  const currentByQuestion = new Map(
    current.diagnostics.map((item) => [normalizedQuestion(item.question), item]),
  );
  const baselineIssues = baseline.diagnostics.filter(isReportIssue);
  const matched = baseline.diagnostics.flatMap((before) => {
    const after = currentByQuestion.get(normalizedQuestion(before.question));
    return after ? [{ before, after, status: comparisonStatus(before, after) }] : [];
  });
  const improved = matched.filter((item) => item.status === "improved");
  const unchanged = matched.filter((item) => item.status === "unchanged");
  const regressed = matched.filter((item) => item.status === "regressed");
  const unpaired = baseline.diagnostics.filter(
    (item) => !currentByQuestion.has(normalizedQuestion(item.question)),
  );
  const baselineQuestions = new Set(baseline.diagnostics.map((item) => normalizedQuestion(item.question)));
  const newIssues = current.diagnostics.filter(
    (item) => isReportIssue(item) && !baselineQuestions.has(normalizedQuestion(item.question)),
  );
  const scoreChange = current.totalScore - baseline.totalScore;
  const beforeRisk = baselineIssues.filter((item) => item.riskLevel === "high" || item.riskLevel === "medium").length;
  const afterIssues = current.diagnostics.filter(isReportIssue);
  const afterRisk = afterIssues.filter((item) => item.riskLevel === "high" || item.riskLevel === "medium").length;
  const notComparableItems = [
    ...unpaired.map((item) => ({ question: item.question, context: "修改前问题未在本轮以相同文本出现" })),
    ...newIssues.map((item) => ({ question: item.question, context: "本轮新增关注项" })),
  ];
  const outcomeGroups = [
    {
      label: "改善",
      count: improved.length,
      icon: CheckCircle2,
      className: "recheck-outcome-improved",
      description: "同一问题至少一项判断改善，且没有出现下降。",
      empty: "暂无可确认的逐项改善。",
      items: improved.map(({ after }) => ({ question: after.question, context: "同一问题可直接对照" })),
    },
    {
      label: "无变化",
      count: unchanged.length,
      icon: Minus,
      className: "recheck-outcome-unchanged",
      description: "同一问题的风险、回答度与 Evidence 状态均未变化。",
      empty: "暂无完全不变的同名问题。",
      items: unchanged.map(({ after }) => ({ question: after.question, context: "判断结果保持一致" })),
    },
    {
      label: "下降",
      count: regressed.length,
      icon: ArrowDownRight,
      className: "recheck-outcome-regressed",
      description: "同一问题至少一项判断下降，需要优先人工核对。",
      empty: "同名问题中未发现明确下降。",
      items: regressed.map(({ after }) => ({ question: after.question, context: "至少一项判断出现下降" })),
    },
    {
      label: "不可比较",
      count: notComparableItems.length,
      icon: CircleDot,
      className: "recheck-outcome-unpaired",
      description: "问题文本没有一一对应，不推断为改善或下降。",
      empty: "所有问题均可与修改前直接对照。",
      items: notComparableItems,
    },
  ];
  const scoreChangeClassName = scoreChange > 0
    ? "recheck-change-positive"
    : scoreChange < 0
      ? "recheck-change-negative"
      : "recheck-change-neutral";

  return (
    <section id="recheck-comparison" className="recheck-comparison surface-flat mt-4 overflow-hidden border-t-[3px] border-t-[var(--geo-secondary)]">
      <header className="flex flex-col gap-3 border-b border-[var(--geo-border)] px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="min-w-0">
          <p className="section-kicker text-[var(--geo-secondary)]">RECHECK / BEFORE & AFTER</p>
          <h2 className="mt-1.5 text-lg font-semibold text-[var(--geo-text)]">Baseline 与 New Result</h2>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-[var(--geo-text-muted)]">
            只对问题文本完全一致的诊断进行逐项比较；问题集合变化不会自动视为风险消除。
          </p>
        </div>
        <span className="status-badge status-secondary inline-flex w-fit items-center gap-1.5 px-2.5 py-1 text-xs font-semibold">
          <CheckCircle2 aria-hidden="true" className="size-3.5" />
          同一审查规则已完成
        </span>
      </header>

      <div className="recheck-snapshot-grid grid md:grid-cols-[minmax(0,1fr)_64px_minmax(0,1fr)]">
        <section className="recheck-snapshot px-4 py-5 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="data-label">BASELINE / 修改前</p>
            <span className="status-badge status-neutral px-2 py-0.5 text-[10px]">已固化</span>
          </div>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-3xl font-semibold tabular-nums text-[var(--geo-text)]">{baseline.totalScore}</span>
            <span className="mb-1 text-xs text-[var(--geo-text-soft)]">/ 100</span>
          </div>
          <dl className="recheck-snapshot-meta mt-4 grid grid-cols-2 gap-3">
            <div>
              <dt>中高风险</dt>
              <dd>{beforeRisk} 项</dd>
            </div>
            <div>
              <dt>需关注诊断</dt>
              <dd>{baselineIssues.length} 项</dd>
            </div>
          </dl>
        </section>

        <div className="recheck-transition" aria-label={`总分变化 ${scoreChangeLabel(scoreChange)}`}>
          <ArrowRight aria-hidden="true" className="size-4" />
          <span className={scoreChangeClassName}>{scoreChangeLabel(scoreChange)}</span>
        </div>

        <section className="recheck-snapshot is-current px-4 py-5 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="data-label">NEW RESULT / 修改后</p>
            <span className="status-badge status-secondary px-2 py-0.5 text-[10px]">本轮复检</span>
          </div>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-3xl font-semibold tabular-nums text-[var(--geo-text)]">{current.totalScore}</span>
            <span className="mb-1 text-xs text-[var(--geo-text-soft)]">/ 100</span>
          </div>
          <dl className="recheck-snapshot-meta mt-4 grid grid-cols-2 gap-3">
            <div>
              <dt>中高风险</dt>
              <dd>{afterRisk} 项</dd>
            </div>
            <div>
              <dt>需关注诊断</dt>
              <dd>{afterIssues.length} 项</dd>
            </div>
          </dl>
        </section>
      </div>

      <div className="recheck-outcome-grid grid border-t border-[var(--geo-border)] sm:grid-cols-2 xl:grid-cols-4" aria-label="复检结果分类">
        {outcomeGroups.map((group) => {
          const OutcomeIcon = group.icon;
          return (
            <div key={group.label} className={`recheck-outcome-summary ${group.className}`}>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-xs font-semibold">
                  <OutcomeIcon aria-hidden="true" className="size-3.5" />
                  {group.label}
                </span>
                <span className="text-xl font-semibold tabular-nums">{group.count}</span>
              </div>
              <p className="mt-2 text-[11px] leading-5 text-[var(--geo-text-muted)]">{group.description}</p>
            </div>
          );
        })}
      </div>

      <div className="recheck-detail-grid grid border-t border-[var(--geo-border)] lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
        <section className="border-b border-[var(--geo-border)] px-4 py-5 sm:px-6 lg:border-b-0 lg:border-r">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="data-label">SCORE LEDGER</p>
              <h3 className="mt-1 text-sm font-semibold text-[var(--geo-text)]">四项评分变化</h3>
            </div>
            <span className={`text-xs font-semibold ${scoreChangeClassName}`}>总分 {scoreChangeLabel(scoreChange)}</span>
          </div>
          <div className="recheck-dimension-table mt-4">
            <div className="recheck-dimension-head">
              <span>维度</span>
              <span>Baseline</span>
              <span>New Result</span>
              <span>变化</span>
            </div>
            {REPORT_DIMENSION_KEYS.map((key) => {
              const before = baseline.dimensions[key].score;
              const after = current.dimensions[key].score;
              const change = after - before;
              const ChangeIcon = change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : Minus;
              return (
                <div key={key} className="recheck-dimension-row">
                  <span className="text-xs font-medium text-[var(--geo-text-body)]">{DIMENSION_LABELS[key]}</span>
                  <span className="font-mono text-xs tabular-nums text-[var(--geo-text-muted)]">{before}</span>
                  <span className="font-mono text-xs tabular-nums text-[var(--geo-text)]">{after}</span>
                  <span className={`inline-flex items-center justify-end gap-1 text-xs font-semibold ${change > 0 ? "recheck-change-positive" : change < 0 ? "recheck-change-negative" : "recheck-change-neutral"}`}>
                    <ChangeIcon aria-hidden="true" className="size-3.5" />
                    {scoreChangeLabel(change)}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-[11px] leading-5 text-[var(--geo-text-soft)]">分数变化只反映本次审查结果，不代表外部平台收录、引用或排名变化。</p>
        </section>

        <section className="px-4 py-5 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="data-label">DIAGNOSIS CHANGE LOG</p>
              <h3 className="mt-1 text-sm font-semibold text-[var(--geo-text)]">逐项变化记录</h3>
            </div>
            <span className="text-xs text-[var(--geo-text-soft)]">仅列出前 3 项</span>
          </div>
          <div className="recheck-outcome-details mt-4 grid sm:grid-cols-2">
            {outcomeGroups.map((group) => {
              const OutcomeIcon = group.icon;
              return (
                <section key={group.label} className={`recheck-outcome-detail ${group.className}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="flex items-center gap-2 text-xs font-semibold">
                      <OutcomeIcon aria-hidden="true" className="size-3.5" />
                      {group.label}
                    </p>
                    <span className="font-mono text-[10px] font-semibold tabular-nums">{group.count}</span>
                  </div>
                  {group.items.length ? (
                    <ul className="mt-3 grid gap-3">
                      {group.items.slice(0, 3).map((item) => (
                        <li key={`${group.label}-${item.question}`}>
                          <p className="text-xs leading-5 text-[var(--geo-text-body)]">{item.question}</p>
                          <p className="mt-1 text-[10px] leading-4 text-[var(--geo-text-soft)]">{item.context}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-xs leading-5 text-[var(--geo-text-soft)]">{group.empty}</p>
                  )}
                </section>
              );
            })}
          </div>
          <p className="mt-4 border-t border-[var(--geo-border)] pt-3 text-[11px] leading-5 text-[var(--geo-text-soft)]">
            改善、无变化与下降仅来自同名问题的真实状态变化；新增或未配对问题统一归入不可比较。
          </p>
        </section>
      </div>
    </section>
  );
}
