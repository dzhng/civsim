# Slice 6 — Horizon haze / aerial perspective (open-sea plane)

## Contract unlocked
Far water desaturates toward the sky with **no hard horizon line**; soft sea-to-sky seam;
aerial perspective everywhere. Judged here before the battle open-sea integration, where the
plane runs thousands of world units to the horizon.

## API seam
- A distance/haze term in `waterShade` keyed on world distance (or projected depth), mixing
  toward `waterEnvironment.hazeColor`. Must match the land aerial term so field-water-to-open-sea
  shows no stripe (`frameShell.ts:289-292`; the invariant at `horizonPass.ts:19-23`).
- Owner: `water/waterEnvironment.ts` (haze color + falloff) + the plane `fs`.

## What the human can run / see
`/renderer/water-bakeoff` framed to include the far horizon.

## Verification gates
- `snapCheck` on the horizon band.
- `compare-screenshots` vs the reference — **soft horizon seam only**.
- **Last check:** `screenshot-critique` — "no hard sea/sky line; far water hazes into the sky?"

## Slice variable & crop
**Variable:** haze falloff + horizon softness. **Crop:** the top sea-to-sky seam band.
**Out of scope:** near-water detail, foam, animation cadence, the coastal/campaign surfaces.

## What must stay green
Slices 2–5; the land-edge HAZE seam still matches (no stripe at the shore boundary).

## Human review checkpoint (NON-BLOCKING)
`preview-shots` the horizon band; ~5 min; decide and record if silent.

## Feedback that would change this slice
"Hard line at the horizon" → extend the falloff / soften the seam. "Whole sea is milky" →
falloff starts too near; push it to the far distance only.
