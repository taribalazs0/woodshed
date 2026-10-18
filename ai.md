# AI usage

This file covers two things: the AI tools I used to build Woodshed, and the AI that runs inside Woodshed.

## AI tools used to build Woodshed

### Cursor (agent mode, with Claude)

Cursor is my main development tool. I used the agent for:

- **Ideation and choosing the problem.** The agent proposed three concepts for different tracks: defending against scam calls while the call is happening, a cockpit copilot that checks pilots' readbacks of air traffic control instructions, and a voice assistant for restaurant kitchens. I proposed a music-practice idea myself, the agent stress-tested it (existing apps, technical risks, how reviewers without a guitar could try it), and I chose it.
- **Scoping.** Cutting the plan down to what can be built, tested and documented before the deadline.
- **Architecture decisions.** For example: music analysis stays deterministic and runs in the browser, the LLM is only used for coaching, and there is no database or native dependency, so a fresh clone runs on a reviewer's machine without extra setup.
- **Code generation in small steps.** A project rule ([.cursor/rules/woodshed.mdc](.cursor/rules/woodshed.mdc)) makes the agent work in small micro-steps and wait for my confirmation and test results before moving on, so I review every change before it lands.
- **Documentation.** First drafts of README.md and this file.

### Gemini

> TODO (Balázs): one or two sentences on how I used Gemini.

### How I check AI output

- I review every diff before accepting it.
- I test the audio analysis with a real guitar, not only with the synthesized demo guitar.
- Before submitting, I run the project from a fresh clone, following README.md step by step.

## AI inside Woodshed

- **Speech-to-text (OpenAI `gpt-transcribe`).** Transcribes what you say. Only the audio segments that the voice detector classifies as speech are sent. Keyword hints for the chord names and tempo words keep "Em" from turning into "M".
- **The coach (OpenAI `gpt-5.6-sol`, reasoning effort `none`).** Receives the take report, your previous takes and what you just said. It answers in one or two short spoken sentences and controls the practice session through tool calls: setting the tempo, changing the exercise, starting a take, and stopping.
- **Text-to-speech (OpenAI `gpt-4o-mini-tts`, voice `marin`).** Gives the coach its voice. A style instruction makes it sound like a calm, encouraging teacher.
- **Voice activity detection (Silero VAD).** A small neural network that runs locally in the browser and decides which parts of the microphone signal are speech.

### Why these models

Cost was not the deciding factor. Even with a flagship coach, one practice turn costs about one cent, so a $10 credit covers development and the demo. What a judged voice coach actually needs is latency and discipline: a reply within a few seconds, exactly one tip, and no number that isn't in the report.

That is why the coach is a strong model (`gpt-5.6-sol`) with reasoning turned off. The DSP already ranked the issue, so the model only has to phrase it well and quickly. We checked the models this API key can actually call and defaulted to ones on that list. `gpt-6-sol` is a newer family in OpenAI's docs, but it was not available on this account, so it is not the default. `gpt-5.6-luna` is the low-cost alternative for the coach if latency or credit becomes a problem.

Speech uses `gpt-transcribe` instead of the cheaper mini transcribe model because chord names and tempo numbers have to come through on the first try. The voice uses `gpt-4o-mini-tts` with `marin` because it accepts a style instruction; that is the part reviewers hear.

Every model can be swapped through an environment variable.

### Deliberately not AI

Timing and chord detection are deterministic signal processing: onset detection finds each strum, and chroma template matching decides which chord rang. These measurements have to be fast, repeatable and explainable, which a language model listening to raw audio would not guarantee. The LLM only ever receives numbers, never audio of your playing. In short: the DSP measures, the LLM teaches.

## Development log

- **2026-10-16:** Ideation and scoping with the Cursor agent. Compared concepts across the tracks, picked the guitar coach for the Real-Time Assistance track, cut the scope to fit the deadline, chose the stack (Next.js, browser DSP, OpenAI), and drafted README.md and this file.
- **2026-10-17:** M0, the app hears you. Built with the agent one micro-step at a time, each step tested and committed separately: the Next.js 16 scaffold, the dependencies, server-side config for the OpenAI key, one shared `AudioContext` handed to Tone.js, the raw microphone with the browser's voice processing turned off, and a level meter with peak, clipping and noise floor. Before wiring up Tone.js, the agent read its source and found that Tone takes over the context's `onstatechange`, so the app listens with `addEventListener` instead. Chose the models with the agent from OpenAI's current pricing, model docs, and the models this API key can list: `gpt-transcribe` for speech, `gpt-5.6-sol` with reasoning off for the coach, and `gpt-4o-mini-tts` (`marin`) for the voice.

## Where I overruled the AI

- **Scope.** The agent's first version of the guitar idea included muted-string detection, spaced-repetition scheduling (FSRS) and a database. I cut these to keep the project buildable and easy to run within the deadline. They are candidates for the "what I'd do next" part of the write-up.
- **Coach model.** A cheaper coach (`gpt-5.6-luna`) would have been enough on paper, because the DSP already picks the issue. For the demo I kept `gpt-5.6-sol`: one invented number in a spoken correction is worse than spending an extra cent. I also did not default to `gpt-6-sol`, because this account cannot call it yet.
