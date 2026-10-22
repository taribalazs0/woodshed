import { encodeWav } from "@/lib/voice/wav";
import { keepTranscript } from "@/lib/voice/transcript";

const VAD_VERSION = "0.0.31";
const ONNX_VERSION = "1.30.0";

export interface PracticeEar {
  listen(): Promise<void>;
  pause(): Promise<void>;
}

/**
 * Listens on the already-open microphone and returns one transcript per utterance.
 * Pause it while a take or the coach's voice is playing.
 */
export async function openPracticeEar(
  ctx: AudioContext,
  stream: MediaStream,
  onTranscript: (text: string) => void,
): Promise<PracticeEar> {
  const { MicVAD } = await import("@ricky0123/vad-web");
  let session = 0;
  let listening = false;
  const vad = await MicVAD.new({
    baseAssetPath: `https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@${VAD_VERSION}/dist/`,
    onnxWASMBasePath: `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ONNX_VERSION}/dist/`,
    audioContext: ctx,
    startOnLoad: false,
    getStream: async () => stream,
    pauseStream: async () => {
      return;
    },
    resumeStream: async (current) => current,
    onSpeechEnd: (audio) => {
      if (!listening) return;
      const token = session;
      void transcribe(audio)
        .then((text) => {
          if (!listening || token !== session || !text) return;
          onTranscript(text);
        })
        .catch((err: unknown) => {
          console.error(err);
        });
    },
  });
  return {
    async listen() {
      session += 1;
      listening = true;
      await vad.start();
    },
    async pause() {
      listening = false;
      session += 1;
      await vad.pause();
    },
  };
}

async function transcribe(samples: Float32Array): Promise<string | null> {
  const body = new FormData();
  body.set("file", encodeWav(samples), "speech.wav");
  const response = await fetch("/api/transcribe", { method: "POST", body });
  const payload = (await response.json()) as { text?: string; error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Transcription failed.");
  return keepTranscript(payload.text ?? "");
}
