import OpenAI from "openai";
import { getOpenAIKey, getTtsModel, getTtsVoice, TTS_INSTRUCTIONS } from "@/lib/config";

const MAX_CHARS = 4096;

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "The speech request was not valid JSON.");
  }

  const text = readText(body);
  if (typeof text !== "string") return jsonError(400, text.error);

  let client: OpenAI;
  try {
    client = new OpenAI({ apiKey: getOpenAIKey() });
  } catch (err) {
    return jsonError(500, messageOf(err));
  }

  const model = getTtsModel();
  try {
    const speech = await client.audio.speech.create({
      model,
      voice: getTtsVoice(),
      input: text,
      response_format: "mp3",
      ...(acceptsInstructions(model) ? { instructions: TTS_INSTRUCTIONS } : {}),
    });
    return new Response(await speech.arrayBuffer(), {
      headers: { "Content-Type": "audio/mpeg" },
    });
  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      if (err.status === 401) {
        return jsonError(
          401,
          "The OpenAI API key was rejected. Check OPENAI_API_KEY in .env.local, then restart npm run dev.",
        );
      }
      if (err.status === 429) {
        return jsonError(429, "OpenAI refused the request: no credit left, or a rate limit.");
      }
    }
    return jsonError(502, messageOf(err));
  }
}

function readText(body: unknown): string | { error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { error: "The speech request must be a JSON object." };
  }
  const text = (body as { text?: unknown }).text;
  if (typeof text !== "string" || text.trim().length === 0) {
    return { error: "The speech request needs a text string." };
  }
  const trimmed = text.trim();
  if (trimmed.length > MAX_CHARS) {
    return { error: `The speech text must be at most ${MAX_CHARS} characters.` };
  }
  return trimmed;
}

function acceptsInstructions(model: string): boolean {
  return model !== "tts-1" && model !== "tts-1-hd";
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : "The speech request failed.";
}

function jsonError(status: number, error: string): Response {
  return Response.json({ error }, { status });
}
