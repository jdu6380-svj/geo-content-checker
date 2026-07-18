import { z } from "zod";

export const betaEventSchema = z.discriminatedUnion("event", [
  z.object({ event: z.literal("visit") }).strict(),
  z.object({ event: z.literal("feedback_clicked") }).strict(),
  z
    .object({
      event: z.literal("analysis_completed"),
      runId: z.string().uuid(),
    })
    .strict(),
]);

export type BetaEvent = z.infer<typeof betaEventSchema>;
export type BetaEventName = BetaEvent["event"];
