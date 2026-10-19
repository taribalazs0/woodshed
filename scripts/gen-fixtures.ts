import { mkdirSync, writeFileSync } from "node:fs";
import { buildTakeReport, expectedChord } from "../lib/analysis/report";
import { DEFAULT_EXERCISE, type HeardChord } from "../lib/types";

const exercise = DEFAULT_EXERCISE;
const step = 60 / exercise.bpm;
const times = Array.from({ length: exercise.bars * exercise.beatsPerBar }, (_, index) => 10 + index * step);

function expectedAt(index: number) {
  return expectedChord(exercise, Math.floor(index / exercise.beatsPerBar) + 1);
}

function onsets(offsetMs: (index: number) => number, heard: (index: number) => HeardChord) {
  return times.map((time, index) => ({
    time: time + offsetMs(index) / 1000,
    heard: heard(index),
  }));
}

const lateBars = new Set([2, 4, 6]);
const reports = {
  clean: buildTakeReport(exercise, times, onsets(() => 0, expectedAt)),
  "late-changes": buildTakeReport(
    exercise,
    times,
    onsets(
      () => 0,
      (index) => {
        const bar = Math.floor(index / exercise.beatsPerBar) + 1;
        const beat = (index % exercise.beatsPerBar) + 1;
        if (lateBars.has(bar) && beat === 1) return expectedChord(exercise, bar - 1);
        return expectedAt(index);
      },
    ),
  ),
  rushing: buildTakeReport(
    exercise,
    times,
    onsets((index) => -(Math.floor(index / exercise.beatsPerBar)) * 25, expectedAt),
  ),
};

mkdirSync("fixtures/reports", { recursive: true });
for (const [name, report] of Object.entries(reports)) {
  writeFileSync(`fixtures/reports/${name}.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(name, JSON.stringify(report.summary));
}
