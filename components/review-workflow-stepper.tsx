import { ArrowRight } from "lucide-react";

import type { WorkspaceStage } from "@/components/workspace-command-bar";

type ReviewWorkflowStepperProps = {
  stage: WorkspaceStage;
};

const STEPS = [
  { id: "review", label: "体检", description: "提交内容" },
  { id: "report", label: "报告", description: "理解风险" },
  { id: "advice", label: "修改建议", description: "优化内容" },
  { id: "recheck", label: "复检", description: "对比变化" },
] as const;

const STAGE_INDEX: Record<WorkspaceStage, number> = {
  review: 0,
  report: 1,
  advice: 2,
  recheck: 3,
};

export function ReviewWorkflowStepper({ stage }: ReviewWorkflowStepperProps) {
  const activeIndex = STAGE_INDEX[stage];

  return (
    <ol className="review-workflow-stepper" aria-label="内容可信度审查流程">
      {STEPS.map((step, index) => (
        <li key={step.id} className="review-workflow-item-wrap">
          <div
            className={`review-workflow-item ${index === activeIndex ? "is-active" : ""} ${index < activeIndex ? "is-complete" : ""}`}
            aria-current={index === activeIndex ? "step" : undefined}
          >
            <span className="review-workflow-index">{String(index + 1).padStart(2, "0")}</span>
            <span>
              <strong>{step.label}</strong>
              <small>{step.description}</small>
            </span>
          </div>
          {index < STEPS.length - 1 ? <ArrowRight aria-hidden="true" className="review-workflow-arrow" /> : null}
        </li>
      ))}
    </ol>
  );
}
