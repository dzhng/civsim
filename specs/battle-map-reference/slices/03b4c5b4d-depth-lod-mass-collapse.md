# Slice 03B4C5B4D - depth LOD mass collapse

## Status

Resliced on 2026-07-01. Do **not** implement this as one broad near/mid grass
tuning pass. It is now the parent memo for the LOD ladder:

1. `03b4c5b4d1-lod-band-contract.md` - define near/transition/mid/far ownership
   bands and telemetry.
2. `03b4c5b4d2-near-to-transition-collapse.md` - fade readable strands into
   clumped soft body.
3. `03b4c5b4d3-mid-mass-continuity.md` - make midground meadow mass continuous
   without readable primitives.
4. `03b4c5b4d4-depth-falloff-sequence.md` - verify the three crops read as one
   continuous depth sequence.

## Contract

Compose the accepted close grass through camera-relative LOD bands so visual
detail changes with depth like the reference:

- near: visible soft body, clumps, and some strand direction;
- transition: clumped soft body with less individual strand read;
- mid/far: meadow mass only, with no readable individual cards/strands.

This slice owns **near-to-mid grass LOD/falloff** only.

## Approach

- Freeze the accepted close body representation from B4B and the camera-relative
  domain from B4C.
- Tune only LOD band bounds, per-band record/coverage budgets, fade behaviour,
  and representation choice per band.
- Keep foreground acceptance as a regression guard while judging transition and
  mid-mass separately.

## Accept / Reject

Accept if the close crop remains readable as grass body and the midground crop
reads as continuous vegetated mass without individual flecks, stamps, rows, card
walls, or screen-door grit.

Reject if midground density appears only by changing fog, camera, meadow/root
material, terrain colour, sky, or broad atlas palette, or if the near foreground
regresses to B3 speckle/grit.

## Verification

- Capture close hero, transition, and mid-mass crops separately.
- Use `compare-screenshots` with near foreground as a regression guard and
  transition/mid-mass as the primary LOD gates.
- Run unprimed `screenshot-critique` scoped to LOD collapse, midground continuity,
  primitive artifacts, and scan readability.
- Keep focused scenes and `renderer-lab-routes` green.

## Next Slice

Continue with `03b4c5b4d1-lod-band-contract.md`.
