"use client";

import { useEffect, useRef, useState } from "react";

const CLIP_WARNING_PEAK = 0.95;
const MIN_STRUM_TO_NOISE = 10;
const NOISE_FLOOR_MS = 3000;
const METER_FLOOR_DB = -60;

interface Levels {
  rms: number;
  peak: number;
  maxRms: number;
  maxPeak: number;
}

const SILENT: Levels = { rms: 0, peak: 0, maxRms: 0, maxPeak: 0 };

function meterPercent(value: number): number {
  const db = value > 0 ? 20 * Math.log10(value) : -Infinity;
  return Math.min(100, Math.max(0, (1 - db / METER_FLOOR_DB) * 100));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

export default function LevelMeter({ source }: { source: AudioNode }) {
  const [levels, setLevels] = useState<Levels>(SILENT);
  const [noiseFloor, setNoiseFloor] = useState<number | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const maxRef = useRef({ rms: 0, peak: 0 });
  const measureRef = useRef<{ until: number; rms: number[] } | null>(null);

  useEffect(() => {
    const analyser = new AnalyserNode(source.context, { fftSize: 2048 });
    source.connect(analyser);
    const buffer = new Float32Array(analyser.fftSize);
    let frame = 0;

    const tick = () => {
      analyser.getFloatTimeDomainData(buffer);
      let sumSquares = 0;
      let peak = 0;
      for (const sample of buffer) {
        sumSquares += sample * sample;
        peak = Math.max(peak, Math.abs(sample));
      }
      const rms = Math.sqrt(sumSquares / buffer.length);

      const max = maxRef.current;
      max.rms = Math.max(max.rms, rms);
      max.peak = Math.max(max.peak, peak);

      const measure = measureRef.current;
      if (measure) {
        measure.rms.push(rms);
        if (performance.now() >= measure.until) {
          measureRef.current = null;
          setNoiseFloor(median(measure.rms));
          setMeasuring(false);
        }
      }

      setLevels({ rms, peak, maxRms: max.rms, maxPeak: max.peak });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      source.disconnect(analyser);
    };
  }, [source]);

  function measureNoiseFloor() {
    measureRef.current = { until: performance.now() + NOISE_FLOOR_MS, rms: [] };
    setMeasuring(true);
  }

  function resetMax() {
    maxRef.current = { rms: 0, peak: 0 };
  }

  const clipping = levels.maxPeak >= CLIP_WARNING_PEAK;
  const strumToNoise = noiseFloor ? levels.maxRms / noiseFloor : null;

  return (
    <section className="flex w-full flex-col gap-4">
      <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Input level</h2>

      <div className="relative h-4 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div className="h-full bg-emerald-500" style={{ width: `${meterPercent(levels.rms)}%` }} />
        <div
          className={`absolute top-0 h-full w-0.5 ${levels.peak >= CLIP_WARNING_PEAK ? "bg-red-500" : "bg-zinc-900 dark:bg-zinc-100"}`}
          style={{ left: `${meterPercent(levels.peak)}%` }}
        />
      </div>
      <div className="flex justify-between font-mono text-xs text-zinc-500">
        <span>-60 dBFS</span>
        <span>0 dBFS</span>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 font-mono text-sm">
        <dt className="text-zinc-500">Max peak (1.0 = clip)</dt>
        <dd className={clipping ? "text-red-600 dark:text-red-400" : undefined}>
          {levels.maxPeak.toFixed(3)}
        </dd>
        <dt className="text-zinc-500">Max RMS</dt>
        <dd>{levels.maxRms.toFixed(4)}</dd>
        <dt className="text-zinc-500">Noise floor (RMS)</dt>
        <dd>
          {measuring
            ? "measuring, stay quiet..."
            : noiseFloor !== null
              ? noiseFloor.toFixed(4)
              : "not measured"}
        </dd>
        <dt className="text-zinc-500">Max RMS / noise</dt>
        <dd
          className={
            strumToNoise !== null && strumToNoise >= MIN_STRUM_TO_NOISE
              ? "text-emerald-600 dark:text-emerald-400"
              : undefined
          }
        >
          {strumToNoise !== null ? `${strumToNoise.toFixed(1)}x` : "-"}
        </dd>
      </dl>

      {clipping && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          Too loud: peaks reached {levels.maxPeak.toFixed(2)}. Lower the microphone level in the
          Windows sound settings or move the mic further from the guitar, then reset.
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={measureNoiseFloor}
          disabled={measuring}
          className="h-9 rounded-full border border-zinc-300 px-4 text-sm transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Measure noise floor (3 s)
        </button>
        <button
          type="button"
          onClick={resetMax}
          className="h-9 rounded-full border border-zinc-300 px-4 text-sm transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Reset max
        </button>
      </div>
    </section>
  );
}
