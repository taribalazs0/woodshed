export interface Mic {
  stream: MediaStream;
  track: MediaStreamTrack;
  /** The raw mic signal in the shared AudioContext. Never connect it to ctx.destination: that plays the mic back through the speakers. */
  source: MediaStreamAudioSourceNode;
}

export interface MicProcessing {
  echoCancellation: boolean | undefined;
  noiseSuppression: boolean | undefined;
  autoGainControl: boolean | undefined;
}

let micPromise: Promise<Mic> | null = null;

/**
 * Opens the microphone once, with all browser voice processing turned off,
 * so the analyzer gets the raw guitar signal. A failed attempt can be retried.
 */
export function openMic(ctx: AudioContext): Promise<Mic> {
  micPromise ??= requestMic(ctx).catch((err: unknown) => {
    micPromise = null;
    throw new Error(describeMicError(err));
  });
  return micPromise;
}

export function getMicProcessing(track: MediaStreamTrack): MicProcessing {
  const { echoCancellation, noiseSuppression, autoGainControl } = track.getSettings();
  return { echoCancellation, noiseSuppression, autoGainControl };
}

async function requestMic(ctx: AudioContext): Promise<Mic> {
  if (!navigator.mediaDevices) {
    throw new Error("Microphone access needs a secure page: open the app at http://localhost:3000.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });
  const [track] = stream.getAudioTracks();
  return { stream, track, source: ctx.createMediaStreamSource(stream) };
}

function describeMicError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  switch (name) {
    case "NotAllowedError":
      return "Microphone access is blocked. Click the icon on the left of the address bar, allow the microphone, then click Start again.";
    case "NotFoundError":
      return "No microphone was found. Plug one in, then click Start again.";
    case "NotReadableError":
      return "The microphone is busy or blocked by the system. Close other apps that use it, then click Start again.";
    default:
      return err instanceof Error ? err.message : `Could not open the microphone: ${String(err)}`;
  }
}
