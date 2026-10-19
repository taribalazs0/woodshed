import { describe, expect, it } from "vitest";
import { buildTakeReport, LATE_CHANGE_OFFSET_MS } from "../lib/analysis/report";
import {
  BEATS_PER_BAR,
  DEFAULT_EXERCISE,
  type ChordName,
  type Exercise,
  type HeardChord,
} from "../lib/types";


const EXERCISE: Exercise = {
  ...DEFAULT_EXERCISE,
  chords: ["C", "G"],
  bpm: 60,
  bars: 8,
  beatsPerBar: BEATS_PER_BAR,
};

function beatTimes(exercise: Exercise = EXERCISE, start = 10): number[] {
  const step = 60 / exercise.bpm;
  const count = exercise.bars * exercise.beatsPerBar;
  return Array.from({ length: count }, (_, index) => start + index * step);
}

function onsetsOnBeats(
  times: readonly number[],
  heard: (beatIndex: number) => HeardChord,
  offsetSec = 0,
): { time: number; heard: HeardChord }[] {
  return times.map((time, index) => ({ time: time + offsetSec, heard: heard(index) }));
}

function expectedAt(index: number): ChordName {
  const bar = Math.floor(index / EXERCISE.beatsPerBar) + 1;
  return bar % 2 === 1 ? "C" : "G";
}

describe("buildTakeReport", () => {
  it("gives zero offsets when onsets land exactly on the beats", () => {
    const times = beatTimes();
    const report = buildTakeReport(
      EXERCISE,
      times,
      onsetsOnBeats(times, (index) => expectedAt(index)),
    );

    expect(report.strums.every((strum) => strum.offsetMs === 0)).toBe(true);
    expect(report.summary.meanAbsOffsetMs).toBe(0);
    expect(report.summary.driftMsPerBar).toBe(0);
    expect(report.summary.changes).toEqual({ total: 7, clean: 7, late: 0 });
    expect(report.summary.topIssue).toBe("none");
  });

  it("removes a constant 80 ms latency", () => {
    const times = beatTimes();
    const report = buildTakeReport(
      EXERCISE,
      times,
      onsetsOnBeats(times, (index) => expectedAt(index), 0.08),
    );

    expect(report.strums.every((strum) => strum.offsetMs === 0)).toBe(true);
    expect(report.summary.meanAbsOffsetMs).toBe(0);
    expect(report.summary.topIssue).toBe("none");
  });

  it("flags the old chord on beat 1 of a new bar as a late change", () => {
    const times = beatTimes();
    const report = buildTakeReport(
      EXERCISE,
      times,
      onsetsOnBeats(times, (index) => {
        const bar = Math.floor(index / EXERCISE.beatsPerBar) + 1;
        const beat = (index % EXERCISE.beatsPerBar) + 1;
        if (bar === 2 && beat === 1) return "C";
        return expectedAt(index);
      }),
    );

    const change = report.strums.find((strum) => strum.bar === 2 && strum.beat === 1);
    expect(change?.heard).toBe("C");
    expect(report.summary.changes).toEqual({ total: 7, clean: 6, late: 1 });
    expect(report.summary.topIssue).toBe("late-changes");
  });

  it("marks empty beat windows as missed", () => {
    const times = beatTimes();
    const report = buildTakeReport(EXERCISE, times, []);

    expect(report.strums.every((strum) => strum.heard === "missed" && strum.offsetMs === null)).toBe(
      true,
    );
    expect(report.summary.detectedStrums).toBe(0);
    expect(report.summary.expectedStrums).toBe(32);
    expect(report.summary.chordAccuracy).toBe(0);
  });

  it("ranks topIssue as late-changes, then rushing, then dragging, then timing, then wrong-chords, then none", () => {
    const times = beatTimes();

    const rushing = buildTakeReport(
      EXERCISE,
      times,
      times.map((time, index) => {
        const bar = Math.floor(index / EXERCISE.beatsPerBar) + 1;
        return { time: time - (bar - 1) * 0.02, heard: expectedAt(index) };
      }),
    );
    expect(rushing.summary.driftMsPerBar).toBeLessThanOrEqual(-10);
    expect(rushing.summary.topIssue).toBe("rushing");

    const dragging = buildTakeReport(
      EXERCISE,
      times,
      times.map((time, index) => {
        const bar = Math.floor(index / EXERCISE.beatsPerBar) + 1;
        return { time: time + (bar - 1) * 0.02, heard: expectedAt(index) };
      }),
    );
    expect(dragging.summary.driftMsPerBar).toBeGreaterThanOrEqual(10);
    expect(dragging.summary.topIssue).toBe("dragging");

    const timing = buildTakeReport(
      EXERCISE,
      times,
      times.map((time, index) => ({
        time: time + (index % 2 === 0 ? 0.05 : -0.05),
        heard: expectedAt(index),
      })),
    );
    expect(Math.abs(timing.summary.driftMsPerBar)).toBeLessThan(10);
    expect(timing.summary.meanAbsOffsetMs).toBeGreaterThan(40);
    expect(timing.summary.topIssue).toBe("timing");

    const wrong = buildTakeReport(
      EXERCISE,
      times,
      onsetsOnBeats(times, (index) => (index % 2 === 0 ? expectedAt(index) : "E")),
    );
    expect(wrong.summary.meanAbsOffsetMs).toBe(0);
    expect(wrong.summary.chordAccuracy).toBeLessThan(0.85);
    expect(wrong.summary.topIssue).toBe("wrong-chords");
  });

  it("treats a downbeat more than 120 ms late as a late change even with the new chord", () => {
    const times = beatTimes();
    const lateSec = (LATE_CHANGE_OFFSET_MS + 10) / 1000;
    const report = buildTakeReport(
      EXERCISE,
      times,
      times.map((time, index) => {
        const bar = Math.floor(index / EXERCISE.beatsPerBar) + 1;
        const beat = (index % EXERCISE.beatsPerBar) + 1;
        const extra = bar === 2 && beat === 1 ? lateSec : 0;
        return { time: time + extra, heard: expectedAt(index) };
      }),
    );

    expect(report.summary.changes.late).toBe(1);
    expect(report.summary.topIssue).toBe("late-changes");
  });
});
