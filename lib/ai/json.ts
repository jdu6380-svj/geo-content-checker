export function cleanModelJson(raw: string): string {
  const withoutFences = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const objectStart = withoutFences.indexOf("{");
  const objectEnd = withoutFences.lastIndexOf("}");

  if (objectStart === -1 || objectEnd < objectStart) return withoutFences;
  return withoutFences.slice(objectStart, objectEnd + 1);
}
