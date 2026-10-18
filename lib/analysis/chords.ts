import { CHORD_NAMES, type ChordName, type HeardChord } from "@/lib/types";

/** Pitch classes in a Meyda chroma vector, C through B. */
export const CHROMA_BINS = 12;

/** Skip the attack, then average the ringing chord. */
export const CHORD_WINDOW_START_SEC = 0.06;
export const CHORD_WINDOW_END_SEC = 0.25;

/**
 * Below this cosine similarity the winner is `unclear`.
 * A flat spectrum scores 0.5 against every triad, so the line stays above that.
 * T4 will move it once a real guitar is attached.
 */
export const CHORD_MATCH_THRESHOLD = 0.75;

/** How far an onset may sit from the strum it is scored against. */
const MATCH_WINDOW_SEC = 0.2;

const PITCH = {
  C: 0,
  Cs: 1,
  D: 2,
  E: 4,
  F: 5,
  Fs: 6,
  G: 7,
  Gs: 8,
  A: 9,
  B: 11,
} as const;

/** Binary triad templates: 1 on the chord tones, 0 everywhere else. */
const TRIADS: Record<ChordName, readonly number[]> = {
  C: triad(PITCH.C, PITCH.E, PITCH.G),
  D: triad(PITCH.D, PITCH.Fs, PITCH.A),
  E: triad(PITCH.E, PITCH.Gs, PITCH.B),
  G: triad(PITCH.G, PITCH.B, PITCH.D),
  A: triad(PITCH.A, PITCH.Cs, PITCH.E),
  Am: triad(PITCH.A, PITCH.C, PITCH.E),
  Dm: triad(PITCH.D, PITCH.F, PITCH.A),
  Em: triad(PITCH.E, PITCH.G, PITCH.B),
};

export interface ChordFrame {
  time: number;
  chroma: readonly number[];
}

export interface ChordReading {
  chord: HeardChord;
  /** Cosine similarity of the winning template. 0 when there was no window. */
  score: number;
}

export interface ChordScoreLine {
  chord: ChordName;
  correct: number;
  total: number;
}

export interface ChordScore {
  byChord: ChordScoreLine[];
  unclear: number;
  wrong: number;
  missed: number;
}

/** Average the 60-250 ms chroma window after an onset and pick the closest triad. */
export function readChord(frames: readonly ChordFrame[], onsetTime: number): ChordReading {
  const window = frames.filter(
    (frame) =>
      frame.time >= onsetTime + CHORD_WINDOW_START_SEC &&
      frame.time < onsetTime + CHORD_WINDOW_END_SEC &&
      frame.chroma.length === CHROMA_BINS,
  );
  if (window.length === 0) return { chord: "unclear", score: 0 };

  const chroma = Array<number>(CHROMA_BINS).fill(0);
  for (const frame of window) {
    for (let bin = 0; bin < CHROMA_BINS; bin += 1) chroma[bin] += frame.chroma[bin] ?? 0;
  }
  for (let bin = 0; bin < CHROMA_BINS; bin += 1) chroma[bin] /= window.length;
  return matchChord(chroma);
}

/** Score detected onsets against the chords the demo guitar actually played. */
export function scoreChords(
  frames: readonly ChordFrame[],
  onsets: readonly { time: number }[],
  expected: readonly { time: number; chord: ChordName }[],
): ChordScore {
  const totals = new Map<ChordName, ChordScoreLine>();
  for (const strum of expected) {
    const line = totals.get(strum.chord) ?? { chord: strum.chord, correct: 0, total: 0 };
    line.total += 1;
    totals.set(strum.chord, line);
  }

  const used = new Set<number>();
  let unclear = 0;
  let wrong = 0;
  let missed = 0;

  for (const strum of expected) {
    const onsetIndex = nearestOnset(onsets, strum.time, used);
    if (onsetIndex < 0) {
      missed += 1;
      continue;
    }
    used.add(onsetIndex);
    const reading = readChord(frames, onsets[onsetIndex].time);
    const line = totals.get(strum.chord);
    if (reading.chord === "unclear") unclear += 1;
    else if (reading.chord === strum.chord) {
      if (line) line.correct += 1;
    } else wrong += 1;
  }

  return {
    byChord: [...totals.values()],
    unclear,
    wrong,
    missed,
  };
}

export function matchChord(chroma: readonly number[]): ChordReading {
  let best: ChordName = CHORD_NAMES[0];
  let bestScore = -1;
  for (const name of CHORD_NAMES) {
    const score = cosine(chroma, TRIADS[name]);
    if (score > bestScore) {
      best = name;
      bestScore = score;
    }
  }
  if (bestScore < CHORD_MATCH_THRESHOLD) return { chord: "unclear", score: Math.max(0, bestScore) };
  return { chord: best, score: bestScore };
}

function nearestOnset(
  onsets: readonly { time: number }[],
  time: number,
  used: ReadonlySet<number>,
): number {
  let best = -1;
  let bestDistance = MATCH_WINDOW_SEC;
  onsets.forEach((onset, index) => {
    if (used.has(index)) return;
    const distance = Math.abs(onset.time - time);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

function triad(root: number, third: number, fifth: number): number[] {
  const vector = Array<number>(CHROMA_BINS).fill(0);
  vector[root] = 1;
  vector[third] = 1;
  vector[fifth] = 1;
  return vector;
}

function cosine(left: readonly number[], right: readonly number[]): number {
  let dot = 0;
  let leftEnergy = 0;
  let rightEnergy = 0;
  for (let bin = 0; bin < CHROMA_BINS; bin += 1) {
    const a = left[bin] ?? 0;
    const b = right[bin] ?? 0;
    dot += a * b;
    leftEnergy += a * a;
    rightEnergy += b * b;
  }
  if (leftEnergy === 0 || rightEnergy === 0) return 0;
  return dot / Math.sqrt(leftEnergy * rightEnergy);
}
