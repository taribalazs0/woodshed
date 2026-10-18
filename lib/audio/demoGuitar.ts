import { getAudioContext } from "@/lib/audio/context";
import type { ScheduledTake } from "@/lib/audio/metronome";
import type { ChordName, Exercise } from "@/lib/types";
import type { PluckSynth } from "tone";

/** Delay between adjacent sounding strings of one down-strum. */
export const STRUM_SPREAD_SEC = 0.012;

/**
 * Largest random early/late offset. Half a beat at 140 BPM is about 214 ms,
 * so 120 ms still lands in the same beat window.
 */
export const MAX_SLOPPINESS_MS = 120;

/**
 * Open-position voicings, low E to high E. Null is a muted string.
 * The first sounding string is placed on the beat; the rest follow by STRUM_SPREAD_SEC.
 */
const VOICINGS: Record<ChordName, (string | null)[]> = {
  C: [null, "C3", "E3", "G3", "C4", "E4"],
  G: ["G2", "B2", "D3", "G3", "B3", "G4"],
  D: [null, null, "D3", "A3", "D4", "F#4"],
  E: ["E2", "B2", "E3", "G#3", "B3", "E4"],
  A: [null, "A2", "E3", "A3", "C#4", "E4"],
  Am: [null, "A2", "E3", "A3", "C4", "E4"],
  Dm: [null, null, "D3", "A3", "D4", "F4"],
  Em: ["E2", "B2", "E3", "G3", "B3", "E4"],
};

export interface DemoGuitarOptions {
  /** 0 to MAX_SLOPPINESS_MS. Each strum is shifted randomly early or late by up to this much. */
  sloppinessMs: number;
  /** 0 to 1. At 1, every chord-change downbeat plays the previous chord. */
  lateChangeAmount: number;
}

export interface DemoStrum {
  /** AudioContext time of the first sounding string. */
  time: number;
  bar: number;
  beat: number;
  played: ChordName;
  /** Positive is late, negative is early, relative to the click. */
  offsetMs: number;
  lateChange: boolean;
}

export interface DemoGuitar {
  /** Guitar only. Connected to the speakers. The analyzer will read this instead of the mic. */
  output: GainNode;
}

interface StringVoice {
  triggerAttack(note: string, time?: number): void;
}

let guitarPromise: Promise<DemoGuitar & { strings: StringVoice[] }> | null = null;

/** Creates the six string voices once, on the shared AudioContext. */
export function getDemoGuitar(): Promise<DemoGuitar> {
  return loadDemoGuitar();
}

/** Builds the guitar before Meyda starts, so the first take is not silent. */
export function preloadDemoGuitar(): Promise<DemoGuitar> {
  return loadDemoGuitar();
}

function loadDemoGuitar(): Promise<DemoGuitar & { strings: StringVoice[] }> {
  guitarPromise ??= createDemoGuitar().catch((err: unknown) => {
    guitarPromise = null;
    throw err;
  });
  return guitarPromise;
}

/**
 * Decides what the demo guitar will play. At sloppiness 0 and lateChangeAmount 0,
 * every first-sounding string is exactly on its click and every chord matches the exercise.
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

/** Schedules a down-strum per take beat. Clicks stay on the metronome, not on this bus. */
export async function playDemoGuitar(plan: DemoStrum[]): Promise<void> {
  const guitar = await loadDemoGuitar();
  for (const strum of plan) {
    const notes = VOICINGS[strum.played];
    let sounding = 0;
    notes.forEach((note, stringIndex) => {
      if (!note) return;
      guitar.strings[stringIndex].triggerAttack(
        note,
        strum.time + sounding * STRUM_SPREAD_SEC,
      );
      sounding += 1;
    });
  }
}

/**
 * PluckSynth stays silent until its AudioWorklet string model has connected.
 * That load is async, so notes scheduled before it are dropped.
 */
async function whenStringModelsReady(strings: PluckSynth[]): Promise<void> {
  const toneContext = strings[0]?.context as { _workletPromise?: Promise<unknown> } | undefined;
  const failed = toneContext?._workletPromise?.then(
    () => null,
    (err: unknown) => (err instanceof Error ? err.message : String(err)),
  );
  const deadline = performance.now() + 2000;
  while (performance.now() < deadline) {
    if (strings.every((string) => stringModelReady(string))) return;
    const reason = await Promise.race([
      failed ?? Promise.resolve(null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 40)),
    ]);
    if (typeof reason === "string") {
      throw new Error(`Demo guitar string model failed to load: ${reason}`);
    }
  }
  throw new Error(
    "Demo guitar could not start its string model. Reload the page and press Start again.",
  );
}

function stringModelReady(string: PluckSynth): boolean {
  const comb = (string as unknown as {
    _lfcf?: { _combFilter?: { _worklet?: unknown } };
  })._lfcf?._combFilter;
  return Boolean(comb?._worklet);
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

async function createDemoGuitar(): Promise<DemoGuitar & { strings: StringVoice[] }> {
  const ctx = getAudioContext();
  const Tone = await import("tone");
  const toneContext = Tone.getContext() as unknown as {
    rawContext: AudioContext;
    _workletPromise?: Promise<void>;
  };
  if (toneContext.rawContext !== ctx) {
    throw new Error("Tone.js is not using the shared AudioContext.");
  }

  const output = ctx.createGain();
  output.gain.value = 1;
  output.connect(ctx.destination);

  const plucked = await tryPluckStrings(Tone, toneContext, ctx, output);
  return { output, strings: plucked ?? createOscillatorStrings(Tone, output) };
}

async function tryPluckStrings(
  Tone: typeof import("tone"),
  toneContext: { _workletPromise?: Promise<void> },
  ctx: AudioContext,
  output: GainNode,
): Promise<PluckSynth[] | null> {
  let strings: PluckSynth[] = [];
  try {
    toneContext._workletPromise ??= withTimeout(
      ctx.audioWorklet.addModule("/guitar-worklet.js"),
      1500,
      "Guitar worklet did not load.",
    );
    await toneContext._workletPromise;
    strings = Array.from({ length: 6 }, () => {
      const string = new Tone.PluckSynth({
        attackNoise: 3,
        dampening: 5000,
        resonance: 0.92,
        volume: -4,
      });
      string.connect(output);
      return string;
    });
    await whenStringModelsReady(strings);
    return strings;
  } catch {
    strings.forEach((string) => string.dispose());
    return null;
  }
}

function createOscillatorStrings(
  Tone: typeof import("tone"),
  output: GainNode,
): StringVoice[] {
  return Array.from({ length: 6 }, () => {
    const string = new Tone.Synth({
      oscillator: { type: "triangle" },
      envelope: { attack: 0.001, decay: 0.45, sustain: 0, release: 0.2 },
      volume: -8,
    });
    string.connect(output);
    return {
      triggerAttack(note, time) {
        string.triggerAttackRelease(note, 0.35, time);
      },
    };
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
