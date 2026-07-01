# Slice 7 — Animation rhythm (the time dimension)

The only slice judged across **time**, not as a still. The spatial look is frozen-correct
from Slices 2–6; this tunes how it moves.

## Contract unlocked
Waves move convincingly — swell travel + crest birth/decay + glint shimmer at a believable
open-sea cadence — and stay **deterministic** under injected `fixedTime`.

## API seam
- The clock from Slice 1 (`cam.time` / `frameConstants.time`) drives `waterShade`. Gerstner
  advances wave phases; IFFT advances spectrum time. `frameShell.setCamera`/`setClock` carries
  `fixedTime ?? performance.now()/1000` (copy the existing `fixedTime` pattern in
  `battle/renderer.ts`).
- Owner: renderer-core (clock) + `water/waterMaterialWgsl.ts` (phase advance).

## What the human can run / see
`/renderer/water-bakeoff?play=1` (animating) vs the default frozen frame, plus a
`write-anim`/`write-vibe`-style looping GIF scene.

## Verification gates
- **Time-series judgment** (the `write-vibe`/`write-anim` pattern): a filmstrip of snaps at
  fixed `t0,t1,t2,t3` → `rhythm/t0..t3`, watched frame-by-frame.
- **Determinism gate:** re-run the same `t` → byte-stable (prove containment with a
  position/time-pinned A/B, not byte-identity across unrelated changes — memory: "golden hash
  has no cavalry").
- Perf gate re-checked over an animated window (animation can change cost).
- **Last check:** `screenshot-critique` on the GIF — "does the sea breathe like sea, not
  jitter?"

## Slice variable & crop
**Variable:** temporal cadence — swell period, foam persistence, glint shimmer rate.
**Crop:** full plane over time. **Out of scope:** all spatial look (frozen from 2–6), the real
surfaces.

## What must stay green
Every prior frozen snapshot still matches at its pinned `t`.

## Human review checkpoint (NON-BLOCKING)
`preview-shots`/open the GIF; ~5 min; decide on the loop and record if silent.

## Feedback that would change this slice
"Too fast / sloshy" → lengthen the swell period. "Foam pops on and off" → add decay so foam
fades rather than blinks.
