export const CHORD_NAMES = ["C", "D", "E", "G", "A", "Am", "Dm", "Em"] as const;
export type ChordName = (typeof CHORD_NAMES)[number];

export const MIN_BPM = 40;
export const MAX_BPM = 140;
export const BARS_PER_TAKE = 8;
export const BEATS_PER_BAR = 4;

export type HeardChord = ChordName | "unclear" | "missed";
export type TopIssue =
  | "late-changes"
  | "rushing"
  | "dragging"
  | "timing"
  | "wrong-chords"
  | "none";

export interface Exercise {
  chords: ChordName[];
  bpm: number;
  bars: number;
  beatsPerBar: 4;
}

export const DEFAULT_EXERCISE: Exercise = {
  chords: ["C", "G"],
  bpm: 70,
  bars: BARS_PER_TAKE,
  beatsPerBar: BEATS_PER_BAR,
};

export interface StrumResult {
  bar: number;
  beat: number;
  expected: ChordName;
  heard: HeardChord;
  /** Positive is late, negative is early, after median latency removal. Null when the beat was missed. */
  offsetMs: number | null;
}

export interface TakeSummary {
  expectedStrums: number;
  detectedStrums: number;
  /** 0-1, counted over beats that were not missed. */
  chordAccuracy: number;
  meanAbsOffsetMs: number;
  /** Negative is rushing. */
  driftMsPerBar: number;
  changes: { total: number; clean: number; late: number };
  topIssue: TopIssue;
}

export interface TakeReport {
  exercise: Exercise;
  strums: StrumResult[];
  summary: TakeSummary;
}

export interface CoachRequest {
  exercise: Exercise;
  latestReport: TakeReport | null;
  history: TakeSummary[];
  userSaid: string | null;
}

export interface CoachResponse {
  say: string;
  startTake: { chords: ChordName[]; bpm: number } | null;
}

export function isChordName(value: string): value is ChordName {
  return (CHORD_NAMES as readonly string[]).includes(value);
}

export function clampBpm(bpm: number): number {
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));
}
