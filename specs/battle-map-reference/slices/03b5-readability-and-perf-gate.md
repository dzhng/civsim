# Slice 03B5 — readability and perf gate

## Contract

Prove the accepted grass architecture remains playable and affordable before it
becomes the default reference route.

## Approach

Add one route-level architecture switch if needed, such as
`legacy-cards | packed-field | cpu-field`, but keep it owned in one place. Publish
stats that make perf and readability auditable:

- prep mode and snap cell;
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
  budget or records a justified, bounded delta;
- no per-frame CPU rebuild/upload loop appears during ordinary camera movement.

Reject if grass hides gameplay cues, needs pass-order exceptions, or only works in
the isolated reference shot.

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

If CPU/packed-field grass is visually accepted but upload or frame cost blocks
adoption, implement `03b6-gpu-compute-and-indirect.md`. Otherwise move to
`03c-grass-color-texture.md`.
