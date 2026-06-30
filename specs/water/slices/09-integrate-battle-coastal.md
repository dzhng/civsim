# Slice 9 — Integrate: battle coastal gameplay water (the richest target)

## Contract unlocked
Lakes/rivers/shore on the **playable field** get the shared water look — shallows→deep ramp,
shore foam, glint — replacing the flat tint baked into the displaced ground mesh
(`groundPass.ts:23`, `TINT_COLOR[1]`) and the inline kind-0/kind-10 shaders
(`terrainPass.ts:89-104,161-166`). Field water and open sea read continuous.

## API seam — and the design decision this slice owns
Coastal water today is split between two paths that must be unified:
- `terrainPass.ts` draws water on **flat `projectGround` quads** — these **cannot show
  displacement** until moved to a z-bearing path (`projectWorld3d`). This is the key
  constraint (caught in recon).
- `groundPass.ts` bakes a **flat color** into the 3D ground-mesh vertices — no waves at all.

Pick ONE and document it in this file before building:
- **(a) Dedicated coastal-water pass** drawing animated water where `tint == water`, layered
  over the ground mesh and seated against `terrain/heightField.ts` so water meets shore without
  z-fighting. (Recommended — visual parity with the open sea.)
- **(b) Per-fragment water treatment inside `groundPass.fs`** keyed on the water tint byte —
  cheaper, but cannot displace geometry.

Then: new `battle/coastalWaterPass.ts` (if a) consuming `WaterFieldSource` + `waterPalette` at
**low amplitude** (shore, not open ocean); remove the flat `[0.26,0.40,0.52]` from
`groundPass` and the kind-0/10 inline water from `terrainPass`. The Aegean shore grade
tan-sand → pale turquoise → deeper blue comes from a `waterPalette` shore ramp. Owner:
game-renderer/battle.

## What the human can run / see
`/renderer/battle-terrain-3d?gate=coastal-scrub&view=field` + a live battle on a river/lake
map. `web/scenes/battle/water-coastal.mjs`.

## Verification gates
- `snapCheck` (re-bless coast field shots; change-ledger).
- **Continuity check:** no stripe where field water meets the open sea at the edge.
- **Z-fight / shore-seam check** against the height field; soldiers/props **must not move**
  (they ride the same height field).
- Perf with the crowd present.
- `compare-screenshots` for foam/glint **behavior** vs a shore-grade target — NOT the
  deep-ocean reference (coastal is shallow).
- **Last check:** `screenshot-critique` — "shore reads tan→turquoise→blue with foam, water
  meets land cleanly, soldiers still stand on the ground?"

## Slice variable & crop
**Variable:** coastal shore-water look + shore-foam swash. **Crop:** the shoreline/shallows
band. **Out of scope:** open sea (S8), campaign (S10), beach/sand/props themselves.

## What must stay green
S8 open-sea; ground-mesh relief, mud/churn branch, prop/soldier seating,
`battle-terrain-features.mjs`, `battle-terrain-elevation.mjs`.

## Human review checkpoint (NON-BLOCKING)
`preview-shots` the shoreline crop; ~5 min; decide and record if silent.

## Feedback that would change this slice
"Soldiers float / sink" → seating regression; water displacement must not move the gameplay
height field. "Shore water too rough" → drop amplitude further; shore is calmer than open sea.
