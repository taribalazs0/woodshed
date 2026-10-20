import { TIMING_ISSUE_ABS_MS } from "@/lib/analysis/report";
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

export default function BeatGrid({ report }: { report: TakeReport }) {
  const bars = Array.from({ length: report.exercise.bars }, (_, index) => index + 1);

  return (
    <section className="flex w-full flex-col gap-3">
      <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Last take</h2>
      <div className="grid grid-cols-8 gap-2">
        {bars.map((bar) => {
          const strums = report.strums.filter((strum) => strum.bar === bar);
          const expected = strums[0]?.expected ?? "";
          return (
            <div key={bar} className="flex flex-col items-center gap-1">
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
