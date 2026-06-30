# Slice 8 — Integrate: battle open-sea horizon (first production surface)

The locked water look (Slices 2–7) drops into the **live battle renderer**. This slice only
reconciles integration concerns — seam, depth, MSAA, prop ordering — not the look.

## Contract unlocked
The sealed map-edge ocean (`role === 'ocean'`) of a real coastal battle renders the shared
animated water surface instead of the flat `gradQuad`, lapping the shoreline with no seam, at
the real gameplay camera. **First in-product checkpoint** — and the exact subject of the
reference image.

## API seam
- `battle/horizonPass.ts:120-131` `role:'ocean'` branch swaps the flat `gradQuad` for the
  tessellated `waterPlanePass` plane through `projectWorld3d` + `civsimBattleWorldDepth3d`
  (the pass already uses `projectWorld3d` for blockers, so the depth contract is known).
  Bind the `WaterFieldSource` at `@group(2)`; colors from `waterPalette`. Retire
  `WATER_SHALLOW`/`WATER_DEEP` consts into the palette.
- **MSAA firewall:** the new pipeline MUST set `multisample: gpuMultisample(shell.sampleCount)`
  — today's horizon pipeline omits it (battle is MSAA=1 now, but must stay safe if that changes).
- Wired into the existing `battle-horizon` pass entry (`web/src/battle/renderer.ts:216`).
  Owner: game-renderer/battle.

## What the human can run / see
`/renderer/battle-terrain-3d?gate=coastal-scrub&view=west` (the sealed-ocean edge) + a live
coastal battle. New scene `web/scenes/battle/water-open-sea.mjs` (coastal map, `VERIFY_GPU=1`,
fixed `t`).

## Verification gates
- `snapCheck` (re-bless the coast horizon shots in `web/shots/`); change-ledger the re-bless.
- **Seam check:** no stripe where field water meets the horizon water (sample the boundary
  band) — the invariant at `horizonPass.ts:19-23`.
- Perf gate at the gameplay camera **with the full crowd present** (the
  `full-game-rendering-performance.mjs` budget).
- `compare-screenshots` vs the reference (this is the closest real surface to the dusk
  deep-ocean target).
- **Last check:** `screenshot-critique` — "does the sealed sea behind a beach battle sell the
  setting and still read warm under golden hour?"

## Slice variable & crop
**Variable:** integration correctness — seam, depth interaction with terrain/props, MSAA.
**Crop:** the horizon band above the shoreline. **Out of scope:** coastal field water (S9),
campaign sea (S10); the blocker geometry (stone/wall edges) is untouched.

## What must stay green
`battle-terrain-blockers.mjs`, `battle-terrain-3d.mjs` maps where the edge is wall/cliff (not
ocean); prop/crowd depth ordering over water (read-write depth slot unchanged); `renderGraph.ts`
battle water bucket validation.

## Human review checkpoint (NON-BLOCKING)
`preview-shots` the in-product shot; ~5 min; decide and record if silent.

## Feedback that would change this slice
"Stripe at the shoreline" → reconcile field-water vs horizon-water color/haze at the boundary.
"Waves clip the headland" → depth/seating fix against the blocker geometry.
