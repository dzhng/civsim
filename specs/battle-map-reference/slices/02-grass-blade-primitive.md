# Slice 02 — grass-blade primitive

## Contract unlocked

The basic 3D grass primitive, in isolation — the literal "build up from grass."
Split into a **pure, unit-testable mesh builder** and a thin flat-field workbench
pass, so the primitive's shape is reviewable before any terrain, instancing, or
seating logic exists.

## API seam

Two layers, smallest-first:

1. **Pure mesh primitive (the tiny library):**
   `buildGrassTuft(opts: { blades; height; bend; width; seed }): MeshData` in a new
   `packages/game-renderer/src/models/shared/grassModels.ts`, built via the existing
   `MeshBuilder`. **Deterministic (seed → mesh), no GPU, no DOM** — the same
   `MeshData` shape (`positions`/`normals`/`colors`/`indices`) that
   `sceneryPropRegistry` meshes already use, so it can ride the instanced scenery
   pipeline later. Tuft color is the Aegean warm-olive locked in Slice 00 — an
   **albedo under neutral light**, not a golden-hour-warmed pixel; don't bake amber
   into the base color (the warm/cool mood is the Slice 06 environment lighting
   preset, applied at render time over this neutral albedo).
   *This is the seam the skill's "tiny library, tests at the seam" principle wants:
   pure in, pure out, no booted systems.*

2. **Flat-field workbench pass:** a new `BattleGrassPass` in
   `packages/game-renderer/src/battle/grassPass.ts` that instances the tuft over a
   **flat** field (decoupled from terrain/sim). Inputs:
   `setField(field: TerrainHeightField, bounds, cover: BattleGroundCover, params: GrassParams)`
   where `GrassParams = { density, bladeHeight, windAmp, windFreq, lodFalloff, seed }`.
   Output: instanced blade geometry, vertex-shader wind sway, distance density
   falloff; `stats(): { bladeInstances, layer: 'battle-grass' }`. Role
   `world-opaque` (writes depth). Reuses `WORLD_CAMERA_WGSL` + `compileShader`.

## What the human can run / see

- The pure mesh on the `shared-prop-models` / model-sheet route (one tuft + a small
  hand-placed patch) via the `write-model-sheet` contact sheet.
- A new lab route `renderer/battle-grass` over a flat field, registered in
  `web/src/battle/scene.ts` and asserted in `web/scenes/system/renderer-lab-routes.mjs`,
  with a new scene `web/scenes/battle/battle-grass.mjs`.

## Verification

- **Mesh-builder unit test (cheap, no GPU):** `buildGrassTuft` is deterministic for
  a fixed seed, blade count matches `opts.blades`, bounds/tri-count are sane.
- **Workbench gate:** `stats.bladeInstances > 0`, `layer` correct; a pixel metric
  (extend `groundMetrics`) proving vertical blade structure + foreground fill; a
  GPU-instance / perf probe to set the cap (resolves grilling Q3/Q6); snapshot
  `grass/flat-field`; render-graph stays `ok`.
- **Wind motion (`write-anim`):** the blades are animated (vertex-shader sway), so
  the cycle must be *reviewed as motion*, not just a still. Loop the tuft/patch
  through its sway cycle as a review-only GIF and eyeball the rhythm: blades bend and
  return like wind, no jitter/shear/popping, no all-in-lockstep uniform phase. This
  repo's `write-anim` is the home for single-asset motion like scenery sway.

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
