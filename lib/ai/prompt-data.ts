export function formatUntrustedPromptData(value: unknown): string {
  const json = JSON.stringify(value, null, 2)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e");

  return `UNTRUSTED_JSON_DATA\n${json}`;
}
