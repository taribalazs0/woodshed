import "server-only";

export function getOpenAIKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY is missing, see README: copy .env.example to .env.local, set your key, then restart npm run dev.",
    );
  }
  return key;
}
