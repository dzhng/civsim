# Slice 03B — foreground grass density architecture

## Contract

Find and lock the architecture for the reference foreground meadow. The target is
not "more individual grass cards"; it is a dense, continuous meadow mass with
directional clumps and only near-field blade silhouettes resolving as geometry.

This slice is an architecture spike and handoff. It is **not visually accepted**
until the follow-on meadow and accent slices pass their own crop reviews.

## Current Learning

The reference achieves density as a field architecture, not as a uniformly
scattered set of readable tufts:

- a stable grass field supplies continuous coverage and coherent clump identity;
- broad meadow material uses that field to make the lower third read as mass;
- foreground geometry resolves as blades only where the camera is close enough;
- distance falloff and LOD hide individual grass units into tone.

Spike results from the current worktree:

- Card-only density can reach high coverage, but it reads as bright stipple and
  many separate marks. It is also the most expensive option.
- A meadow/carpet shader is the right owner for the filled grass mass and is much
  cheaper, but the first pass is too smooth and needs better clump/streak shaping.
- A hybrid meadow + limited card pass is the right direction, but the cards must
  be treated as foreground accents. Broadly distributing them across the crop
  recreates the stipple problem.
- A localized foreground oval is rejected: the density mask becomes visible.
- Wider clump-like tufts improve coverage per instance and reduce per-tuft
  triangles, but the current opaque blade mesh becomes too sharp/spiky. If that
  path continues, it needs softer colour/contrast, alpha/impostor treatment, or a
  separate near-accent mesh.
- A quick sprite/fiber-card prototype was rejected: it was cheap and added dark
  volume, but it produced rows of separate glyph-like clumps instead of the
  reference's continuous matted field.
- A terrain-only meadow shader can fill pixels and hit broad average colour, but
  without a real field/clump data owner it still reads as tinted procedural
  terrain.

## False-Earth / X-Post Findings

David pointed at the `momentchan/false-earth` repo and an X post about
GPU-native grass. They are the same family of approach, with different levels of
runtime ambition:

- The X-post approach is the smaller first spike: store terrain normals and blade
  params as packed instance attributes, filter steep slopes, and tilt bases in the
  vertex shader while tips blend toward skyward growth. This maps well onto
  civsim's existing CPU instance upload path.
- false-earth is the full GPU-native version: a snapped world grid, integer/PCG
  seeds, Voronoi clumps, packed 4-vec4 blade records, terrain sampling, visible
  LOD index buffers, and compute/indirect draw routing. It is the escalation path
  if the packed-attribute CPU field proves visually right but too expensive.
- Copy the architecture and data contracts, not the app stack: no Three.js/TSL,
  Leva, character push/waves, emissive/neon materials, or false-earth colours.
- Keep civsim's sacred contracts: `TerrainHeightField` owns height, battle grass
  draws as `world-opaque` in `world-depth` before soldiers/decals, and gameplay
  readability beats reference density at mid zoom.

## Approach Handoff

Use the 03B follow-on slices as an architecture ladder, not as a bag of knobs:

1. Build the stable field data first (`03B1`).
2. Prove the X-post packed-attribute slope/normal behavior second (`03B2`).
3. Let that field drive the broad meadow material (`03B3`).
4. Add only the foreground blade geometry still missing (`03B4`).
5. Gate readability and perf before adopting the result (`03B5`).
6. Escalate to GPU compute/indirect only if the accepted CPU/packed path is too
   expensive (`03B6`).

The rejected local attempts are still useful evidence: card-only density was
noisy and expensive, terrain-only meadow colour had no real clump owner, and
fiber/sprite rows read as separate glyphs. Future passes should use those failures
to avoid redoing broad count/colour tweaks before the field contract exists.

## Follow-On Slices

- `03b1-field-baseline-and-data-contract.md` owns the stable grass field records.
- `03b2-packed-attribute-slope-tilt.md` owns the X-post vertex/attribute spike.
- `03b3-field-driven-meadow-material.md` owns continuous meadow mass.
- `03b4-false-earth-blade-accents.md` owns near blade/clump geometry.
- `03b5-readability-and-perf-gate.md` owns gameplay and route adoption.
- `03b6-gpu-compute-and-indirect.md` is optional escalation, only after CPU/packed
  field visuals are accepted and perf says compute is worth the renderer cost.
- `03c-grass-color-texture.md` owns colour, sparkle, softness, and wind texture
  after the density architecture stops moving.

## Fixed Inputs

- Use the existing `battle-map-reference` reference-view capture and its
  lower-third grass crop.
- Keep camera, terrain relief, cliffs, water, sky, fog, and final composition
  fixed unless a capture bug prevents a fair grass-density comparison.
- Preserve sparse gameplay/top-down density outside the reference fixture.

## Accept / Reject

Do not accept this slice by card count. Accept only when the follow-on grass
slices produce evidence that:

- the lower third has continuous meadow coverage without broad bare gaps;
- midground grass mass falls off into tone, not stippled speckle;
- foreground geometry adds blade silhouettes without visible focus masks;
- slope filtering and terrain-normal tilt work from packed field data;
- the default reference route is cheaper than the rejected card-only approach.

Do **not** judge cliff shape, cliff texture, water, fog, sky, colour cast, or final
composition in this slice. Those remain separate slices unless they hide the grass
crop.

## Verification

- `battle-map-reference` writes the candidate, comparison, and grass crop
  artifacts.
- Use `compare-screenshots` on the lower-third grass crop only. Establish the
  target as meadow mass and density falloff, not whole-frame similarity.
- Run an unprimed screenshot critique / neutral visual review with a prompt scoped
  to grass density architecture only.
- `battle-grass`, `battle-terrain-3d`, `battle-terrain-elevation`, and
  `full-game-rendering-performance` stay green before the architecture is frozen.

## Next Slice

Implement `03b3-field-driven-meadow-material.md` next. Do not keep tuning
foreground card counts or meadow shader constants outside the field/clump
contract.
