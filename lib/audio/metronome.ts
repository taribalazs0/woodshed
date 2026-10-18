import {
  BEATS_PER_BAR,
  DEFAULT_EXERCISE,
  type Exercise,
} from "@/lib/types";
import { getAudioContext } from "@/lib/audio/context";

const COUNT_IN_BEATS = BEATS_PER_BAR;
const CLICK_DURATION_SEC = 0.05;
const FIRST_CLICK_PAD_SEC = 0.05;
const ACCENT_NOTE = "C6";
const BEAT_NOTE = "C5";

export interface ScheduledTake {
  bpm: number;
  bars: number;
  beatsPerBar: 4;
  /** Count-in click times in AudioContext seconds. Not part of the take. */
  countInTimes: number[];
  /** Take beat times in AudioContext seconds, one per expected strum. */
  beatTimes: number[];
  /** One beat after the last take click, when the last beat window ends. */
  endTime: number;
}

/**
 * Schedules an accented 4-click count-in and then `exercise.bars` of 4/4 clicks.
 * Returns the take beat times on the shared AudioContext clock. Call from a
 * running context (after Start). Clicks go to the speakers, not into the mic graph.
 */
export async function scheduleTake(
  exercise: Pick<Exercise, "bpm" | "bars" | "beatsPerBar"> = DEFAULT_EXERCISE,
): Promise<ScheduledTake> {
  const ctx = getAudioContext();
  const Tone = await import("tone");
  if (Tone.getContext().rawContext !== ctx) {
    throw new Error("Tone.js is not using the shared AudioContext.");
  }

  const { bpm, bars, beatsPerBar } = exercise;
  const beatDuration = 60 / bpm;
  const takeBeats = bars * beatsPerBar;

  const synth = new Tone.Synth({
    oscillator: { type: "sine" },
    envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.02 },
    volume: -8,
  }).toDestination();

  const start = Tone.now() + FIRST_CLICK_PAD_SEC;
  const countInTimes: number[] = [];
  const beatTimes: number[] = [];

  for (let i = 0; i < COUNT_IN_BEATS; i += 1) {
    const time = start + i * beatDuration;
    countInTimes.push(time);
    click(synth, time, i % beatsPerBar === 0);
  }

  const takeStart = start + COUNT_IN_BEATS * beatDuration;
  for (let i = 0; i < takeBeats; i += 1) {
    const time = takeStart + i * beatDuration;
    beatTimes.push(time);
    click(synth, time, i % beatsPerBar === 0);
  }

  const endTime = takeStart + takeBeats * beatDuration;
  const disposeDelay = Math.max(0.2, endTime - Tone.now() + 0.2);
  Tone.getContext().setTimeout(() => synth.dispose(), disposeDelay);

  return { bpm, bars, beatsPerBar, countInTimes, beatTimes, endTime };
}

function click(
  synth: import("tone").Synth,
  time: number,
  accent: boolean,
): void {
  synth.triggerAttackRelease(
    accent ? ACCENT_NOTE : BEAT_NOTE,
    CLICK_DURATION_SEC,
    time,
    accent ? 0.9 : 0.45,
  );
}
