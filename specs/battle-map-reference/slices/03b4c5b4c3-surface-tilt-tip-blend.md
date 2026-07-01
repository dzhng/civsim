# Slice 03B4C5B4C3 - surface tilt and tip blend

## Contract

Make accepted grass primitives follow local terrain at their bases while their
tips recover upward into readable grass. This slice owns **surface tilt and
height/tip blend only**.

Out of scope: eligibility, camera-relative domain, body coverage, strand scale,
clump rhythm, colour, atlas content, LOD falloff, fog, water, cliffs, sky, and
GPU compute.

## Approach

- Freeze B4C1/B4C2 domain and eligibility plus the B4B accepted close visual.
- Use packed terrain normals in the vertex shader. Bases should hug the tangent
  plane; tips should blend from terrain normal toward world-up with height.
- Tune only base seating, tilt strength, slope collapse response, and tip blend.

## Accept / Reject

Accept if slope/ramp crops show grass seated on terrain, no floating or sliding
bases, no flattened grass painted onto slopes, and no tip collapse that kills the
close grass read.

Reject if the result depends on changing density, atlas colour, fog, camera,
terrain material, or body representation.

## Verification

- Archive slope/ramp close crops, normal/debug overlays if useful, and stats JSON.
- Use `compare-screenshots` against B4C2 crops as regression and hostile slope
  crops as the primary gate.
- Run unprimed `screenshot-critique` scoped to base seating, floating/clipping,
  terrain tilt, and tip-upright recovery.

## Next Slice

Continue with `03b4c5b4d1-lod-band-contract.md`.
