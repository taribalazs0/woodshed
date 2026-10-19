import { readChord, type ChordFrame } from "@/lib/analysis/chords";
import type {
  ChordName,
  Exercise,
  HeardChord,
  StrumResult,
  TakeReport,
  TakeSummary,
  TopIssue,
} from "@/lib/types";

/** A change is late when beat 1 of a new chord is this far after the click. */
export const LATE_CHANGE_OFFSET_MS = 120;

/** |drift| at or above this, in ms per bar, is rushing or dragging. Matches T3. */
export const DRIFT_ISSUE_MS_PER_BAR = 10;

/** Mean absolute offset above this, after latency removal, is a timing issue. Matches T3. */
export const TIMING_ISSUE_ABS_MS = 40;

/** Chord accuracy below this, on beats that sounded, is a wrong-chords issue. */
export const ACCURACY_ISSUE = 0.85;

/** This many missed beats, with nothing ranked higher, is treated as timing. */
export const MISSED_TIMING_COUNT = 3;

export interface OnsetReading {
  time: number;
  heard: HeardChord;
}

export function expectedChord(exercise: Exercise, bar: number): ChordName {
  const chords = exercise.chords;
  return chords[(bar - 1) % chords.length] ?? chords[0];
}

/** Label each onset with the chord in its 60-250 ms chroma window. */
export function readingsFromFrames(
  onsets: readonly { time: number }[],
  frames: readonly ChordFrame[],
): OnsetReading[] {
  return onsets.map((onset) => ({
    time: onset.time,
    heard: readChord(frames, onset.time).chord,
  }));
}

/**
 * Maps onsets onto beats, subtracts the median latency, flags late changes,
 * and picks `topIssue` in the documented rank order.
 */
export function buildTakeReport(
  exercise: Exercise,
  beatTimes: readonly number[],
  onsets: readonly OnsetReading[],
): TakeReport {
  const beatDurationSec = 60 / exercise.bpm;
  const halfBeat = beatDurationSec / 2;
  const used = new Set<number>();
  const rawOffsets: { index: number; offsetMs: number }[] = [];

  const strums: StrumResult[] = beatTimes.map((beatTime, index) => {
    const bar = Math.floor(index / exercise.beatsPerBar) + 1;
    const beat = (index % exercise.beatsPerBar) + 1;
    const expected = expectedChord(exercise, bar);
    const isLast = index === beatTimes.length - 1;
    const windowStart = beatTime - halfBeat;
    const windowEnd = beatTime + halfBeat;

    let first = -1;
    onsets.forEach((onset, onsetIndex) => {
      if (used.has(onsetIndex)) return;
      const inWindow = isLast
        ? onset.time >= windowStart && onset.time <= windowEnd
        : onset.time >= windowStart && onset.time < windowEnd;
      if (!inWindow) return;
      if (first < 0 || onset.time < onsets[first].time) first = onsetIndex;
    });

    if (first < 0) {
      return { bar, beat, expected, heard: "missed" as const, offsetMs: null };
    }

    used.add(first);
    const offsetMs = (onsets[first].time - beatTime) * 1000;
    rawOffsets.push({ index, offsetMs });
    return { bar, beat, expected, heard: onsets[first].heard, offsetMs };
  });

  const latencyMs = median(rawOffsets.map((row) => row.offsetMs));
  for (const row of rawOffsets) {
    strums[row.index].offsetMs = Math.round(row.offsetMs - latencyMs);
  }

  return {
    exercise,
    strums,
    summary: summarize(exercise, strums, onsets.length),
  };
}

function summarize(
  exercise: Exercise,
  strums: StrumResult[],
  detectedStrums: number,
): TakeSummary {
  const expectedStrums = strums.length;
  const sounded = strums.filter((strum) => strum.offsetMs !== null);
  const missed = expectedStrums - sounded.length;
  const correct = sounded.filter((strum) => strum.heard === strum.expected).length;
  const chordAccuracy = sounded.length === 0 ? 0 : correct / sounded.length;
  const meanAbsOffsetMs =
    sounded.length === 0
      ? 0
      : sounded.reduce((sum, strum) => sum + Math.abs(strum.offsetMs ?? 0), 0) / sounded.length;
  const driftMsPerBar = driftPerBar(strums);
  const changes = countChanges(exercise, strums);
  const topIssue = pickTopIssue({
    late: changes.late,
    driftMsPerBar,
    meanAbsOffsetMs,
    chordAccuracy,
    missed,
  });

  return {
    expectedStrums,
    detectedStrums,
    chordAccuracy,
    meanAbsOffsetMs,
    driftMsPerBar,
    changes,
    topIssue,
  };
}

function countChanges(
  exercise: Exercise,
  strums: StrumResult[],
): TakeSummary["changes"] {
  let total = 0;
  let late = 0;
  for (let bar = 2; bar <= exercise.bars; bar += 1) {
    const previous = expectedChord(exercise, bar - 1);
    const current = expectedChord(exercise, bar);
    if (previous === current) continue;
    total += 1;
    const downbeat = strums.find((strum) => strum.bar === bar && strum.beat === 1);
    if (downbeat && isLateChange(downbeat, previous)) late += 1;
  }
  return { total, clean: total - late, late };
}

function isLateChange(downbeat: StrumResult, previous: ChordName): boolean {
  if (downbeat.heard === previous || downbeat.heard === "unclear" || downbeat.heard === "missed") {
    return true;
  }
  return (downbeat.offsetMs ?? 0) > LATE_CHANGE_OFFSET_MS;
}

function pickTopIssue(input: {
  late: number;
  driftMsPerBar: number;
  meanAbsOffsetMs: number;
  chordAccuracy: number;
  missed: number;
}): TopIssue {
  if (input.late > 0) return "late-changes";
  if (input.driftMsPerBar <= -DRIFT_ISSUE_MS_PER_BAR) return "rushing";
  if (input.driftMsPerBar >= DRIFT_ISSUE_MS_PER_BAR) return "dragging";
  if (input.meanAbsOffsetMs > TIMING_ISSUE_ABS_MS || input.missed >= MISSED_TIMING_COUNT) {
    return "timing";
  }
  if (input.chordAccuracy < ACCURACY_ISSUE) return "wrong-chords";
  return "none";
}

/** Linear slope of offset vs bar index, in ms per bar. Negative is rushing. */
function driftPerBar(strums: StrumResult[]): number {
  const points = strums.filter((strum) => strum.offsetMs !== null);
  if (points.length < 2) return 0;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (const strum of points) {
    const x = strum.bar;
    const y = strum.offsetMs ?? 0;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }
  const n = points.length;
  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return 0;
  return (n * sumXY - sumX * sumY) / denominator;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid] ?? 0;
}
