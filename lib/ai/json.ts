export const JSON_BOUNDARY_CHARACTER_TYPES = [
  "none",
  "object-open",
  "object-close",
  "array-open",
  "array-close",
  "double-quote",
  "single-quote",
  "backtick",
  "digit",
  "minus",
  "letter",
  "whitespace",
  "other",
] as const;

export type JsonBoundaryCharacterType =
  (typeof JSON_BOUNDARY_CHARACTER_TYPES)[number];

export const JSON_PARSER_ERROR_NAMES = [
  "SyntaxError",
  "Error",
  "UnknownError",
] as const;

export type JsonParserErrorName = (typeof JSON_PARSER_ERROR_NAMES)[number];

export const JSON_ERROR_CATEGORIES = [
  "unterminated_string",
  "invalid_escape",
  "unexpected_token",
  "unexpected_end",
  "invalid_character",
  "other",
] as const;

export type JsonErrorCategory = (typeof JSON_ERROR_CATEGORIES)[number];

export interface JsonParseFailureTelemetry {
  responseLength: number;
  trimmedLength: number;
  firstCharType: JsonBoundaryCharacterType;
  lastCharType: JsonBoundaryCharacterType;
  startsWithCodeFence: boolean;
  endsWithCodeFence: boolean;
  parserErrorName: JsonParserErrorName;
  parserErrorPosition: number | null;
  jsonErrorCategory: JsonErrorCategory;
  containsMultipleTopLevelValues: boolean;
  hasLeadingNonWhitespaceText: boolean;
  hasTrailingNonWhitespaceText: boolean;
}

export function cleanModelJson(raw: string): string {
  const withoutFences = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const objectStart = withoutFences.indexOf("{");
  const objectEnd = withoutFences.lastIndexOf("}");

  if (objectStart === -1 || objectEnd < objectStart) return withoutFences;
  return withoutFences.slice(objectStart, objectEnd + 1);
}

function boundaryCharacterType(
  character: string | undefined,
): JsonBoundaryCharacterType {
  if (character === undefined) return "none";
  if (character === "{") return "object-open";
  if (character === "}") return "object-close";
  if (character === "[") return "array-open";
  if (character === "]") return "array-close";
  if (character === '"') return "double-quote";
  if (character === "'") return "single-quote";
  if (character === "`") return "backtick";
  if (/[0-9]/.test(character)) return "digit";
  if (character === "-") return "minus";
  if (/\s/u.test(character)) return "whitespace";
  if (/\p{L}/u.test(character)) return "letter";
  return "other";
}

function parserErrorName(error: unknown): JsonParserErrorName {
  if (error instanceof SyntaxError) return "SyntaxError";
  if (error instanceof Error) return "Error";
  return "UnknownError";
}

function parserErrorPosition(error: unknown, parserInput: string): number | null {
  if (!(error instanceof Error)) return null;
  const positionMatch = error.message.match(/\bposition\s+(\d+)\b/i);
  if (positionMatch) {
    const position = Number(positionMatch[1]);
    if (Number.isSafeInteger(position) && position >= 0) return position;
  }
  if (/unexpected end/i.test(error.message)) return parserInput.length;
  return null;
}

function jsonErrorCategory(error: unknown): JsonErrorCategory {
  if (!(error instanceof Error)) return "other";
  const message = error.message.toLowerCase();

  if (/unterminated string/.test(message)) return "unterminated_string";
  if (/(?:bad|invalid) (?:escaped character|escape|unicode escape)/.test(message)) {
    return "invalid_escape";
  }
  if (/(?:unexpected end|end of json input|end of data)/.test(message)) {
    return "unexpected_end";
  }
  if (
    /(?:bad control character|bad character|invalid character|unexpected non-whitespace character)/.test(
      message,
    )
  ) {
    return "invalid_character";
  }
  if (
    /(?:unexpected token|expected |unexpected keyword|unexpected character|unexpected non-digit|no number after minus sign|missing digits|property names must be double-quoted)/.test(
      message,
    )
  ) {
    return "unexpected_token";
  }
  return "other";
}

function containsMultipleTopLevelValues(value: string): boolean {
  const expectedClosers: string[] = [];
  let inString = false;
  let escaped = false;
  let completedValues = 0;

  for (const character of value) {
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{" || character === "[") {
      expectedClosers.push(character === "{" ? "}" : "]");
      continue;
    }
    if (character !== "}" && character !== "]") continue;
    if (expectedClosers.at(-1) !== character) {
      expectedClosers.length = 0;
      continue;
    }
    expectedClosers.pop();
    if (expectedClosers.length === 0) {
      completedValues += 1;
      if (completedValues > 1) return true;
    }
  }

  return false;
}

export function analyzeJsonParseFailure(
  raw: string,
  error: unknown,
): JsonParseFailureTelemetry {
  const trimmed = raw.trim();
  const withoutFences = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const objectStart = withoutFences.indexOf("{");
  const objectEnd = withoutFences.lastIndexOf("}");
  const parserInput = cleanModelJson(raw);

  return {
    responseLength: raw.length,
    trimmedLength: trimmed.length,
    firstCharType: boundaryCharacterType(trimmed[0]),
    lastCharType: boundaryCharacterType(trimmed.at(-1)),
    startsWithCodeFence: /^```(?:json)?(?:\s|$)/i.test(trimmed),
    endsWithCodeFence: /```\s*$/.test(trimmed),
    parserErrorName: parserErrorName(error),
    parserErrorPosition: parserErrorPosition(error, parserInput),
    jsonErrorCategory: jsonErrorCategory(error),
    containsMultipleTopLevelValues:
      containsMultipleTopLevelValues(withoutFences),
    hasLeadingNonWhitespaceText:
      objectStart > 0 && withoutFences.slice(0, objectStart).trim().length > 0,
    hasTrailingNonWhitespaceText:
      objectEnd >= 0 &&
      objectEnd + 1 < withoutFences.length &&
      withoutFences.slice(objectEnd + 1).trim().length > 0,
  };
}
