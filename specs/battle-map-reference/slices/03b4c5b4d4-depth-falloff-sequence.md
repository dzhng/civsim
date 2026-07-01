# Slice 03B4C5B4D4 - depth falloff sequence

## Contract

Verify the accepted near, transition, and mid/far grass reads as one continuous
depth sequence. This slice owns **sequence coherence only**.

Out of scope: new body art, new camera-relative generation, atlas content,
colour, terrain relief, fog, water, cliffs, sky, final whole-frame parity, and
performance backend changes.

## Approach

- Freeze B4D2 and B4D3 results.
- Tune only cross-band fade timing and small per-band continuity constants.
- Judge close, transition, and mid-mass crops as a sequence. Close is regression,
  transition and mid-mass remain the primary sequence checks.

## Accept / Reject

Accept if the viewer can scan from close foreground into the midground without a
hard density shelf, sudden primitive change, exposed-ground gap, or detail that
stays readable too far into depth.

Reject if coherence requires fog, terrain, camera, atlas colour, or full-scene
composition changes.

## Verification

- Archive a three-crop sequence board, full lab context shot, stats JSON, and
  before/after regression crops.
- Use `compare-screenshots` across the three crop masks and record which crop is
  the primary failure if the sequence is rejected. Judge structure/edge/mask
  continuity and primitive readability; colour and luminance are frozen inputs.
- Run unprimed `screenshot-critique` scoped to depth continuity, hard bands,
  density shelves, and primitive readability across depth.
- Open the sequence board with `preview-shots` as a non-blocking checkpoint.

## Next Slice

Continue with `03b4c5b4e-grass-only-reference-crop-compose.md`.
