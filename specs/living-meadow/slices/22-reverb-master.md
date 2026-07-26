# 22 — Reverb + master voicing

**Track:** audio · **Gate:** Offline decay-tail probe + by-ear · **Depends:** `20`,
`21`.

## Contract
The valley space — a procedural convolver reverb that gives the beds air — plus
final master EQ/compressor voicing. A distinct slice because IR generation is a
one-time CPU cost and "valley character" is its own judgeable quality.

## API seam
`packages/ambient-audio/src/reverb.ts` — **`buildValleyImpulseResponse(ctx, seed)`**
(3.4 s IR from decaying noise + sparse valley early reflections; wet ~0.34) → the
convolver + send bus in `AmbientAudioEngine`; per-bed sends via `AudioMixer`. Tune
the master warm/air/compressor.

## Verification
Offline render shows tail energy *after* the source stops (decay probe); by-ear
check that wind gains a plausible valley space.

## Delegated
IR length/shape constants; per-bed send levels.
