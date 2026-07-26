# 25 — Bird scheduler (self-clocked, voice-capped)

**Track:** audio · **Gate:** scheduler unit test (cap + interval floor, no leak) +
Offline transient peaks + by-ear · **Depends:** `20`. **Feeds `41`.**

## Contract
Intermittent bird calls with species/pan variation — the life of the meadow — with a
bounded, leak-free node budget.

## API seam
`packages/ambient-audio/src/BirdScheduler.ts` — **`BirdScheduler`** + **`BirdVoice`**:
- **self-clocked look-ahead** scheduler on `ctx.currentTime` (NOT rAF);
  `nextBird = t + 1.4 + rand·6.5`.
- `BirdVoice` = the pen's `bird()` phrase: 2–6 chirp-glide oscillators (sine/triangle
  by species), freq sweeps, per-chirp ADSR, stereo pan.
- **Bounded voice pool + interval floor + `onended` disconnect** (no accumulation).

## Verification
Unit test: over a simulated 60 s the scheduler respects the interval floor and never
exceeds the voice cap; node count returns to baseline after a "bird storm" (no leak —
the `41` invariant). Offline probe shows transient peaks above the noise floor.
By-ear.

## Delegated
Species timbres; call cadence / interval floor; voice-pool cap size.

Implementation note: selected cap `MAX_CONCURRENT_BIRD_VOICES = 4`, interval floor `1.4 s`, per-phrase node count `5-13` (`StereoPanner` plus 2-6 oscillator/gain pairs).
