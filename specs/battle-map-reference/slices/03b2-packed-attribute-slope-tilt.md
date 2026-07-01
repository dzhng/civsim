# Slice 03B2 — packed-attribute slope tilt spike

## Contract

Try the X-post approach before the full false-earth compute port: grass instances
carry packed terrain normals and blade params, and the vertex shader filters,
tilts, and blends blades so bases hug terrain while tips reach upward.

## Status

Landed as the `packed-field` path on `BattleGrassPass`, plus the renderer-lab route
`/renderer/battle-grass-field?mode=packed-tilt`, the `battle-grass-field` scene,
and the snapshot `web/shots/battle/grass/field-packed-tilt.png`. Resume at
`03b3-field-driven-meadow-material.md`; do not broaden the grass look inside this
slice.

The workbench is deliberately hostile rather than pretty: a rolling grass field
beside a steep synthetic ramp. It exists to prove that packed normals, slope
masks, and vertex-shader tilt work under obvious failure conditions. It is not a
reference-art candidate.

## Approach

This is the simpler sibling of false-earth's compute architecture. It keeps
runtime work in the vertex shader and uses civsim's existing CPU upload path for
the first proof:

- pack terrain normal, slope mask, height, width, bend, yaw, clump seed, and
  blade seed into as few instance attributes as possible;
- filter or collapse grass on steep slopes/cliffs in the shader, with stats
  proving the same decision in CPU tests;
- align bases to the terrain normal while blending tips back toward world-up;
- keep attributes within WebGPU vertex-buffer/attribute limits;
- expose a renderer-lab route, for example
  `/renderer/battle-grass-field?mode=packed-tilt`.

Current implementation shape:

- `BattleGrassPass.setGrassFieldSnapshot(...)` consumes the 03B1
  `GrassFieldSnapshot` records instead of resampling terrain.
- Each instance is packed as four `vec4` attributes: pose/terrain blend,
  blade params, orientation/seeds/shade, and terrain normal/slope mask.
- Legacy flat and terrain scatter still use the same packed stride with neutral
  normals and a live slope mask, so the shader has one instance format.
- The vertex shader seats bases on the terrain tangent plane, blends growth from
  terrain normal toward world-up at tips, and collapses steep rejected records
  through `normal.w`.
- The route publishes prep mode, field records, slope rejects, packed stride,
  field-record stride, instance bytes, submitted triangles, and draw calls. These
  stats are part of the acceptance surface because they prevent a later pass from
  silently reverting to brute-force card density.

Neutral critique result: no clear discrete blade geometry appears on the steep
ramp, so the slope-filter contract is doing its job. Do not overread the shot:
the ramp ground has row-like vertical striping and a hard straight seam, some
clumps look weakly seated, and some blades lean too diagonally. Those are
evidence for 03B3 meadow material and 03B4 blade silhouettes, not permission to
tune color, terrain art, or final density in this slice.

## Fixed Inputs

- Use the Slice 03B1 field records.
- Keep color, wind polish, meadow material, cliffs, sky, fog, and water fixed.
- Do not use compute, indirect draw, or Three.js/TSL in this slice.

## Accept / Reject

Judge geometry behavior only:

- blades sit on rolling terrain and visually follow normals at the base;
- tips remain readable and do not lie flat on slopes;
- cliff/steep-slope filtering leaves no obvious grass rows on vertical faces;
- route stats publish record count, rejected slope count, packed stride, instance
  bytes, submitted triangles, and draw calls.

Reject if density improves only by raising instance count, if normals come from a
private height path, or if the pass needs a frame-graph/depth exception.

## Verification

- `battle-grass-field` slope/tilt screenshot and stats.
- `compare-screenshots` against the prior grass-field crop for slope filtering and
  base seating only.
- `screenshot-critique` scoped to slope tilt and cliff filtering only.
- The critique prompt must explicitly say that meadow mass, final color, ramp
  fixture prettiness, cliffs, water, sky, and fog are out of scope.
- `battle-terrain-3d`, `battle-terrain-elevation`, and
  `full-game-rendering-performance` stay green.

## Next Slice

After slope tilt is proven, implement
`03b3-field-driven-meadow-material.md`.
