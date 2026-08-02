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

  return (
    <section id="recheck-comparison" className="recheck-comparison surface-flat mt-4 overflow-hidden border-t-[3px] border-t-[#5964cf]">
      <header className="flex flex-col gap-3 border-b border-[#e3e7eb] px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="min-w-0">
          <p className="section-kicker text-[#5964cf]">RECHECK RESULT</p>
          <h2 className="mt-1.5 text-lg font-semibold text-[#111827]">修改前与重新验证结果</h2>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-[#737d89]">
            只对问题文本完全一致的诊断判断改善；问题集合变化不会自动视为风险消除。
          </p>
        </div>
        <span className="status-badge status-secondary inline-flex w-fit items-center gap-1.5 px-2.5 py-1 text-xs font-semibold">
          <CheckCircle2 aria-hidden="true" className="size-3.5" />
          完整复检已完成
        </span>
      </header>

      <div className="recheck-summary-grid grid sm:grid-cols-3">
        <div className="px-5 py-4 sm:px-6">
          <p className="data-label">GEO 得分</p>
          <div className="mt-2 flex items-end gap-2">
            <span className="text-2xl font-semibold tabular-nums text-[#111827]">{baseline.totalScore}</span>
            <ArrowRight aria-hidden="true" className="mb-1 size-4 text-[#9aa2ac]" />
            <span className="text-2xl font-semibold tabular-nums text-[#111827]">{current.totalScore}</span>
          </div>
          <span className="mt-2 block text-xs font-semibold text-[#5964cf]">变化 {scoreChangeLabel(scoreChange)}</span>
        </div>
        <div className="px-5 py-4 sm:px-6">
          <p className="data-label">中高风险诊断</p>
          <div className="mt-2 flex items-end gap-2">
            <span className="text-2xl font-semibold tabular-nums text-[#111827]">{beforeRisk}</span>
            <ArrowRight aria-hidden="true" className="mb-1 size-4 text-[#9aa2ac]" />
            <span className="text-2xl font-semibold tabular-nums text-[#111827]">{afterRisk}</span>
          </div>
          <span className="mt-2 block text-xs text-[#737d89]">仅统计已完成诊断</span>
        </div>
        <div className="px-5 py-4 sm:px-6">
          <p className="data-label">逐项对照</p>
          <div className="mt-2 flex items-end gap-2">
            <span className="text-2xl font-semibold tabular-nums text-[#0f766e]">{improved.length}</span>
            <span className="mb-1 text-xs text-[#737d89]">项确认改善</span>
          </div>
          <span className="mt-2 block text-xs text-[#737d89]">
            {improved.length} 改善 · {unchanged.length} 无变化 · {regressed.length} 下降
          </span>
        </div>
      </div>

      <div className="grid border-t border-[#e3e7eb] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="border-b border-[#e3e7eb] px-5 py-5 lg:border-b-0 lg:border-r lg:px-6">
          <h3 className="text-sm font-semibold text-[#252a31]">四项指标变化</h3>
          <div className="mt-4 grid gap-3">
            {REPORT_DIMENSION_KEYS.map((key) => {
              const before = baseline.dimensions[key].score;
              const after = current.dimensions[key].score;
              const change = after - before;
              const ChangeIcon = change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : Minus;
              return (
                <div key={key} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-[#edf0f2] pb-3 last:border-b-0 last:pb-0">
                  <span className="text-xs font-medium text-[#59636f]">{DIMENSION_LABELS[key]}</span>
                  <span className="font-mono text-xs tabular-nums text-[#69717d]">{before} → {after}</span>
                  <span className={`inline-flex min-w-12 items-center justify-end gap-1 text-xs font-semibold ${change > 0 ? "text-[#0f766e]" : change < 0 ? "text-[#a43e2b]" : "text-[#858c97]"}`}>
                    <ChangeIcon aria-hidden="true" className="size-3.5" />
                    {scoreChangeLabel(change)}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-[11px] leading-5 text-[#858c97]">分数变化只反映本次审查结果，不代表外部平台收录、引用或排名变化。</p>
        </section>

        <section className="px-5 py-5 lg:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[#252a31]">问题变化</h3>
            {newIssues.length ? <span className="text-xs font-medium text-[#a86313]">新增 {newIssues.length} 项关注</span> : null}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <p className="flex items-center gap-2 text-xs font-semibold text-[#0f766e]">
                <CheckCircle2 aria-hidden="true" className="size-3.5" />
                已确认改善
              </p>
              {improved.length ? (
                <ul className="mt-3 grid gap-2">
                  {improved.slice(0, 3).map(({ before }) => (
                    <li key={before.question} className="text-xs leading-5 text-[#59636f]">{before.question}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs leading-5 text-[#858c97]">暂无可确认的逐项改善。继续核对未解决问题。</p>
              )}
            </div>
            <div>
              <p className="flex items-center gap-2 text-xs font-semibold text-[#69717d]">
                <CircleDot aria-hidden="true" className="size-3.5" />
                无明确变化
              </p>
              {unchanged.length ? (
                <ul className="mt-3 grid gap-2">
                  {unchanged.slice(0, 3).map(({ after: item }) => (
                    <li key={item.question} className="text-xs leading-5 text-[#59636f]">{item.question}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs leading-5 text-[#858c97]">相同问题中暂无完全不变的诊断。</p>
              )}
            </div>
            <div>
              <p className="flex items-center gap-2 text-xs font-semibold text-[#a43e2b]">
                <ArrowDownRight aria-hidden="true" className="size-3.5" />
                出现下降
              </p>
              {regressed.length ? (
                <ul className="mt-3 grid gap-2">
                  {regressed.slice(0, 3).map(({ after: item }) => (
                    <li key={item.question} className="text-xs leading-5 text-[#59636f]">{item.question}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs leading-5 text-[#858c97]">相同问题中未发现明确下降项。</p>
              )}
            </div>
          </div>
          {newIssues.length ? (
            <p className="mt-4 border-t border-[#edf0f2] pt-3 text-[11px] leading-5 text-[#a86313]">
              本轮新增 {newIssues.length} 项需关注问题；因修改前没有相同问题，不计入“下降”数量。
            </p>
          ) : null}
          {unpaired.length ? (
            <p className="mt-4 border-t border-[#edf0f2] pt-3 text-[11px] leading-5 text-[#858c97]">
              {unpaired.length} 项修改前问题未出现在本轮问题集合中，无法据此判断已改善或下降。
            </p>
          ) : null}
        </section>
      </div>
    </section>
  );
}
