import type { Metadata } from "next";

import { FeedbackWorkspace } from "@/components/feedback-workspace";

const PUBLIC_BETA_FEEDBACK_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSdMoDgDsLlI2AgxvzgtVdyqYvtFxTJUcVopJg2mfDtkMiWgbQ/viewform?usp=publish-editor";

export const metadata: Metadata = {
  title: "Evidra Beta 用户反馈",
  description: "帮助我们改进 Evidra 内容可信度审查体验。",
};

export default function FeedbackPage() {
  const feedbackUrl = process.env.NEXT_PUBLIC_FEEDBACK_URL || PUBLIC_BETA_FEEDBACK_URL;

  return <FeedbackWorkspace feedbackUrl={feedbackUrl} />;
}
