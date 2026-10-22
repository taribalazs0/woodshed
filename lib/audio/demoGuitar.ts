import { getAudioContext } from "@/lib/audio/context";
import type { ScheduledTake } from "@/lib/audio/metronome";
import type { ChordName, Exercise } from "@/lib/types";

/** The recorded chords need a whole beat to finish. The screen tempo does not apply here. */
export const DEMO_BPM = 40;

/** Leave a short gap so the next strum's attack is still audible. */
const BEAT_GAP_SEC = 0.05;

/**
 * Largest random early/late offset. Half a beat at 140 BPM is about 214 ms,
 * so 120 ms still lands in the same beat window.
 */
export const MAX_SLOPPINESS_MS = 120;

const SAMPLE_URLS = {
  C: "/chords/C.mp3",
  D: "/chords/D.mp3",
} as const;

export type SampleChord = keyof typeof SAMPLE_URLS;

export interface DemoGuitarOptions {
  /** 0 to MAX_SLOPPINESS_MS. Each strum is shifted randomly early or late by up to this much. */
  sloppinessMs: number;
  /** 0 to 1. At 1, every chord-change downbeat plays the previous chord. */
  lateChangeAmount: number;
}

export interface DemoStrum {
  /** AudioContext time of the sample start. */
  time: number;
  bar: number;
  beat: number;
  played: ChordName;
  /** Positive is late, negative is early, relative to the click. */
  offsetMs: number;
  lateChange: boolean;
}

export interface DemoGuitar {
  /** Guitar only. Connected to the speakers. The analyzer reads this instead of the mic. */
  output: GainNode;
}

let guitarPromise: Promise<DemoGuitar & { buffers: Record<SampleChord, AudioBuffer> }> | null = null;

/** Loads the recorded chords once, on the shared AudioContext. */
export function getDemoGuitar(): Promise<DemoGuitar> {
  return loadDemoGuitar();
}

/** Decodes the samples before the first take, so the first strum is not silent. */
export function preloadDemoGuitar(): Promise<DemoGuitar> {
  return loadDemoGuitar();
}

function loadDemoGuitar(): Promise<DemoGuitar & { buffers: Record<SampleChord, AudioBuffer> }> {
  guitarPromise ??= createDemoGuitar().catch((err: unknown) => {
    guitarPromise = null;
    throw err;
  });
  return guitarPromise;
}

/**
 * Decides what the demo guitar will play. At sloppiness 0 and lateChangeAmount 0,
 * every sample starts exactly on its click and every chord matches the exercise.
 */
export function planDemoStrums(
  take: ScheduledTake,
  exercise: Exercise,
  options: DemoGuitarOptions,
): DemoStrum[] {
  const sloppinessMs = clamp(options.sloppinessMs, 0, MAX_SLOPPINESS_MS);
  const lateChangeAmount = clamp(options.lateChangeAmount, 0, 1);
  const lateBeats = lateChangeBeatIndexes(take, exercise, lateChangeAmount);

  return take.beatTimes.map((beatTime, index) => {
    const bar = Math.floor(index / take.beatsPerBar) + 1;
    const beat = (index % take.beatsPerBar) + 1;
    const expected = chordAtBar(exercise, bar);
    const lateChange = lateBeats.has(index);
    const played = lateChange ? chordAtBar(exercise, bar - 1) : expected;
    const offsetMs = sloppinessMs === 0 ? 0 : (Math.random() * 2 - 1) * sloppinessMs;
    return {
      time: beatTime + offsetMs / 1000,
      bar,
      beat,
      played,
      offsetMs,
      lateChange,
    };
  });
}

/** Plays one recorded chord per take beat, late or early by the plan. */
export async function playDemoGuitar(plan: DemoStrum[]): Promise<void> {
  const guitar = await loadDemoGuitar();
  const ctx = getAudioContext();
  for (const strum of plan) {
    const buffer = bufferFor(guitar.buffers, strum.played);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(guitar.output);
    const beatSec = 60 / DEMO_BPM - BEAT_GAP_SEC;
    source.start(strum.time, 0, Math.min(beatSec, buffer.duration));
  }
}

async function createDemoGuitar(): Promise<DemoGuitar & { buffers: Record<SampleChord, AudioBuffer> }> {
  const ctx = getAudioContext();
  const output = ctx.createGain();
  output.gain.value = 0.9;
  output.connect(ctx.destination);
  const [c, d] = await Promise.all([
    loadSample(ctx, SAMPLE_URLS.C),
    loadSample(ctx, SAMPLE_URLS.D),
  ]);
  return { output, buffers: { C: c, D: d } };
}

async function loadSample(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}.`);
  const encoded = await response.arrayBuffer();
  return ctx.decodeAudioData(encoded);
}

function bufferFor(buffers: Record<SampleChord, AudioBuffer>, chord: ChordName): AudioBuffer {
  if (chord === "C" || chord === "D") return buffers[chord];
  throw new Error(`The demo guitar only has recordings for C and D, not ${chord}.`);
}

function chordAtBar(exercise: Exercise, bar: number): ChordName {
  const index = (bar - 1) % exercise.chords.length;
  return exercise.chords[index];
}

function lateChangeBeatIndexes(
  take: ScheduledTake,
  exercise: Exercise,
  amount: number,
): Set<number> {
  const changes: number[] = [];
  for (let index = take.beatsPerBar; index < take.beatTimes.length; index += take.beatsPerBar) {
    const bar = Math.floor(index / take.beatsPerBar) + 1;
    if (chordAtBar(exercise, bar) !== chordAtBar(exercise, bar - 1)) {
      changes.push(index);
    }
  }
  const lateCount = Math.round(amount * changes.length);
  return new Set(changes.slice(0, lateCount));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
