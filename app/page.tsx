"use client";

import { Fragment, useEffect, useState } from "react";
import { getAudioContext, startAudio } from "@/lib/audio/context";
import { getMicProcessing, openMic, type MicProcessing } from "@/lib/audio/mic";

interface MicInfo {
  label: string;
  processing: MicProcessing;
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

export default function Home() {
  const [audioState, setAudioState] = useState<AudioContextState | null>(null);
  const [sampleRate, setSampleRate] = useState<number | null>(null);
  const [mic, setMic] = useState<MicInfo | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const started = sampleRate !== null;
  const ready = audioState === "running" && mic !== null;

  useEffect(() => {
    if (!started) return;
    const ctx = getAudioContext();
    const update = () => setAudioState(ctx.state);
    // Tone.js owns ctx.onstatechange, so state changes must be observed with addEventListener.
    ctx.addEventListener("statechange", update);
    return () => ctx.removeEventListener("statechange", update);
  }, [started]);

  async function handleStart() {
    setStarting(true);
    setError(null);
    try {
      const ctx = await startAudio();
      setSampleRate(ctx.sampleRate);
      setAudioState(ctx.state);
      const { track } = await openMic(ctx);
      setMic({ label: track.label, processing: getMicProcessing(track) });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
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
    </main>
  );
}
