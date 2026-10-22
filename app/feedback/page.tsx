import type { Metadata } from "next";

import { FeedbackWorkspace } from "@/components/feedback-workspace";
import { isHttpsUrl, isValidSupportEmail } from "@/lib/feedback-config";

export const metadata: Metadata = {
  title: "Evidra 用户反馈",
  description: "帮助我们改进 Evidra 内容可信度审查体验。",
};

export default function FeedbackPage() {
  const configuredFeedbackUrl = process.env.NEXT_PUBLIC_FEEDBACK_URL?.trim();
  const configuredSupportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();
  const feedbackUrl = isHttpsUrl(configuredFeedbackUrl) ? configuredFeedbackUrl : undefined;
  const supportEmail = isValidSupportEmail(configuredSupportEmail)
    ? configuredSupportEmail
    : undefined;

  return <FeedbackWorkspace feedbackUrl={feedbackUrl} supportEmail={supportEmail} />;
}
