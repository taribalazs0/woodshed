import OpenAI from "openai";
import {
  getCoachModel,
  getCoachReasoning,
  getOpenAIKey,
} from "@/lib/config";
import {
  CHORD_NAMES,
  clampBpm,
  isChordName,
  type ChordName,
  type CoachRequest,
  type CoachResponse,
  type TakeSummary,
} from "@/lib/types";

const HISTORY_LIMIT = 5;

const REASONING_EFFORTS = ["none", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

const COACH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    say: { type: "string" },
    startTake: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          properties: {
            chords: {
              type: "array",
              items: { type: "string", enum: [...CHORD_NAMES] },
            },
            bpm: { type: "number" },
          },
          required: ["chords", "bpm"],
        },
      ],
    },
  },
  required: ["say", "startTake"],
} as const;

const SYSTEM_PROMPT = `You are a friendly, direct guitar teacher coaching one student.

Rules:
- At most 2 sentences and about 30 words.
- Exactly one correction, or one praise. Never both.
- Only use numbers that appear in the report. Do not invent counts, bars, milliseconds, or tempos.
- Include one concrete number or bar from the report, such as a bar, a change count, an offset in milliseconds, or the tempo.
- Focus on summary.topIssue. The analysis already chose the issue; do not pick a different one.
- If detectedStrums is under half of expectedStrums, ignore topIssue. Say the guitar was too quiet to measure, and ask them to bring the microphone closer. Do not call that late changes.
- If chordAccuracy is 0, or nearly every sounded strum is "unclear", ignore topIssue. Say the microphone did not catch the strings clearly enough to judge chords or timing. Ask them to point it at the strings, near where the neck meets the body. Do not call the changes late, and do not tell them to lower the tempo.
- If the chords were recognized and the take is rushing, dragging, late, or mostly missed, suggest lowering the tempo.
- If twoCleanTakesInARow is true, suggest raising the tempo a little.
- Set startTake when the student asks to practice, says slower, faster, or again, or agrees to play. Otherwise startTake is null.
- "slower" means about 5 BPM below the current exercise bpm. "faster" means about 5 BPM above it. "again" repeats the current chords and bpm.
- A question such as "why was that bad?" gets an explanation and startTake null.
- say is spoken aloud.`;

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "The coach request was not valid JSON.");
  }

  const coachRequest = readCoachRequest(body);
  if (typeof coachRequest === "string") return jsonError(400, coachRequest);

  let client: OpenAI;
  try {
    client = new OpenAI({ apiKey: getOpenAIKey() });
  } catch (err) {
    return jsonError(500, messageOf(err));
  }

  try {
    const response = await client.responses.create({
      model: getCoachModel(),
      reasoning: { effort: reasoningEffort() },
      input: [
        { role: "developer", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(promptPayload(coachRequest)) },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "coach_reply",
          strict: true,
          schema: COACH_SCHEMA,
        },
      },
    });
    const reply = sanitizeReply(JSON.parse(response.output_text) as unknown);
    if (!reply) return jsonError(502, "The coach returned a reply that could not be used.");
    return Response.json(reply);
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

function promptPayload(request: CoachRequest) {
  const previous = request.history.at(-1);
  const latest = request.latestReport?.summary;
  return {
    exercise: {
      ...request.exercise,
      bpm: clampBpm(request.exercise.bpm),
    },
    supportedChords: CHORD_NAMES,
    latestReport: request.latestReport,
    history: request.history.slice(-HISTORY_LIMIT),
    userSaid: request.userSaid,
    twoCleanTakesInARow: latest?.topIssue === "none" && previous?.topIssue === "none",
  };
}

function readCoachRequest(body: unknown): CoachRequest | string {
  if (!isRecord(body)) return "The coach request must be a JSON object.";
  const exercise = body.exercise;
  if (!isRecord(exercise) || !Array.isArray(exercise.chords)) {
    return "The coach request needs an exercise with a chords list.";
  }
  if (exercise.chords.length === 0 || exercise.chords.some((chord) => typeof chord !== "string" || !isChordName(chord))) {
    return `Exercise chords must be from: ${CHORD_NAMES.join(", ")}.`;
  }
  if (typeof exercise.bpm !== "number" || !Number.isFinite(exercise.bpm)) {
    return "Exercise bpm must be a number.";
  }
  const history = Array.isArray(body.history) ? body.history.filter(isSummary) : [];
  const latestReport = body.latestReport == null ? null : body.latestReport;
  if (latestReport !== null && !isRecord(latestReport)) return "latestReport must be an object or null.";
  return {
    exercise: {
      chords: exercise.chords,
      bpm: exercise.bpm,
      bars: typeof exercise.bars === "number" ? exercise.bars : 8,
      beatsPerBar: 4,
    },
    latestReport: latestReport as CoachRequest["latestReport"],
    history: history.slice(-HISTORY_LIMIT),
    userSaid: typeof body.userSaid === "string" ? body.userSaid : null,
  };
}

function sanitizeReply(value: unknown): CoachResponse | null {
  if (!isRecord(value) || typeof value.say !== "string") return null;
  const say = value.say.trim();
  if (!say) return null;
  return { say, startTake: sanitizeStartTake(value.startTake) };
}

function sanitizeStartTake(value: unknown): CoachResponse["startTake"] {
  if (!isRecord(value) || !Array.isArray(value.chords) || typeof value.bpm !== "number") return null;
  const chords = value.chords.filter((chord): chord is ChordName => typeof chord === "string" && isChordName(chord));
  if (chords.length === 0 || !Number.isFinite(value.bpm)) return null;
  return { chords, bpm: clampBpm(value.bpm) };
}

function isSummary(value: unknown): value is TakeSummary {
  return isRecord(value) && typeof value.topIssue === "string";
}

function reasoningEffort(): (typeof REASONING_EFFORTS)[number] {
  const value = getCoachReasoning();
  return REASONING_EFFORTS.find((effort) => effort === value) ?? "none";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : "The coach request failed.";
}

function jsonError(status: number, error: string): Response {
  return Response.json({ error }, { status });
}
