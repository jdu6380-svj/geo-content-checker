import type { Metadata } from "next";

import { FeedbackWorkspace } from "@/components/feedback-workspace";

const PUBLIC_BETA_FEEDBACK_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSdMoDgDsLlI2AgxvzgtVdyqYvtFxTJUcVopJg2mfDtkMiWgbQ/viewform?usp=publish-editor";

export const metadata: Metadata = {
  title: "Beta 反馈",
  description: "提交 Evidra Beta 使用反馈。",
};

export default function FeedbackPage() {
  const feedbackUrl = process.env.NEXT_PUBLIC_FEEDBACK_URL || PUBLIC_BETA_FEEDBACK_URL;

  return <FeedbackWorkspace feedbackUrl={feedbackUrl} />;
}
