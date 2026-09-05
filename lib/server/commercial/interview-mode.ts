/** Vercel Preview is the portfolio surface; Production authentication is never bypassed. */
export function isInterviewMode(): boolean {
  if (process.env.VERCEL_ENV === "preview") return true;
  return process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_EVIDRA_INTERVIEW_MODE?.trim() === "true";
}

export const INTERVIEW_SUBJECT_ID = "interview-visitor";
export const INTERVIEW_WORKSPACE_ID = "interview-workspace";
