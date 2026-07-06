export function truncate(text: string, maxChars: number): string {
  if (maxChars <= 0) {
    return "";
  }

  if (text.length <= maxChars) {
    return text;
  }

  if (maxChars <= 3) {
    return ".".repeat(maxChars);
  }

  return `${text.slice(0, maxChars - 3)}...`;
}

export function tailItems<T>(items: T[], maxItems: number): T[] {
  if (maxItems <= 0) {
    return [];
  }

  return items.slice(-maxItems);
}

export function preview(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= 160 ? clean : `${clean.slice(0, 157)}...`;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
