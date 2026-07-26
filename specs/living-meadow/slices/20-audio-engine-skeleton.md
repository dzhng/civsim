# 20 — Ambient audio engine skeleton + Offline test harness

**Track:** audio (parallel from t0) · **Gate:** `OfflineAudioContext` RMS/FFT unit
test (the always-green audio-truth gate) + manual by-ear · **Kills R4, R5.**

## Contract
A testable, render-loop-independent ambient-audio subsystem: `AudioContext`
lifecycle, master chain, mixer, autoplay-gesture unlock — proven audible on a lab
route and proven verifiable headlessly (screenshots have no sound).

## API seam — NEW package `packages/ambient-audio/` (framework-agnostic: no THREE, no render-loop import)
- `src/AmbientAudioEngine.ts` — **`AmbientAudioEngine`**: owns `AudioContext`
  (suspended until gesture), master chain `gain → warm lowshelf(220,+2.5) → air
  highshelf(9k,−3) → DynamicsCompressor(-16,22,3.2) → destination` + a convolver
  reverb send bus; `create()` / `resume()` / `suspend()` / `dispose()`; `ok`/`mounted`
  gates. (We **add** the teardown the pen lacks.)
- `src/AudioMixer.ts` — **`AudioMixer`**: master volume, `muted`, per-bed submix
  gains; **all changes ramped** (`setTargetAtTime`) to avoid clicks. Single owner of
  "how loud is each thing."
- `src/AmbientAudioDirector.ts` — **`AmbientAudioDirector.update(input: MeadowSoundscapeInput)`**
  where `MeadowSoundscapeInput = { windSpeed, windGust, waterProximity, waterPan,
  grassNear, listenerXY, dtSeconds }`. **The ONE per-frame seam the game calls** —
  control values only, no scheduling, no THREE types cross it.
- `src/index.ts` — public surface + types (`MeadowSoundscapeInput`,
  `AmbientAudioSettings`).
- **Lab route** `apps/renderer-lab/src/meadowAudioRoute.ts` → `/renderer/meadow-audio`:
  start button (gesture), volume/mute, an `AnalyserNode` RMS meter + waveform canvas,
  a "poke" test tone. Publishes `__rendererLabStats = { rms, activeNodes, ctxState }`.

**Scope (D3):** ambient beds only. Excludes music, train, whistle, footsteps, and
all combat/unit SFX.

## What a human can run / hear
`/renderer/meadow-audio` → click start → test tone; volume/mute respond; refresh →
silent until gesture (autoplay-correct).

## Verification
**Gate (deterministic, headless):** a vitest unit test builds the engine against an
`OfflineAudioContext`, asserts the master graph shape + that `muted` drives master→0;
renders the test tone → **RMS/FFT probe** asserts non-silent unmuted, ≈0 muted. A
harness screenshot only proves the UI renders, not the sound.

## Must stay green
Everything (new package, opt-in route).

## Delegated
Exact master compressor/EQ values; whether audio settings live in
`web/src/shared/graphicsSettings.ts` (new `audio` block) or a sibling
`audioSettings.ts`.

## Reslice hooks (HIGH RISK — the verification model)
`20a` OfflineAudioContext graph + RMS test harness (the CI gate); `20b` the manual
audible route; `20c` the `__rendererLabStats` RMS/waveform publish + a `web/scenes`
scene asserting non-silence via the Offline probe.
