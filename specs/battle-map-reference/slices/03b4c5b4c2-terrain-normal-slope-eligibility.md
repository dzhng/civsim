# Slice 03B4C5B4C2 - terrain normal and slope eligibility

## Contract

Prove the camera-relative field carries the terrain information needed for grass
placement. This slice owns **terrain-normal attributes and slope/water/tint
eligibility only**.

Out of scope: visual density, body/strand/clump retuning, atlas content, LOD
falloff, full reference compose, GPU compute, and indirect draw routing.

## Approach

- Freeze the B4C1 camera-relative domain and B4B accepted close look.
- Ensure emitted records carry terrain normals and slope masks in the packed
  instance data already used by the renderer family.
- Keep grass off cliffs, water, and blocked tints. Publish accepted/rejected
  counts per band.
- Use hostile rolling/slope/water fixtures where failure is obvious.

## Accept / Reject

Accept if stats and crops show no grass on cliffs/water/blocked tints, finite
packed normals on accepted records, and stable eligibility under camera movement.

Reject if this slice changes body art, density, colour, fog, terrain material, or
uses full-frame prettiness to hide bad eligibility.

## Verification

- Add or extend focused tests for normal packing, slope/water/tint rejection, and
  per-band accepted/rejected counts.
- Capture hostile slope/water lab crops and a stats overlay.
- Use `compare-screenshots` against previous B4C1 stability crops as regression,
  and against the hostile fixture for eligibility only.
- Run unprimed `screenshot-critique` scoped to grass on cliffs/water, missing
  ground seating, and eligibility seams.

## Next Slice

Continue with `03b4c5b4c3-surface-tilt-tip-blend.md`.
