import OpenAI from "openai";
import { getOpenAIKey, getTranscribeModel } from "@/lib/config";

const HINT =
  "Guitar lesson. Chord names: C, D, E, G, A, Am, Dm, Em. Tempos such as 60 or 70. Commands: slower, faster, again.";

export async function POST(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, "The transcription request was not form data.");
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return jsonError(400, "The transcription request needs an audio file.");
  }

  let client: OpenAI;
  try {
    client = new OpenAI({ apiKey: getOpenAIKey() });
  } catch (err) {
    return jsonError(500, messageOf(err));
  }

  try {
    const transcription = await client.audio.transcriptions.create({
      file,
      model: getTranscribeModel(),
      prompt: HINT,
    });
    return Response.json({ text: transcription.text ?? "" });
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

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : "The transcription request failed.";
}

function jsonError(status: number, error: string): Response {
  return Response.json({ error }, { status });
}
