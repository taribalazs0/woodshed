import Meyda, { type MeydaFeaturesObject } from "meyda";

/** One analysis window. At 48 kHz this is about 10.7 ms. */
export const FEATURE_BUFFER_SIZE = 512;

export interface FeatureFrame {
  /** AudioContext time at the start of this buffer. */
  time: number;
  rms: number;
  /** Twelve pitch classes, C through B. */
  chroma: number[];
}

export interface FeatureProgress {
  frames: number;
  maxRms: number;
}

export interface FeatureStream {
  /** Point the analyzer at the mic or the demo guitar. Does not disconnect the node's other outputs. */
  setSource(source: AudioNode): void;
  /**
   * Collect frames with a start time in [from, until).
   * Resolves once the audio clock passes `until`.
   */
  record(
    source: AudioNode,
    from: number,
    until: number,
    onProgress?: (progress: FeatureProgress) => void,
  ): Promise<FeatureFrame[]>;
}

/**
 * One Meyda analyzer for the shared AudioContext.
 * Frames carry RMS and chroma, stamped on the audio clock.
 */
export function createFeatureStream(ctx: AudioContext, source: AudioNode): FeatureStream {
  const frameDuration = FEATURE_BUFFER_SIZE / ctx.sampleRate;
  const capture: {
    id: number;
    from: number;
    until: number;
    frames: FeatureFrame[];
    maxRms: number;
    onProgress?: (progress: FeatureProgress) => void;
  } = { id: 0, from: 0, until: 0, frames: [], maxRms: 0 };

  const analyzer = Meyda.createMeydaAnalyzer({
    audioContext: ctx,
    source,
    bufferSize: FEATURE_BUFFER_SIZE,
    hopSize: FEATURE_BUFFER_SIZE,
    featureExtractors: ["rms", "chroma"],
    inputs: 1,
    callback: (features: Partial<MeydaFeaturesObject>) => {
      if (capture.id === 0) return;
      if (typeof features.rms !== "number" || !features.chroma) return;
      const time = ctx.currentTime - frameDuration;
      if (time < capture.from || time >= capture.until) return;
      capture.frames.push({
        time,
        rms: features.rms,
        chroma: features.chroma.slice(),
      });
      capture.maxRms = Math.max(capture.maxRms, features.rms);
      if (capture.frames.length % 8 === 0) {
        capture.onProgress?.({ frames: capture.frames.length, maxRms: capture.maxRms });
      }
    },
  });

  // Meyda connects its processor straight to the speakers. The buffer it
  // writes is empty, which some browsers play as a buzz. Mute that tap.
  const mute = ctx.createGain();
  mute.gain.value = 0;
  mute.connect(ctx.destination);
  const processor = (analyzer as unknown as { _m: { spn: ScriptProcessorNode } })._m.spn;
  processor.disconnect();
  processor.connect(mute);

  return {
    setSource(next) {
      analyzer.setSource(next);
    },
    record(next, from, until, onProgress) {
      const id = capture.id + 1;
      capture.id = id;
      capture.from = from;
      capture.until = until;
      capture.frames = [];
      capture.maxRms = 0;
      capture.onProgress = onProgress;
      analyzer.setSource(next);
      analyzer.start(["rms", "chroma"]);
      onProgress?.({ frames: 0, maxRms: 0 });

      return new Promise((resolve) => {
        const finish = () => {
          if (capture.id !== id) return;
          if (ctx.currentTime < until) {
            requestAnimationFrame(finish);
            return;
          }
          analyzer.stop();
          resolve(capture.frames);
        };
        requestAnimationFrame(finish);
      });
    },
  };
}
