import type {
  ModelContentAction,
  Paragraph,
} from "@/lib/schemas/geo";

const MAX_EVIDENCE_QUOTE_LENGTH = 400;
const graphemeSegmenter = new Intl.Segmenter("und", {
  granularity: "grapheme",
});

type CanonicalSource = {
  text: string;
  startBoundaries: Map<number, number>;
  endBoundaries: Map<number, number>;
};

function canonicalizeSource(value: string): CanonicalSource {
  let text = "";
  let inWhitespace = false;
  const startBoundaries = new Map<number, number>();
  const endBoundaries = new Map<number, number>();

  for (const { index, segment } of graphemeSegmenter.segment(value)) {
    const normalized = segment.normalize("NFKC");
    const originalEnd = index + segment.length;

    if (/^\s+$/u.test(normalized)) {
      if (!inWhitespace) {
        startBoundaries.set(text.length, index);
        text += " ";
      }
      endBoundaries.set(text.length, originalEnd);
      inWhitespace = true;
      continue;
    }

    inWhitespace = false;
    startBoundaries.set(text.length, index);
    text += normalized;
    endBoundaries.set(text.length, originalEnd);
  }

  return { text, startBoundaries, endBoundaries };
}

function uniqueCanonicalSourceSpan(
  paragraph: string,
  quote: string,
): string | null {
  const source = canonicalizeSource(paragraph);
  const canonicalQuote = canonicalizeSource(quote).text;
  if (!canonicalQuote) return null;

  let match: { start: number; end: number } | null = null;
  let searchFrom = 0;

  while (searchFrom <= source.text.length - canonicalQuote.length) {
    const canonicalStart = source.text.indexOf(canonicalQuote, searchFrom);
    if (canonicalStart < 0) break;

    const canonicalEnd = canonicalStart + canonicalQuote.length;
    const originalStart = source.startBoundaries.get(canonicalStart);
    const originalEnd = source.endBoundaries.get(canonicalEnd);

    if (originalStart !== undefined && originalEnd !== undefined) {
      if (match) return null;
      match = { start: originalStart, end: originalEnd };
    }

    searchFrom = canonicalStart + 1;
  }

  if (!match) return null;
  const anchored = paragraph.slice(match.start, match.end);
  return anchored.length <= MAX_EVIDENCE_QUOTE_LENGTH ? anchored : null;
}

export function anchorContentActionQuotes(
  actions: ModelContentAction[],
  paragraphs: Paragraph[],
): ModelContentAction[] | null {
  const paragraphMap = new Map(
    paragraphs.map((paragraph) => [paragraph.id, paragraph.text]),
  );
  const anchored: ModelContentAction[] = [];

  for (const action of actions) {
    const paragraph = paragraphMap.get(action.evidence.paragraphId);
    if (!paragraph) return null;

    const actionText = action.type === "faq" ? action.answer : action.value;
    if (actionText !== action.evidence.quote) return null;

    const quote = uniqueCanonicalSourceSpan(
      paragraph,
      action.evidence.quote,
    );
    if (!quote) return null;

    const evidence = { ...action.evidence, quote };
    anchored.push(
      action.type === "faq"
        ? { ...action, answer: quote, evidence }
        : { ...action, value: quote, evidence },
    );
  }

  return anchored;
}
