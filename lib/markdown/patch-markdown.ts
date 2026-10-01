import type { PatchAction } from "@/lib/schemas/geo";

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

function renderAction(action: PatchAction): string {
  if (action.type === "author_evidence") {
    return `### ${escapeMarkdownHeading(action.field)}\n\n${escapeMarkdownText(action.reason)}${
      action.relatedQuestion
        ? `\n\n> 关联问题：${escapeMarkdownText(action.relatedQuestion)}`
        : ""
    }`;
  }

  if (action.type === "structure_change") {
    return `### ${escapeMarkdownHeading(action.title)}\n\n${escapeMarkdownText(action.instruction)}\n\n> 目标段落：${action.targetParagraphIds.join(", ")}`;
  }

  if (action.type === "faq") {
    return `### ${escapeMarkdownHeading(action.question)}\n\n${escapeMarkdownText(action.answer)}\n\n> 原文证据：${action.evidence.paragraphId}`;
  }

  return `### ${escapeMarkdownHeading(action.label)}\n\n${escapeMarkdownText(action.value)}\n\n> 原文证据：${action.evidence.paragraphId}`;
}

export function formatPatchMarkdown(actions: PatchAction[]): string {
  const authorEvidence = actions.filter((action) => action.type === "author_evidence");
  const structureChanges = actions.filter((action) => action.type === "structure_change");
  const faqs = actions.filter((action) => action.type === "faq");
  const factCards = actions.filter((action) => action.type === "fact_card");
  const sections: string[] = [];

  if (authorEvidence.length) {
    sections.push(`## 作者需补充的证据\n\n${authorEvidence.map(renderAction).join("\n\n")}`);
  }
  if (structureChanges.length) {
    sections.push(`## 结构调整建议\n\n${structureChanges.map(renderAction).join("\n\n")}`);
  }
  if (faqs.length) {
    sections.push(`## 常见问题\n\n${faqs.map(renderAction).join("\n\n")}`);
  }
  if (factCards.length) {
    sections.push(`## 事实卡片\n\n${factCards.map(renderAction).join("\n\n")}`);
  }

  return sections.join("\n\n");
}
