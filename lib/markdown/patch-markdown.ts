type PatchMarkdownInput = {
  faqs: Array<{
    question: string;
    answer: string;
    evidence: { paragraphId: string };
  }>;
  factCards: Array<{
    label: string;
    value: string;
    evidence: { paragraphId: string };
  }>;
};

function escapeMarkdownText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeMarkdownHeading(value: string): string {
  return escapeMarkdownText(value.replace(/\s+/g, " ").trim()).replace(
    /([\\`*_{}\[\]()#+!|])/g,
    "\\$1",
  );
}

export function formatPatchMarkdown(response: PatchMarkdownInput): string {
  const faqMarkdown = response.faqs
    .map(
      (faq) =>
        `### ${escapeMarkdownHeading(faq.question)}\n\n${escapeMarkdownText(faq.answer)}\n\n> 原文证据：${faq.evidence.paragraphId}`,
    )
    .join("\n\n");
  const factMarkdown = response.factCards
    .map(
      (card) =>
        `### ${escapeMarkdownHeading(card.label)}\n\n${escapeMarkdownText(card.value)}\n\n> 原文证据：${card.evidence.paragraphId}`,
    )
    .join("\n\n");

  return `## 常见问题\n\n${faqMarkdown}\n\n## 事实卡片\n\n${factMarkdown}`;
}
