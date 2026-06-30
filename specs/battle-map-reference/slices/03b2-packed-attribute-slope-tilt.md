# Slice 03B2 — packed-attribute slope tilt spike

## Contract

Try the X-post approach before the full false-earth compute port: grass instances
carry packed terrain normals and blade params, and the vertex shader filters,
tilts, and blends blades so bases hug terrain while tips reach upward.

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
- `battle-terrain-3d`, `battle-terrain-elevation`, and
  `full-game-rendering-performance` stay green.

## Next Slice

After slope tilt is proven, implement
`03b3-field-driven-meadow-material.md`.
