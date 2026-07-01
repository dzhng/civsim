# Slice 2 — Wave silhouette / displacement (open-sea plane, winner only)

First look slice. Tunes the **geometry** of the waves on the open-sea `waterPlanePass` in
the lab route, in neutral grey, with the bake-off winner only.

## Contract unlocked
A tessellated, animated displaced plane whose crest/trough silhouette and slope-shading read
as believable open-sea swell — replacing any flat plane. MSAA/depth behavior of the
displaced plane is sorted here, before any real-surface integration.

## API seam
- `water/waterMaterialWgsl.ts` — finalize `waterField`/`waterSample` body for the winner;
  `waterShade` returns debug grey shaded only by `normal · sunDir`.
- `water/waterPlanePass.ts` — vertices call `waterField(p,t).height` and displace through
  `projectWorld3d`; fragments shade from `.normal`. World-depth `read-write` slot;
  `gpuMultisample(shell.sampleCount)`; `civsimBattleWorldDepth3d`.
- New constant: subdivision count (perf-bounded). Owner: game-renderer/water.

## What the human can run / see
`/renderer/water-bakeoff?tech=<winner>&t=<fixed>` (now single-tech, grey), plus a free-running
mode. Add `web/scenes/.../water-silhouette.mjs` snapping at a fixed `t`.

## Verification gates
- `snapCheck` on the swell band at fixed `t`.
- Perf gate: `gpuTimeMs` delta vs the flat plane within the Slice 1 budget.
- `compare-screenshots` vs the reference — **silhouette/value only** (mask color, foam,
  glint).
- **Last check:** `screenshot-critique` on the shot — "does the chop read like the
  reference's geometry, not a vibrating sheet?"

## Slice variable & crop
**Variable:** wave shape — displacement amplitude + wavelength + slope. **Crop:** mid-frame
open-water band at the grazing horizon angle. **Mask color entirely.**

**Out of scope:** color, foam, glint, haze, animation polish, the real surfaces. A neutral
mid-grey placeholder albedo is expected and not judged.

## What must stay green
All four current water sites untouched; the depth/MSAA contract validation in `renderGraph.ts`;
no z-fight against `BattleHorizonPass` blockers on the lab route.

## Human review checkpoint (NON-BLOCKING)
`preview-shots` the silhouette crop; ~5 min; decide on the evidence and record if silent.

## Feedback that would change this slice
"Too uniform / too tiled" → add wave-bank octaves or shift IFFT cascade. "Too choppy for an
Aegean summer" → drop amplitude (the reference is a rougher sea; civsim may want calmer).
