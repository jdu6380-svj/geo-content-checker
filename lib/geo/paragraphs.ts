import type { Paragraph } from "@/lib/schemas/geo";

const MAX_PARAGRAPH_LENGTH = 700;

function splitLongBlock(block: string): string[] {
  if (block.length <= MAX_PARAGRAPH_LENGTH) return [block];

  const sentences = block
    .split(/(?<=[。！？!?；;])\s*/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences.length ? sentences : [block]) {
    if (current && current.length + sentence.length > MAX_PARAGRAPH_LENGTH) {
      chunks.push(current);
      current = sentence;
      continue;
    }

    if (!current && sentence.length > MAX_PARAGRAPH_LENGTH) {
      for (let index = 0; index < sentence.length; index += MAX_PARAGRAPH_LENGTH) {
        chunks.push(sentence.slice(index, index + MAX_PARAGRAPH_LENGTH));
      }
      continue;
    }

    current += sentence;
  }

  if (current) chunks.push(current);
  return chunks;
}

export function createNumberedParagraphs(content: string): Paragraph[] {
  const normalized = content
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ \u00a0]+/g, " ")
    .trim();

  const rawBlocks = normalized
    .split(/\n{2,}|\n(?=#{1,6}\s)|\n(?=[一二三四五六七八九十]+[、.．])|\n(?=\d+[、.．])/)
    .map((block) => block.trim())
    .filter(Boolean);

  const chunks = (rawBlocks.length ? rawBlocks : [normalized]).flatMap(splitLongBlock);

  return chunks.map((text, index) => ({
    id: `Para-${index + 1}`,
    text,
  }));
}
