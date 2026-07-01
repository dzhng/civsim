# Slice 9 — Battle OPEN-SEA horizon plane (seated on the S8 material)

The sealed map-edge ocean becomes the shared animated water surface — and because S8 already made
the on-field water the **same material** with the same `waterShoreRamp`, the field↔sea shoreline
seam that stopped the first attempt **cannot exist by construction**. This slice is now mostly
plumbing: swap the flat quad for the plane, seat it, meet the field water at the shore.

## Contract unlocked
The sealed `role:'ocean'` edge of a real coastal battle renders the tessellated, displaced,
foam-and-glint sea instead of the flat `gradQuad`, lapping the shoreline with **no stripe**, warm
under golden hour — the closest production surface to the reference image, and the first in-product
open-sea checkpoint.

## API seam (module / functions / data / ownership) — owner: game-renderer/battle
- **`battle/horizonPass.ts`:** replace the `role:'ocean'` branch (`:120–131`, the `gradQuad` +
  `WATER_DEEP`/`WATER_SHALLOW` consts at `:22–23`) with a **per-ocean-edge `WaterPlanePass`**
  (reuse `water/waterPlanePass.ts` — do **not** re-implement) seated at
  `baseZ = terrainHeightAt(field, edgeX, midY)`, drawn after the blocker mesh in the same
  `battle-horizon` world-depth pass (`read-write`). Drive it with the **S8 shared `waterShoreRamp`**
  using battle constants (`shoreX = edgeX`, `hazeNear/hazeFar ≈ 500/1800` — lab's 55/300 washes out
  the inland-camera sea), `WATER_ENVIRONMENTS.golden`, one shared `GerstnerWaterField`. The ocean
  region for a west edge is X ∈ [edgeX−far, edgeX+24], Y ∈ [y0−400, y1+400] (`outward` ±1 for
  west/east). **Add `multisample: gpuMultisample(shell.sampleCount)`** (the horizon pipeline omits
  it today, `:81`).
- Sun: the battle uses the frameShell defaults which already match `horizonPass`'s hardcoded sun —
  `waterShade` reads `sunDirection()` from the camera uniform; no `setSun` needed.
- **`apps/renderer-lab/src/router.ts`:** add a `t` param to `routeBattleTerrain3d` (like the lab
  route) so the animated sea snaps deterministically.
- **`web/src/battle/renderer.ts`:** confirm the `battle-horizon` pass wiring still holds; the water
  draws inside `BattleHorizonPass.draw` (no new frame-graph pass).
- **The seam is closed by material identity, not caulking.** At the shore, the sea plane's near edge
  and the S8 field water are the same `waterShade(golden, depth01≈shallow, haze01≈near)` evaluation
  through the same helper. If any residual line shows, feather/jitter **all** the ramps (depth,
  haze, foam-fade) — the attempt-1 finding was that fading only the wave amplitude is not enough.

## What the human can run / see
`/renderer/battle-terrain-3d?gate=coastal-scrub&view=field&t=…` (3/4 gameplay, **primary judge**)
and `&view=west` (grazing, **regression only**), plus a live coastal battle. New scene
`web/scenes/battle/water-open-sea.mjs` (`VERIFY_GPU=1 …hardware …HEADFUL`, fixed `t`).

## Verification gates
- **Shoreline-continuity gate (the whole point):** no stripe where the S8 field water meets the
  open sea — judged at **`view=field` first**, with `view=west` as a secondary regression snap.
- `snapCheck` re-bless `terrain-blockers/coastal-scrub-west.png`, `river-and-crags-east.png`
  (both edges), and `terrain-3d/coastal-scrub.png` / `river-and-crags.png` (ocean in far
  background); change-ledger the re-bless.
- Depth / no z-fight under props & crowd (read-write depth); MSAA-safe; determinism at fixed `t`;
  perf `gpuTimeMs` at the gameplay camera **with crowd** (the plane res is the dial — attempt-1 sat
  at budget with 560²).
- **`compare-screenshots`** vs `assets/reference-ifft-ocean-dusk.png` for the horizon band —
  geometry/foam/glint *behaviour*, not the dusk mood (battle is golden hour).
- **Last check (required): run the [`screenshot-critique`](../../../.claude/skills/screenshot-critique)
  skill** on the `view=field` crop: "a continuous foam-and-glint sea meeting the beach with no ruler
  line, warm under golden hour, from a normal battle camera?"

## Slice variable & crop
**Variable:** integration correctness — seam continuity, depth/prop interaction, MSAA. **Crop:** the
horizon sea + shoreline band over the beach, 3/4 camera. **Frozen inputs:** everything S8 froze +
the S8 shore material/ramp constants (this is the coupling) + `WaterPlanePass` + `projectWorld3d` /
`civsimBattleWorldDepth3d` + the reference PNG.

**Out of scope:** the on-field water look (frozen from S8); the blocker geometry (stone/wall/cliff
edges are untouched); campaign.

## What must stay green
Wall/cliff/open-fog edges (`walled-plain-*`, `coastal-scrub-east` cliff, `river-and-crags-west`,
N/S fog); the live `battle-renderer-default`; S8's on-field water; `renderGraph.ts` battle water
bucket validation; prop/crowd depth ordering over water (read-write depth slot unchanged).

## Human review checkpoint (NON-BLOCKING)
[`preview-shots`](../../../.claude/skills/preview-shots) the in-product shot (3/4) + the shoreline
strip; ~5 min; decide on the evidence and record if silent, then close the shots.

## Feedback that would change this slice
"Stripe at the shoreline" → the ramp isn't the shared S8 helper, or a ramp other than the wave-fade
is discontinuous (feather depth + haze too). "Waves clip the headland" → depth/seating fix against
the blocker geometry. "Whole battle sea is washed out" → `hazeNear/hazeFar` too near for the inland
camera (push them out). "Reads cold under golden hour" → the env preset/sun disagree with the land.
