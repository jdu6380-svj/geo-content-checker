import type { PatchChecklistItem } from "./patch-checklist.ts";

export type PatchSyncDecision = { sourceChanged: boolean; incomingSignature: string; lastIncomingSignature: string; userEdited: boolean };
export function shouldAdoptExternalPatchState(decision: PatchSyncDecision): boolean { if (decision.sourceChanged) return true; if (decision.incomingSignature === decision.lastIncomingSignature) return false; return !decision.userEdited; }

export type PatchSourceInput = {
  sourceHash?: string | null;
  title: string;
  paragraphs: Array<{ id: string; text: string }>;
};

/** Prefer the report hash; the full-text fallback prevents same-length edits from colliding. */
export function createPatchSourceSignature(input: PatchSourceInput): string {
  if (input.sourceHash) return `hash:${input.sourceHash}`;
  return JSON.stringify({
    title: input.title,
    paragraphs: input.paragraphs.map((paragraph) => [paragraph.id, paragraph.text]),
  });
}

export function filterPatchChecklistForSource(items: PatchChecklistItem[], sourceHash?: string | null): PatchChecklistItem[] {
  return sourceHash ? items.filter((item) => item.sourceReportHash === sourceHash) : items;
}
