# Slice 03B1 — grass field baseline and data contract

## Contract

Lock the grass field as data before changing the look again. The next grass
architecture must produce stable, inspectable per-blade or per-cell records that
can feed either the simpler X-post packed-attribute path or the fuller
false-earth compute path.

## Status

Landed in `packages/game-renderer/src/battle/grassField.ts`, with shared terrain
normal sampling in `packages/game-renderer/src/terrain/heightField.ts` and focused
coverage in `web/tests/grassField.test.ts`. The field is not wired into rendering
yet; Slice 03B2 owns the first visual/attribute consumer.

## Approach

Start with a CPU-built field contract because civsim already has CPU terrain
sampling and instance upload seams. Do **not** jump straight to compute. The
contract should mirror the useful false-earth data shape without copying Three.js
or TSL:

- stable snapped world-grid coordinates and integer/PCG-style seeds;
- terrain height and normal sampled from civsim's `TerrainHeightField`;
- slope/tint filtering so cliffs, water, wall, rock, and mud do not grow grass;
- packed blade/clump fields: position/type, width/height/bend/wind, yaw/clump
  seed/blade seed, normal/push-reserved;
- LOD tier and budget counters, even if later slices are the first to render them.

This slice should add a pure module such as
`packages/game-renderer/src/battle/grassField.ts` plus tests. It should not tune
WGSL colour, fog, cliffs, sky, water, or the final reference composition.

## Fixed Inputs

- Use the current `highland-valley` fixture and battle `TerrainHeightField`.
- Preserve the existing `BattleGrassPass` default behavior until a later slice
  switches a route onto the new field.
- Keep all current screenshot baselines as comparison evidence, not as acceptance
  proof.

## Accept / Reject

Accept when tests prove:

- the same seed/focus/grid produces byte-stable records;
- small camera/focus movements inside one snap cell do not reshuffle the whole
  field;
- blocked tints and steep slopes reject grass;
- every accepted blade/cell has finite height, normal, clump seed, blade seed,
  and LOD tier;
- record capacity and budget counters are explicit.

Reject if the contract depends on current screen pixels, private height math, or
route-specific query flags.

## Verification

- Add focused tests, for example
  `node --experimental-strip-types --import ./web/tests/register-ts-extension-loader.mjs --test web/tests/grassField.test.ts`.
- `./node_modules/.bin/tsc --noEmit`
- No screenshot acceptance yet. If a debug visualization is added, run
  `screenshot-critique` only as a non-blocking sanity check.

## Next Slice

After the field records are stable, implement
`03b2-packed-attribute-slope-tilt.md`.
