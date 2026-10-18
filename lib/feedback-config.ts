export function isHttpsUrl(value: string | undefined): boolean {
  try {
    const url = new URL(value?.trim() || "");
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function isValidSupportEmail(value: string | undefined): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value?.trim() || "");
}
