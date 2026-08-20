"use client";

import { Check, Circle, FileSearch2, LoaderCircle, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { QuickStartGuide, RecentReviewCard } from "@/components/workspace-dashboard-panels";
import type { DiagnosticsState, LoadState } from "@/lib/client/report-state";
import type { EvaluateScoringResponse, PredictQuestionsResponse } from "@/lib/schemas/geo";

type AnalysisProgressWorkspaceProps = {
  sessionStatus: "idle" | "loading" | "success" | "error";
  scoring: LoadState<EvaluateScoringResponse>;
  questions: LoadState<PredictQuestionsResponse>;
  diagnostics: DiagnosticsState;
  diagnosticsSettled: boolean;
  diagnosticsPending: boolean;
  restoredFromCache: boolean;
  activeStep: number;
  animationKey: number;
  progressComplete: boolean;
  onReturnToEditor: () => void;
  onRestartAnalysis: () => void;
};

const FLOW_STEPS = [
  {
    label: "内容解析",
    description: "解析文章结构",
    activity: "正在理解文章结构...",
    activityDescription: "正在识别标题层级、段落结构与关键主题",
    duration: "00:08",
  },
  {
    label: "Evidence 分析",
    description: "定位事实依据",
    activity: "正在检查 Evidence...",
    activityDescription: "正在匹配事实陈述与潜在数据来源",
    duration: "00:15",
  },
  {
    label: "风险检测",
    description: "识别可信风险",
    activity: "正在检测内容风险...",
    activityDescription: "正在识别证据缺口、表达风险与引用障碍",
    duration: "00:12",
  },
  {
    label: "生成报告",
    description: "整理审查结论",
    activity: "正在生成审查报告...",
    activityDescription: "正在汇总评分、关键问题与下一步建议",
    duration: "00:10",
  },
] as const;

const STEP_PROGRESS_RANGES = [
  { start: 0, end: 25, duration: 1_050 },
  { start: 25, end: 55, duration: 1_050 },
  { start: 55, end: 80, duration: 1_150 },
  { start: 80, end: 100, duration: 1_400 },
] as const;

function useContinuousProgress(activeIndex: number, animationKey: number) {
  const initialRange = STEP_PROGRESS_RANGES[activeIndex] ?? STEP_PROGRESS_RANGES[0];
  const [progress, setProgress] = useState<number>(initialRange.start);
  const progressRef = useRef<number>(initialRange.start);
  const animationKeyRef = useRef(animationKey);

  useEffect(() => {
    const range = STEP_PROGRESS_RANGES[activeIndex] ?? STEP_PROGRESS_RANGES[0];
    const isNewRun = animationKeyRef.current !== animationKey;
    animationKeyRef.current = animationKey;

    const startProgress = isNewRun
      ? range.start
      : Math.max(range.start, Math.min(progressRef.current, range.end));
    const distance = range.end - startProgress;
    const fullDistance = range.end - range.start;

    progressRef.current = startProgress;
    setProgress(startProgress);
    if (distance <= 0) return;

    const duration = Math.max(120, range.duration * (distance / fullDistance));
    const startedAt = performance.now();
    let animationFrameId = 0;

    const animate = (timestamp: number) => {
      const ratio = Math.min((timestamp - startedAt) / duration, 1);
      const easedRatio = ratio < 0.5
        ? 2 * ratio * ratio
        : 1 - Math.pow(-2 * ratio + 2, 2) / 2;
      const nextProgress = startProgress + distance * easedRatio;

      progressRef.current = nextProgress;
      setProgress(nextProgress);
      if (ratio < 1) animationFrameId = window.requestAnimationFrame(animate);
    };

    animationFrameId = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(animationFrameId);
  }, [activeIndex, animationKey]);

  return Math.min(100, Math.max(0, progress));
}

export function AnalysisProgressWorkspace({
  sessionStatus,
  scoring,
  questions,
  diagnostics,
  diagnosticsSettled,
  diagnosticsPending,
  restoredFromCache,
  activeStep,
  animationKey,
  progressComplete,
  onReturnToEditor,
  onRestartAnalysis,
}: AnalysisProgressWorkspaceProps) {
  const diagnosticsFailed = Object.values(diagnostics).some((item) => item.status === "error");
  const dataReady = sessionStatus === "success" && scoring.status === "success" &&
    questions.status === "success" && diagnosticsSettled;
  const hasAnalysisError = sessionStatus === "error" || scoring.status === "error" ||
    questions.status === "error" || diagnosticsFailed;
  const analysisBusy = !restoredFromCache && (
    sessionStatus === "loading" ||
    scoring.status === "loading" ||
    questions.status === "loading" ||
    diagnosticsPending ||
    (!hasAnalysisError && (!progressComplete || !dataReady))
  );
  const activeIndex = Math.min(Math.max(Math.trunc(activeStep), 0), FLOW_STEPS.length - 1);
  const currentStep = FLOW_STEPS[activeIndex];
  const progress = useContinuousProgress(activeIndex, animationKey);
  const displayedProgress = Math.round(progress);
  const stepStatuses = FLOW_STEPS.map((_, index) =>
    index < activeIndex ? "complete" : index === activeIndex ? "active" : "waiting"
  ) as Array<"complete" | "active" | "waiting">;
  const taskItems = FLOW_STEPS.map((step, index) => {
    const status = stepStatuses[index];
    return {
      label: step.activity,
      description: status === "waiting" ? `等待${FLOW_STEPS[index - 1]?.label ?? "前置步骤"}完成后开始` : step.activityDescription,
      status,
      meta: status === "complete" ? step.duration : status === "active" ? "进行中" : "等待中",
    };
  });

  return (
    <section className="phase-analysis-workspace" aria-label="内容分析进度" aria-busy={analysisBusy}>
      <div className="phase-analysis-grid">
        <main className="phase-analysis-main">
          <header className="phase-analysis-heading">
            <p className="phase-editor-kicker">内容可信度审查</p>
            <h1>正在分析你的内容</h1>
            <p>Evidra 基于 Evidence First 原则，全面审查内容的可信度与可引用性。</p>
          </header>

          <section className="phase-analysis-card">
            <ol className="phase-analysis-stepper">
              {FLOW_STEPS.map((step, index) => (
                <li key={step.label} className={`is-${stepStatuses[index]}`}>
                  <span className="phase-analysis-step-icon">{String(index + 1).padStart(2, "0")}</span>
                  <strong>{step.label}</strong>
                  <small>{stepStatuses[index] === "complete" ? "完成" : stepStatuses[index] === "active" ? "进行中" : "等待中"}</small>
                </li>
              ))}
            </ol>

            <div className="phase-analysis-detail-surface">
              <div className="phase-analysis-center">
                <span className="phase-analysis-illustration"><FileSearch2 aria-hidden="true" /></span>
                <h2>{hasAnalysisError ? "分析需要处理" : currentStep.activity}</h2>
                <p>{hasAnalysisError ? "部分分析需要重试，已完成的结果会保留。" : currentStep.activityDescription}</p>
                <div className="phase-analysis-progress-row"><div><span style={{ width: `${progress}%` }} /></div><strong>{displayedProgress}%</strong></div>
              </div>

              <ol className="phase-analysis-task-list">
                {taskItems.map((item) => (
                  <li key={item.label} className={`is-${item.status}`}>
                    <span className="phase-analysis-task-icon">
                      {item.status === "complete" ? <Check aria-hidden="true" /> : item.status === "active" ? <LoaderCircle aria-hidden="true" className="is-spinning" /> : <Circle aria-hidden="true" />}
                    </span>
                    <div><strong>{item.label}</strong><p>{item.description}</p></div>
                    <time>{item.meta}</time>
                  </li>
                ))}
              </ol>
            </div>

            <p className="phase-analysis-note"><ShieldCheck aria-hidden="true" />分析过程可能需要数分钟，请勿关闭页面。</p>

            {hasAnalysisError ? (
              <div className="phase-analysis-error" role="alert">
                <strong>{sessionStatus === "error" ? "分析会话未能建立" : "部分分析需要处理"}</strong>
                <p>{sessionStatus === "error" ? "分析会话未能建立，请重试。" : "部分分析未完成，请重试失败步骤。"}</p>
                <button type="button" onClick={onRestartAnalysis}>重新运行分析</button>
                <button type="button" onClick={onReturnToEditor}>返回编辑</button>
              </div>
            ) : null}
          </section>
        </main>

        <aside className="phase-analysis-rail" aria-label="分析辅助信息">
          <QuickStartGuide />
          <RecentReviewCard />
        </aside>
      </div>

      <footer className="phase-editor-footer">
        <span><ShieldCheck aria-hidden="true" />你的内容仅用于审查分析，我们不会用于模型训练或其他用途。</span>
        <span>Evidra v1.0.0 <i />服务正常</span>
      </footer>
    </section>
  );
}
