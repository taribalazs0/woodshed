const JUNK = new Set(["thank you.", "thank you", "you", "you."]);

/** Drops empty, one-character, and the usual silence hallucinations. */
export function keepTranscript(text: string): string | null {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length < 2) return null;
  if (JUNK.has(trimmed.toLowerCase())) return null;
  return trimmed;
}
