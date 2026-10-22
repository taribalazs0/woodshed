/**
 * Ignore further rises this soon after an onset, so one strum is one onset.
 * The attack itself is only a few tens of milliseconds. This synth also has a
 * second, smaller lobe about 130-230 ms later. 250 ms covers both, and the
 * closest beats in range (140 BPM) are 429 ms apart, so two real strums stay apart.
 */
export const ONSET_REFRACTORY_SEC = 0.25;

/**
 * Rises below this are silence, even when the adaptive floor is near zero.
 * At 0.002 with 8x input gain, a headset take produced 139 onsets in 32 beats:
 * string buzz counted as strums and the beat mapping fell apart.
 */
const MIN_RISE = 0.01;

/** An onset must exceed this multiple of the recent median rise. */
const THRESHOLD_MULTIPLIER = 2.5;

/** How many previous rises set the adaptive floor. About 200 ms at 512 samples. */
const HISTORY_FRAMES = 20;

export interface Onset {
  /** AudioContext time of the frame where the RMS rise peaked. */
  time: number;
  rms: number;
}

/**
 * Finds strum onsets from timestamped RMS frames.
 * A frame is an onset when its RMS rise is a local peak above an adaptive
 * threshold, and the previous onset was at least ONSET_REFRACTORY_SEC earlier.
 */
export function detectOnsets(frames: readonly { time: number; rms: number }[]): Onset[] {
  if (frames.length < 3) return [];

  const rises = frames.map((frame, index) => {
    if (index === 0) return 0;
    return Math.max(0, frame.rms - frames[index - 1].rms);
  });

  const onsets: Onset[] = [];
  let lastTime = Number.NEGATIVE_INFINITY;

  for (let index = 1; index < frames.length - 1; index += 1) {
    const rise = rises[index];
    const recent = rises.slice(Math.max(0, index - HISTORY_FRAMES), index);
    const threshold = Math.max(MIN_RISE, THRESHOLD_MULTIPLIER * median(recent));
    const peaked = rise >= rises[index - 1] && rise > rises[index + 1];
    const refractoryOpen = frames[index].time - lastTime >= ONSET_REFRACTORY_SEC;
    if (rise > threshold && peaked && refractoryOpen) {
      onsets.push({ time: frames[index].time, rms: frames[index].rms });
      lastTime = frames[index].time;
    }
  }

  return onsets;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? 0;
}
