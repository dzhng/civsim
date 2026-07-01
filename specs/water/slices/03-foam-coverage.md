# Slice 3 — Whitecap foam coverage (open-sea plane)

## Contract unlocked
Wind-driven whitecap foam appears on crests across the open sea, matching the reference's
"whitecaps everywhere" density without becoming a white sheet.

## API seam
- `WaterSample.foam` drives it — Gerstner: crest steepness / Jacobian-style fold (cf.
  existing `crest`/`farBreak` logic in `terrainPass`); IFFT: foam channel from the spectrum
  Jacobian. Composited in the plane `fs`.
- Foam color is a neutral white-grey placeholder for now (it moves into `waterPalette` at
  Slice 5), **not** dusk-tinted. Owner: `water/waterMaterialWgsl.ts`.

## What the human can run / see
`/renderer/water-bakeoff` with foam on; `web/scenes/.../water-foam.mjs` at fixed `t`.

## Verification gates
- `snapCheck` on the foam field.
- `compare-screenshots` vs the reference judged **only on foam coverage fraction + crest
  placement** (consider a near-white-pixel-fraction metric like the existing terrain metrics).
- **Last check:** `screenshot-critique` on the shot.

## Slice variable & crop
**Variable:** foam coverage + threshold. **Crop:** open-water whitecap field; mask the glint
streak. **Out of scope:** glint, color grade, shore/swash foam (that is Slice 9), haze.

## What must stay green
Slice 2 silhouette snap (within noise); foam must not appear on non-water; the four current
water sites untouched.

## Human review checkpoint (NON-BLOCKING)
`preview-shots` the foam crop; ~5 min; decide and record if silent.

## Feedback that would change this slice
"Too sparse" → lower the crest threshold. "Looks like noise, not foam" → tie foam to a
sharper Jacobian/steepness signal and add a little persistence (foam decays after the crest).
