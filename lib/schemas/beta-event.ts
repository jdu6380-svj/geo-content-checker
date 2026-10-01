import { z } from "zod";

const runIdSchema = z.string().uuid();

export const betaEventSchema = z.discriminatedUnion("event", [
  z.object({ event: z.literal("visit") }).strict(),
  z.object({ event: z.literal("editor_started") }).strict(),
  z.object({ event: z.literal("feedback_clicked") }).strict(),
  z
    .object({
      event: z.literal("analysis_started"),
      runId: runIdSchema,
    })
    .strict(),
  z
    .object({
      event: z.literal("analysis_completed"),
      runId: runIdSchema,
    })
    .strict(),
  z
    .object({
      event: z.literal("report_viewed"),
      runId: runIdSchema,
    })
    .strict(),
  z
    .object({
      event: z.literal("patch_requested"),
      runId: runIdSchema,
    })
    .strict(),
  z
    .object({
      event: z.literal("patch_generated"),
      runId: runIdSchema,
    })
    .strict(),
  z
    .object({
      event: z.literal("patch_copied"),
      runId: runIdSchema,
    })
    .strict(),
  z
    .object({
      event: z.literal("diagnosis_feedback"),
      runId: runIdSchema,
      diagnosticIndex: z.number().int().min(0).max(9),
      helpful: z.boolean(),
    })
    .strict(),
]);

export type BetaEvent = z.infer<typeof betaEventSchema>;
export type BetaEventName = BetaEvent["event"];
export type BetaRunEvent = Extract<BetaEvent, { runId: string }>;
