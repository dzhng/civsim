# Slice 5 — Blocker unification (golden)

Collapse the horizon pass's two hardcoded greys into the shared horizon, so distant
cliffs, walls, and mountains recede into the *same* haze as sky, sea, and land — one
horizon across every far surface.

## Contract unlocked
The sealed-edge blockers (`horizonPass.ts`) fade into `env.hazeColor` through the shared
`battleAerial` helper instead of their local `HAZE`/fragment-push literals. There is now one
horizon colour across sky, sea, land, and blockers.

## API seam (module / functions / data / ownership) — owner: game-renderer/battle
- **`battle/horizonPass.ts`:** replace the fragment `mix(col, [0.74,0.79,0.84], 0.10)` with
  `col = battleAerial(col, in.world)`. The geometry-stage per-row `fog` mixing that seals the
  layered-range **silhouette** is kept (it builds the depth rows), but its colour is driven
  from `BATTLE_HAZE` (= `env.hazeColor`) instead of the literal `HAZE=[0.80,0.81,0.83]`, so
  the ranges fade into the same sky.
- Keep the blockers' current sun for golden (its relight from the env sun is S6, where
  overcast needs it) — this slice's only variable is the blocker **haze colour/strength**.

## What the human can run / see
`/renderer/battle-terrain-3d?gate=river-and-crags&view=west` (cliffs) and `&gate=walled-plain`
(wall); `node web/scene.mjs battle-terrain-blockers`.

## Verification gates
- Re-bless `battle-terrain-blockers/*` (the cliff/wall/mountain edges) — **change-ledger**.
- Single-horizon telemetry: the far-peak colour ≈ the sky horizon ≈ the sea horizon (one
  value across surfaces).
- **`compare-screenshots`** vs [`../assets/battle-coastal-vista.jpg`](../assets/battle-coastal-vista.jpg)
  on the **far ridge/rampart band** (hazy headland receding).
- **Last check (required): `screenshot-critique`** on that crop: "do the distant blockers
  read on the same haze as the sky/sea, or as a different grey?"
- The `battle-terrain-blockers` structural checks (`blocker` coverage, sealed edges present,
  `view` routing) stay green; six `water-*.mjs` byte-identical; `battle-terrain-3d` field view
  unchanged except where blockers show.

## Slice variable & crop
**Variable:** the distant-blocker haze hue/strength matching the sky+sea+land horizon.
**Crop:** the west/east ridge/rampart silhouette band. **Frozen inputs:** ridge **shape** and
rock/wall texture (owned by the existing geometry), sky/sea/land from S2–S4.

**Out of scope:** blocker geometry/silhouette; the blocker sun (S6).

## What must stay green
`battle-terrain-blockers` structural checks; six `water-*.mjs`; the S2–S4 horizons.

## Feedback that would change this slice
"Blockers a different grey than the sky" → they aren't reading `env.hazeColor`; a literal
survived. "Ranges show sky between peaks" → you weakened the silhouette-sealing `fog`; keep
its strength, only recolour it. "Near blocker base looks hazed" → the distance key hazes too
close; match the land ramp.
