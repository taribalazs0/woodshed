# Woodshed todo

Bugs, rough edges, and improvements that showed up while building. This is not the build plan. The planned path stays in [roadmap.md](roadmap.md). Add an item here when something already built needs a fix or a change.

## Urgent and important

- **Demo guitar sounds wrong.** The strum does not sound like a real guitar being picked. A goofy voice will hurt the demo and the video, because reviewers without a guitar hear this instead of an acoustic.

## Not urgent and important

- **The interface is a debug screen.** Level meter, test buttons, sliders, and the feature counter are stacked in one column. Before the demo it should be calmer, more ordered, and easier to scan.
- **The level meter can read above 1.0.** A clap reached peak 2.778, and the clipping warning did fire. The row still says "1.0 = clip", which is confusing when Chrome hands over an unclipped float. Before the guitar T1b, either clamp the displayed peak at 1.0 or say that anything at or above 0.95 is too hot.
- **The coach sometimes names only the first late bar.** On the late-changes fixture, one reply listed bars 2, 4 and 6, and two replies mentioned only bar 2. T6 still passed. For the demo, the reply should name every late change the report flagged.
- **Two coach branches are untested.** `startTake` was only checked with `userSaid` null, where it correctly stayed null. Nobody has asked the coach to play, and nobody has sent two clean takes in a row to see the tempo suggestion.
- **There is no microphone picker.** The app uses whatever Chrome has as the default input. The guitar session needs the USB mic selected in Chrome, not only in Windows.

## Urgent and not important

## Not urgent and not important

- **`gpt-4o-mini-tts` shuts down on 6 January 2027.** Fine for the Thursday deadline. After that, speech has to move to the realtime model, which is a different API than the current mp3 route.
- **A cold `npm run dev` once left the Start button dead until a reload.** Seen only in the built-in browser while Turbopack was compiling the page for the first time. If it happens in Chrome, reload once before treating it as a bug.
