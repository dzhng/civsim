# Slice 03B4C5B4B4 - clump softness and height variation

## Contract

Add the close foreground clump envelope and height rhythm after body coverage and
strand scale are accepted. This slice owns **clump softness and height variation
only**.

Out of scope: body coverage amount, strand scale, colour, atlas content,
camera-relative generation, slope response, LOD, fog, cliffs, water, sky, and
full-reference compose.

## Approach

- Freeze B4B2/B4B3 body and strand results.
- Tune only clump phase, local height variation, soft group boundaries,
  fixed-palette root/clump placement, and per-clump bend/yaw rhythm.
- Preserve the accepted close crop's ground exposure and strand scale.

## Accept / Reject

Accept if the close crop has soft, irregular grass clumps and height variation
like the target foreground, without visible rows, repeated tile silhouettes,
flower-like dots, hard root stains, or lumpy decals.

Reject if clump softness is achieved by changing fog, terrain material, broad
palette, camera, atlas colour, or LOD.

## Verification

- Archive close-hero crop, tight crop sheet, clump/height debug overlay if useful,
  and stats JSON.
- Use `compare-screenshots` on close crops against the target and B4B3 regression
  crop. Judge clump envelope and height rhythm only.
- Run unprimed `screenshot-critique` scoped to clump softness, height variation,
  repeated patterns, and row/decal artifacts.

## Next Slice

Continue with `03b4c5b4b5-close-palette-and-atlas-lock.md`.
