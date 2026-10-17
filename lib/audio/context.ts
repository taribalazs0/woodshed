let audioContext: AudioContext | null = null;
let toneReady: Promise<void> | null = null;

/**
 * Creates the app's single AudioContext on the first call and hands it to Tone.js.
 * The first call must come from a user gesture (a click), or Chrome keeps the context suspended.
 */
export async function startAudio(): Promise<AudioContext> {
  if (!audioContext) {
    audioContext = new AudioContext();
    toneReady = shareWithTone(audioContext);
  }
  const ctx = audioContext;
  await Promise.all([ctx.resume(), toneReady]);
  return ctx;
}

export function getAudioContext(): AudioContext {
  if (!audioContext) {
    throw new Error("Audio is not started yet: call startAudio() from a click first.");
  }
  return audioContext;
}

async function shareWithTone(ctx: AudioContext): Promise<void> {
  const Tone = await import("tone");
  Tone.setContext(ctx);
  if (Tone.getContext().rawContext !== ctx) {
    throw new Error("Tone.js did not adopt the shared AudioContext.");
  }
}
