import type { Metadata } from "next";

import { FeedbackWorkspace } from "@/components/feedback-workspace";

export const metadata: Metadata = {
  title: "Evidra 产品反馈",
  description: "帮助我们改进 Evidra 内容可信度审查体验。",
};

export default function FeedbackPage() {
  const feedbackUrl = process.env.NEXT_PUBLIC_FEEDBACK_URL?.trim() || "";

  return <FeedbackWorkspace feedbackUrl={feedbackUrl} />;
}
