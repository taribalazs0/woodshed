import "server-only";

/**
 * Defaults checked against OpenAI's docs on 2026-10-19.
 * `gpt-4o-mini-tts` snapshots shut down on 2027-01-06; the alias still serves
 * the speech endpoint and accepts a style instruction, which the realtime
 * replacement does not.
 */
export const DEFAULT_TRANSCRIBE_MODEL = "gpt-transcribe";
export const DEFAULT_COACH_MODEL = "gpt-5.6-sol";
export const DEFAULT_COACH_REASONING = "none";
export const DEFAULT_TTS_MODEL = "gpt-4o-mini-tts";
export const DEFAULT_TTS_VOICE = "marin";

/** Spoken style for the TTS request. Not a model name. */
export const TTS_INSTRUCTIONS =
  "Speak like a calm, encouraging guitar teacher. Short sentences, no rush.";

export function getOpenAIKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY is missing, see README: copy .env.example to .env.local, set your key, then restart npm run dev.",
    );
  }
  return key;
}

export function getTranscribeModel(): string {
  return envOr("OPENAI_TRANSCRIBE_MODEL", DEFAULT_TRANSCRIBE_MODEL);
}

export function getCoachModel(): string {
  return envOr("OPENAI_COACH_MODEL", DEFAULT_COACH_MODEL);
}

export function getCoachReasoning(): string {
  return envOr("OPENAI_COACH_REASONING", DEFAULT_COACH_REASONING);
}

export function getTtsModel(): string {
  return envOr("OPENAI_TTS_MODEL", DEFAULT_TTS_MODEL);
}

export function getTtsVoice(): string {
  return envOr("OPENAI_TTS_VOICE", DEFAULT_TTS_VOICE);
}

function envOr(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value || fallback;
}
