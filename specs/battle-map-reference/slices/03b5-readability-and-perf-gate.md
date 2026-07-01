# Slice 03B5 — readability and perf gate

## Contract

Prove the accepted grass architecture remains playable and affordable before it
becomes the default reference route. This is the adoption gate, not a new visual
technique pass.

## Approach

Add one route-level architecture switch if needed, such as
`legacy-cards | packed-field | cpu-camera-field | gpu-camera-field`, but keep it
owned in one place and consistent with B4C0. Publish stats that make perf and
readability auditable:

- prep mode and snap cell;
- backend id and B4C0 policy decision;
- field records and visible blades;
- LOD counts and submitted triangles;
- instance/storage bytes;
- draw calls and CPU upload cost;
- mask/slope rejects.

## Fixed Inputs

- Freeze meadow mass and foreground accent visuals.
- Do not change color, wind, cliffs, water, sky, fog, UI, or sim behavior.

## Accept / Reject

Accept only if:

- selected units, team colors, shadows, and gold selection cues remain readable at
  playable mid zoom;
- the reference vista is denser/less wrong than the previous hybrid shot;
- same-hardware perf is within the existing `full-game-rendering-performance`
  budget/current-renderer comparison language, or records a justified, bounded
  delta: median/p95 frame time, upload/draw time, startup, and heap must stay
  within the existing measurement floors/ratios unless the spec explicitly
  accepts the tradeoff;
- no per-frame CPU rebuild/upload loop appears during ordinary camera movement.

Reject if grass hides gameplay cues, needs pass-order exceptions, only works in
the isolated reference shot, or chooses GPU because it changes the look rather
than because B4C0/this slice shows CPU/upload cost is the blocker.

## Verification

- `battle-map-reference`
- `battle-grass`
- `battle-terrain-3d`
- `battle-renderer-visual`
- `battle-input`
- `full-game-rendering-performance`
- `compare-screenshots` for grass crops only.
- `screenshot-critique` scoped to gameplay readability and grass density.

## Next Slice

If B4C0 already marked GPU required, this slice verifies the adopted GPU backend.
If CPU/packed-field grass is visually accepted but upload or frame cost blocks
adoption here, implement `03b6-gpu-compute-and-indirect.md`. Otherwise move to
`03c-grass-color-texture.md`.
