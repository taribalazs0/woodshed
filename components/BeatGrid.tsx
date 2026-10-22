import { LATE_CHANGE_OFFSET_MS, TIMING_ISSUE_ABS_MS } from "@/lib/analysis/report";
import { BEATS_PER_BAR, type StrumResult, type TakeReport } from "@/lib/types";

const CELL_CLASS = {
  green: "bg-emerald-500",
  yellow: "bg-amber-400",
  red: "bg-red-500",
} as const;

function cellTone(strum: StrumResult): keyof typeof CELL_CLASS {
  if (strum.heard !== strum.expected || strum.offsetMs === null) return "red";
  if (Math.abs(strum.offsetMs) > TIMING_ISSUE_ABS_MS) return "yellow";
  return "green";
}

function lateChangeBars(report: TakeReport): number[] {
  const late: number[] = [];
  for (let bar = 2; bar <= report.exercise.bars; bar += 1) {
    const downbeat = report.strums.find((strum) => strum.bar === bar && strum.beat === 1);
    const previous = report.strums.find((strum) => strum.bar === bar - 1 && strum.beat === 1);
    if (!downbeat || !previous || previous.expected === downbeat.expected) continue;
    const missedTheChange =
      downbeat.heard === previous.expected ||
      downbeat.heard === "unclear" ||
      downbeat.heard === "missed" ||
      (downbeat.offsetMs ?? 0) > LATE_CHANGE_OFFSET_MS;
    if (missedTheChange) late.push(bar);
  }
  return late;
}

export default function BeatGrid({ report }: { report: TakeReport }) {
  const bars = Array.from({ length: report.exercise.bars }, (_, index) => index + 1);
  const late = lateChangeBars(report);

  return (
    <section
      id="take"
      className="scroll-mt-24 flex w-full flex-col gap-4 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800"
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Take</h2>
        <p className="font-mono text-xs text-zinc-500">
          {report.exercise.chords.join(" → ")} · {report.exercise.bpm} BPM
        </p>
      </div>
      <h3 className="text-2xl font-semibold tracking-tight">
        {late.length > 0 ? `Late changes: bars ${late.join(", ")}` : "No late changes"}
      </h3>
      <div className="grid grid-cols-8 gap-2">
        {bars.map((bar) => {
          const strums = report.strums.filter((strum) => strum.bar === bar);
          const expected = strums[0]?.expected ?? "";
          const isLate = late.includes(bar);
          return (
            <div key={bar} className="flex flex-col items-center gap-1">
              <span
                className={`font-mono text-lg font-semibold ${isLate ? "text-red-500" : "text-transparent"}`}
              >
                {bar}
              </span>
              <span className="font-mono text-xs font-medium">{expected}</span>
              <div className="flex w-full flex-col gap-1">
                {Array.from({ length: BEATS_PER_BAR }, (_, beatIndex) => {
                  const strum = strums.find((item) => item.beat === beatIndex + 1);
                  const tone = strum ? cellTone(strum) : "red";
                  return (
                    <div
                      key={beatIndex}
                      title={
                        strum
                          ? `Bar ${bar} beat ${strum.beat}: expected ${strum.expected}, heard ${strum.heard}${strum.offsetMs === null ? "" : `, ${strum.offsetMs} ms`}`
                          : `Bar ${bar} beat ${beatIndex + 1}: missing`
                      }
                      className={`h-6 w-full rounded-sm ${CELL_CLASS[tone]}`}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p className="font-mono text-xs text-zinc-500">
        Green: right chord, on time. Yellow: right chord, off time. Red: wrong, unclear or missed.
      </p>
    </section>
  );
}
