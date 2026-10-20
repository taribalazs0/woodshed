"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import BeatGrid from "@/components/BeatGrid";
import LevelMeter from "@/components/LevelMeter";
import { scoreChords, type ChordScore } from "@/lib/analysis/chords";
import { createFeatureStream, type FeatureStream } from "@/lib/analysis/features";
import { detectOnsets } from "@/lib/analysis/onsets";
import { buildTakeReport, readingsFromFrames } from "@/lib/analysis/report";
import { getAudioContext, startAudio } from "@/lib/audio/context";
import {
  MAX_SLOPPINESS_MS,
  planDemoStrums,
  playDemoGuitar,
  preloadDemoGuitar,
  type DemoStrum,
} from "@/lib/audio/demoGuitar";
import { scheduleTake, type ScheduledTake } from "@/lib/audio/metronome";
import { getMicProcessing, openMic, type MicProcessing } from "@/lib/audio/mic";
import {
  DEFAULT_EXERCISE,
  type ChordName,
  type CoachResponse,
  type TakeReport,
  type TakeSummary,
} from "@/lib/types";

interface MicInfo {
  label: string;
  processing: MicProcessing;
  source: MediaStreamAudioSourceNode;
}

const PROCESSING_ROWS: { key: keyof MicProcessing; label: string }[] = [
  { key: "echoCancellation", label: "Echo cancellation" },
  { key: "noiseSuppression", label: "Noise suppression" },
  { key: "autoGainControl", label: "Auto gain control" },
];

function describeProcessing(value: boolean | undefined): string {
  if (value === false) return "off";
  if (value === true) return "ON (must be off)";
  return "unknown";
}

function describeTake(take: ScheduledTake, now: number): string {
  if (now < take.countInTimes[0]) return "Starting count-in...";
  if (now < take.beatTimes[0]) {
    const click = take.countInTimes.filter((time) => time <= now).length;
    return `Count-in ${click}/${take.countInTimes.length}`;
  }
  if (now < take.endTime) {
    const beat = take.beatTimes.filter((time) => time <= now).length;
    const bar = Math.ceil(beat / take.beatsPerBar);
    const beatInBar = ((beat - 1) % take.beatsPerBar) + 1;
    return `Take bar ${bar} beat ${beatInBar} (${beat}/${take.beatTimes.length})`;
  }
  return `Done. ${take.beatTimes.length} take beats at ${take.bpm} BPM.`;
}

function describeChordScore(score: ChordScore): string {
  const lines = score.byChord.map((line) => `${line.chord} ${line.correct}/${line.total}`);
  const extras = [
    score.unclear > 0 ? `unclear ${score.unclear}` : "",
    score.wrong > 0 ? `wrong ${score.wrong}` : "",
    score.missed > 0 ? `missed ${score.missed}` : "",
  ].filter(Boolean);
  return `chords ${[...lines, ...extras].join(", ")}`;
}

function describeGuitar(plan: DemoStrum[]): string {
  const lateBars = plan.filter((strum) => strum.lateChange).map((strum) => strum.bar);
  if (lateBars.length === 0) return `${plan.length} strums, no late changes.`;
  return `${plan.length} strums, late changes on bars ${lateBars.join(", ")}.`;
}

type CoachPhase = "Analyzing" | "Thinking" | "Speaking";

interface FeatureSummary {
  source: string;
  frames: number;
  maxRms: number;
  meanRms: number;
  recording: boolean;
  onsets: number | null;
  expectedStrums: number;
  chords: string | null;
}

export default function Home() {
  const [audioState, setAudioState] = useState<AudioContextState | null>(null);
  const [sampleRate, setSampleRate] = useState<number | null>(null);
  const [mic, setMic] = useState<MicInfo | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [take, setTake] = useState<ScheduledTake | null>(null);
  const [takeNow, setTakeNow] = useState(0);
  const [takeStarting, setTakeStarting] = useState(false);
  const [sloppinessMs, setSloppinessMs] = useState(0);
  const [lateChangePercent, setLateChangePercent] = useState(0);
  const [guitarPlan, setGuitarPlan] = useState<DemoStrum[] | null>(null);
  const [features, setFeatures] = useState<FeatureSummary | null>(null);
  const [report, setReport] = useState<TakeReport | null>(null);
  const [coachPhase, setCoachPhase] = useState<CoachPhase | null>(null);
  const [coachSay, setCoachSay] = useState<string | null>(null);
  const streamRef = useRef<FeatureStream | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const historyRef = useRef<TakeSummary[]>([]);
  const coachGeneration = useRef(0);
  const speechRef = useRef<HTMLAudioElement | null>(null);

  const started = sampleRate !== null;
  const ready = audioState === "running" && mic !== null;
  const takeActive = take !== null && takeNow < take.endTime;

  useEffect(() => {
    if (!started) return;
    const ctx = getAudioContext();
    const update = () => setAudioState(ctx.state);
    // Tone.js owns ctx.onstatechange, so state changes must be observed with addEventListener.
    ctx.addEventListener("statechange", update);
    return () => ctx.removeEventListener("statechange", update);
  }, [started]);

  useEffect(() => {
    if (!take) return;
    const ctx = getAudioContext();
    let frame = 0;
    const tick = () => {
      const now = ctx.currentTime;
      setTakeNow(now);
      if (now < take.endTime) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [take]);

  async function handleStart() {
    setStarting(true);
    setError(null);
    try {
      const ctx = await startAudio();
      setSampleRate(ctx.sampleRate);
      setAudioState(ctx.state);
      const { track, source } = await openMic(ctx);
      await preloadDemoGuitar();
      micSourceRef.current = source;
      streamRef.current = createFeatureStream(ctx, source);
      setMic({ label: track.label, processing: getMicProcessing(track), source });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  }

  async function handleTestTake() {
    setTakeStarting(true);
    setError(null);
    setGuitarPlan(null);
    try {
      const scheduled = await scheduleTake(DEFAULT_EXERCISE);
      const source = micSourceRef.current;
      if (!source) throw new Error("Microphone is not open.");
      captureFeatures(source, "microphone", scheduled);
      setTake(scheduled);
      setTakeNow(getAudioContext().currentTime);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTakeStarting(false);
    }
  }

  function captureFeatures(
    source: AudioNode,
    label: string,
    scheduled: ScheduledTake,
    expected?: { time: number; chord: ChordName }[],
  ) {
    const stream = streamRef.current;
    if (!stream) throw new Error("Feature stream is not ready. Click Start again.");
    const generation = coachGeneration.current + 1;
    coachGeneration.current = generation;
    speechRef.current?.pause();
    setCoachPhase(null);
    setCoachSay(null);
    const from = scheduled.beatTimes[0];
    const until = scheduled.endTime;
    const expectedStrums = scheduled.bars * scheduled.beatsPerBar;
    setFeatures({
      source: label,
      frames: 0,
      maxRms: 0,
      meanRms: 0,
      recording: true,
      onsets: null,
      expectedStrums,
      chords: null,
    });
    setReport(null);
    void stream
      .record(source, from, until, (progress) => {
        setFeatures({
          source: label,
          frames: progress.frames,
          maxRms: progress.maxRms,
          meanRms: 0,
          recording: true,
          onsets: null,
          expectedStrums,
          chords: null,
        });
      })
      .then(async (frames) => {
        if (coachGeneration.current !== generation) return;
        const takeEnded = performance.now();
        setCoachPhase("Analyzing");
        const meanRms = frames.length
          ? frames.reduce((sum, frame) => sum + frame.rms, 0) / frames.length
          : 0;
        const maxRms = frames.reduce((max, frame) => Math.max(max, frame.rms), 0);
        const onsets = detectOnsets(frames);
        const chords = expected ? describeChordScore(scoreChords(frames, onsets, expected)) : null;
        const nextReport = buildTakeReport(
          DEFAULT_EXERCISE,
          scheduled.beatTimes,
          readingsFromFrames(onsets, frames),
        );
        setReport(nextReport);
        setFeatures({
          source: label,
          frames: frames.length,
          maxRms,
          meanRms,
          recording: false,
          onsets: onsets.length,
          expectedStrums,
          chords,
        });
        await speakCoach(nextReport, generation, takeEnded);
      })
      .catch((err: unknown) => {
        if (coachGeneration.current !== generation) return;
        setCoachPhase(null);
        setError(err instanceof Error ? err.message : String(err));
      });
  }

  async function speakCoach(nextReport: TakeReport, generation: number, takeEnded: number) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    if (coachGeneration.current !== generation) return;
    setCoachPhase("Thinking");
    const coachResponse = await fetch("/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        exercise: nextReport.exercise,
        latestReport: nextReport,
        history: historyRef.current,
        userSaid: null,
      }),
    });
    const coachBody = (await coachResponse.json()) as CoachResponse & { error?: string };
    if (!coachResponse.ok) throw new Error(coachBody.error ?? "The coach request failed.");
    if (coachGeneration.current !== generation) return;

    historyRef.current = [...historyRef.current, nextReport.summary].slice(-5);
    setCoachSay(coachBody.say);
    setCoachPhase("Speaking");

    const speechResponse = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: coachBody.say }),
    });
    if (!speechResponse.ok) {
      const speechBody = (await speechResponse.json().catch(() => null)) as { error?: string } | null;
      throw new Error(speechBody?.error ?? "The speech request failed.");
    }
    if (coachGeneration.current !== generation) return;

    const url = URL.createObjectURL(await speechResponse.blob());
    const audio = new Audio(url);
    speechRef.current = audio;
    audio.addEventListener(
      "playing",
      () => {
        console.info("T7a take end to coach audio", {
          elapsedMs: Math.round(performance.now() - takeEnded),
        });
      },
      { once: true },
    );
    audio.addEventListener(
      "ended",
      () => {
        URL.revokeObjectURL(url);
        if (coachGeneration.current === generation) setCoachPhase(null);
      },
      { once: true },
    );
    await audio.play();
  }

  async function handleDemoGuitar() {
    setTakeStarting(true);
    setError(null);
    try {
      const scheduled = await scheduleTake(DEFAULT_EXERCISE);
      const plan = planDemoStrums(scheduled, DEFAULT_EXERCISE, {
        sloppinessMs,
        lateChangeAmount: lateChangePercent / 100,
      });
      const guitar = await preloadDemoGuitar();
      await playDemoGuitar(plan);
      captureFeatures(
        guitar.output,
        "demo guitar",
        scheduled,
        plan.map((strum) => ({ time: strum.time, chord: strum.played })),
      );
      setGuitarPlan(plan);
      setTake(scheduled);
      setTakeNow(getAudioContext().currentTime);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTakeStarting(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-10 px-6 py-16 font-sans">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl font-semibold tracking-tight">Woodshed</h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          A voice-first guitar practice coach.
        </p>
      </header>

      <section className="flex flex-col items-start gap-4">
        <button
          type="button"
          onClick={handleStart}
          disabled={starting || ready}
          className="h-12 rounded-full bg-foreground px-8 text-base font-medium text-background transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-zinc-300"
        >
          {ready ? "Running" : starting ? "Starting..." : "Start"}
        </button>

        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 font-mono text-sm">
          <dt className="text-zinc-500">AudioContext</dt>
          <dd>{audioState ?? "not started"}</dd>
          <dt className="text-zinc-500">Sample rate</dt>
          <dd>{sampleRate ? `${sampleRate} Hz` : "-"}</dd>
          <dt className="text-zinc-500">Microphone</dt>
          <dd>{mic ? mic.label || "unnamed device" : "not open"}</dd>
          {PROCESSING_ROWS.map(({ key, label }) => (
            <Fragment key={key}>
              <dt className="text-zinc-500">{label}</dt>
              <dd
                className={
                  mic && mic.processing[key] !== false ? "text-red-600 dark:text-red-400" : undefined
                }
              >
                {mic ? describeProcessing(mic.processing[key]) : "-"}
              </dd>
            </Fragment>
          ))}
        </dl>

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </section>

      {mic && <LevelMeter source={mic.source} />}

      <section className="flex flex-col items-start gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Metronome
        </h2>
        <button
          type="button"
          onClick={handleTestTake}
          disabled={!ready || takeStarting || takeActive}
          className="h-9 rounded-full border border-zinc-300 px-4 text-sm transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          {takeStarting ? "Scheduling..." : "Test take"}
        </button>
        <p className="font-mono text-sm text-zinc-600 dark:text-zinc-400">
          {take
            ? describeTake(take, takeNow)
            : `Idle. ${DEFAULT_EXERCISE.bars} bars at ${DEFAULT_EXERCISE.bpm} BPM after a 4-click count-in.`}
        </p>
        {take && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 font-mono text-sm">
            <dt className="text-zinc-500">First take beat</dt>
            <dd>{take.beatTimes[0]?.toFixed(3)} s</dd>
            <dt className="text-zinc-500">Last take beat</dt>
            <dd>{take.beatTimes[take.beatTimes.length - 1]?.toFixed(3)} s</dd>
            <dt className="text-zinc-500">Take end</dt>
            <dd>{take.endTime.toFixed(3)} s</dd>
          </dl>
        )}
      </section>

      <section className="flex w-full flex-col items-start gap-4">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Demo guitar
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Plays {DEFAULT_EXERCISE.chords.join(" to ")} with the click. The sliders move into the
          demo panel later.
        </p>
        <label className="flex w-full max-w-sm flex-col gap-1 text-sm">
          <span className="flex justify-between font-mono text-zinc-500">
            <span>Timing sloppiness</span>
            <span>{sloppinessMs} ms</span>
          </span>
          <input
            type="range"
            min={0}
            max={MAX_SLOPPINESS_MS}
            step={5}
            value={sloppinessMs}
            onChange={(event) => setSloppinessMs(Number(event.target.value))}
          />
        </label>
        <label className="flex w-full max-w-sm flex-col gap-1 text-sm">
          <span className="flex justify-between font-mono text-zinc-500">
            <span>Late chord changes</span>
            <span>{lateChangePercent}%</span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={lateChangePercent}
            onChange={(event) => setLateChangePercent(Number(event.target.value))}
          />
        </label>
        <button
          type="button"
          onClick={handleDemoGuitar}
          disabled={!ready || takeStarting || takeActive}
          className="h-9 rounded-full border border-zinc-300 px-4 text-sm transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          {takeStarting ? "Scheduling..." : "Play demo guitar"}
        </button>
        {guitarPlan && (
          <p className="font-mono text-sm text-zinc-600 dark:text-zinc-400">
            {describeGuitar(guitarPlan)}
          </p>
        )}
      </section>

      <section className="flex flex-col items-start gap-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Features
        </h2>
        <p className="font-mono text-sm text-zinc-600 dark:text-zinc-400">
          {features
            ? `${features.recording ? "Recording" : "Recorded"} ${features.source}: ${features.frames} frames, max RMS ${features.maxRms.toFixed(3)}${features.recording ? "" : `, mean RMS ${features.meanRms.toFixed(3)}, onsets ${features.onsets} (expected ${features.expectedStrums})${features.chords ? `, ${features.chords}` : ""}`}`
            : "A take records RMS and chroma. Test take uses the microphone. Play demo guitar uses the synth."}
        </p>
      </section>

      <section className="flex flex-col items-start gap-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Coach</h2>
        <p className="font-mono text-sm">{coachPhase ?? "Idle"}</p>
        {coachSay && <p className="text-lg">{coachSay}</p>}
      </section>

      {report && <BeatGrid report={report} />}

      <section className="flex w-full flex-col gap-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Last report</h2>
        <pre className="max-h-96 overflow-auto rounded-lg bg-zinc-100 p-4 font-mono text-xs text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
          {report ? JSON.stringify(report, null, 2) : "No take yet."}
        </pre>
      </section>
    </main>
  );
}
