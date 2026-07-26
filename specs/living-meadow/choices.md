# living-meadow — choices ledger

Decisions made where the spec was silent, per [audit-choices]. Grouped by pass;
consolidated at close per implement-spec step 11.

## Pass: slice 00 (lab fixture + probes) — 2026-07-26

- **R4/R5 probes reassigned to slice 20.** The parallel audio lane built the
  real OfflineAudioContext harness + gesture-gated route, which subsumes the
  probes; slice 00 shipped only R2/R3. *Sound — recorded in both slice files.*
- **`dt` seam realized as a TSL frame uniform** (`createBattleFrameUniforms().dt`,
  written in `PhotorealBattleWorld.draw`), threaded scene→renderer→world.
  The CPU-side `frameDt` local in `scene.ts frame()` remains the CPU consumer
  seam for audio (slice 26). Nothing reads the GPU uniform yet; captures at
  fixed `?t=` proved byte-stable with it in place. *Sound; revisit only if a
  consumer needs per-layer dt instead.*
- **Close crop = ratified blade-field close-gate zoom 7.86** (shared with
  `/renderer/blade-field`), center (0,-650). Vista = zoom 5.2, pitch 0.21,
  center (0,-470). Vista reads as an elevated diorama, not the hero's low
  oblique — accepted for slice 00 (fixture exists); if slice 05's horizon-band
  judging needs a lower oblique, that slice re-tunes the vista preset
  deliberately. *Provisional — owned by slice 05.*
- **Probe placement at fixed world coords** made the R3 patch land half-out of
  frame; verdicts were still concludable from zoomed crops. Probes deleted, so
  no follow-up. *Sound.*
- **vitest default scope discovery:** `web` vitest only includes
  `src/**/*.test.tsx` + `src/**/*.test.ui.ts` (3 files / 12 tests);
  `web/tests/*.test.ts` are NOT in the default run (pre-existing repo state,
  not changed by this spec). Slice 20 appended its test to the include list —
  additive only. *User-visible fact, no action taken; flag if David expects
  web/tests/* in `vitest run`.*

## Pass: slice 20 (audio skeleton) — 2026-07-26

- **`node-web-audio-api` added as a `web` devDependency** to give vitest a real
  `OfflineAudioContext` (R4). Alternative (hand-rolled mock + browser-context
  RMS) rejected as weaker. *Sound — smallest honest gate.*
- **Engine accepts the AudioContext constructor via injection** (realtime or
  offline tuple), rather than importing a global. *Sound — this is what makes
  the package testable.*
- **Mixer beds pre-declared** as `wind | grass | water | birds | test` submixes
  (slices 21-25 fill them). *Sound; cosmetic.*
- **Reverb send bus ships as a stub** (convolver + wet gain at 0) — the valley
  IR is slice 22's contract. *Sound — matches the slice ladder.*
- **Route builds the graph up-front and only `resume()`s on gesture** (vs
  constructing on first click). Confirmed the gesture gate holds live
  (suspended→running). *Sound.*

## Pass: slice 02 spike (2026-07-26)

- **VERDICT: EVOLVE.** Recorded with full evidence in the slice file. The
  unprimed neutral judge reversed the orchestrator's primed read (brighter
  fresh blades had read as "denser"; measured coverage said otherwise) —
  the unprimed gate earned its keep. *Sound.*
- **Fresh port deleted** as a rejected primitive (was honest-but-reduced:
  single LOD, CPU prefix, no compute route, 5x triangles). Its one finding —
  warmer blade shading reads meadow-softer — handed to slices 03/04. *Sound.*
- **MeadowGrassLayer interface kept** (single grass-layer contract for the 09
  cutover); simplified post-verdict to drop the hash param only the deleted
  fork needed. `applyPackedRecords` reverted to its original signature.
  *Sound — no parallel abstraction survives.*
- **`?impl=` param removed** from the fixture (verdict is final; the fixture
  now always opts into the far-density profile). If a later slice needs
  pre/post A/B it re-adds a param deliberately. *Sound; cosmetic.*
- **Far-density profile constants** (720 m end, 260 m reference, 1.5 power)
  are first-guess values — slice 05 owns tuning them against the vista crop.
  *Provisional — owned by slice 05.*
- **Spike finding for the ladder:** near-field bald ground is the biggest gap
  vs the hero; ground-underlayer color match flagged into slice 04/05; flat-cut
  tip fix flagged into slice 06. *Sound — recorded in the slice file.*
