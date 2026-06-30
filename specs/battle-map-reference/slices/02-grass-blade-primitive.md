# Slice 02 — grass-blade primitive

## Shipped 2026-06-30

This slice landed the pure tuft builder, flat-field GPU pass, model sheets, fixed
phase wind gate, and review GIF. Slice 03 now owns production terrain seating and
camera/distance density behavior.

## Contract unlocked

The basic 3D grass primitive, in isolation — the literal "build up from grass."
Split into a **pure, unit-testable mesh builder** and a thin flat-field workbench
pass, so the primitive's shape is reviewable before any terrain, instancing, or
seating logic exists.

## API seam

Two layers, smallest-first:

1. **Pure mesh primitive (the tiny library):**
   `buildGrassTuftMesh(opts: { blades; height; bend; width; seed; palette }): MeshData`
   in `packages/game-renderer/src/models/shared/grassModels.ts`, built via the
   existing `MeshBuilder`. **Deterministic (seed → mesh), no GPU, no DOM** — the
   same interleaved `MeshData` shape (`vertices` with position/normal/color/alpha
   plus `indices`) that `sceneryPropRegistry` meshes already use, so it can ride
   instanced render paths later. Tuft color is neutral olive/dry grass albedo, not
   a golden-hour-warmed pixel; the warm/cool mood is still owned by the later
   environment preset.
   *This is the seam the skill's "tiny library, tests at the seam" principle wants:
   pure in, pure out, no booted systems.*

2. **Flat-field workbench pass:** `BattleGrassPass` in
   `packages/game-renderer/src/battle/grassPass.ts` instances the tuft over a
   **flat** field (decoupled from terrain/sim). Inputs:
   `setField(field: TerrainHeightField, bounds, cover: BattleGroundCover, params: BattleGrassParams)`
   where `BattleGrassParams` includes density, max tuft cap, blade dimensions,
   bend/spread, seed, wind phase, and wind strength. Output: instanced blade
   geometry with vertex-shader wind sway and cap stats; `stats()` publishes
   `tuftInstances`, `bladeInstances`, `cappedTufts`, and
   `layer: 'battle-grass-instanced-blades'`. Role `world-opaque` (writes depth).
   Reuses `WORLD_CAMERA_WGSL` + `compileShader`.

## What the human can run / see

- The pure mesh on `renderer/shared-grass-models` via
  `web/scenes/models/shared-grass-models.mjs`: one tuft plus a small patch,
  committed under `web/shots/models/shared/grass/`.
- The flat-field lab route `renderer/battle-grass`, asserted in
  `web/scenes/system/renderer-lab-routes.mjs`, with the visual scene
  `web/scenes/battle/battle-grass.mjs` committed under `web/shots/battle/grass/`.

## Verification

- **Mesh-builder unit test (cheap, no GPU):** `buildGrassTuftMesh` is deterministic
  for a fixed seed, blade count maps to stable double-sided panel geometry, bounds
  are sane, and palette values stay valid.
- **Workbench gate:** `stats.bladeInstances > 0`, cap stats are bounded, the
  `world-opaque` depth phase is present, pixel metrics prove vertical blade
  structure + foreground fill, and snapshots cover `grass/flat-field` plus
  `grass/wind-phase`.
- **Wind motion (`write-anim`):** the blades are animated by vertex-shader sway, so
  `web/shots/models/scripts/grass-wind.mjs` writes the review-only looping GIF
  `web/shots/models/shared/grass/anim/flat-field.gif` from fixed shader phases.

## Screenshot-critique

**Required, last check before accept.** Run an unprimed `screenshot-critique` on the
tuft contact sheet and on `grass/flat-field`: does one tuft read as *grass* at
gameplay zoom — not a spike, fan, star, or blob — and does the patch read as a
field rather than scattered confetti?

## Must stay green

All existing battle scenes (grass is not yet wired into them); the existing prop /
model sheets; `cargo`.

## Human feedback that would reshape this slice

Blade count / height / bend / width; single quad-card vs. few-triangle blade;
whether the *tuft* or a *single blade* is the instanced unit.
