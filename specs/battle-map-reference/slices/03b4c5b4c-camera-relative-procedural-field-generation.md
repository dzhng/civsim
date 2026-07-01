# Slice 03B4C5B4C - camera-relative procedural field generation

## Status

Resliced on 2026-07-01. Updated by the third architecture critique to make the
backend decision explicit before implementation. This file is the parent memo for
the camera-relative and surface-response ladder:

1. `03b4c5b4c0-camera-relative-backend-spike.md` - prove the backend seam, perf
   gates, and policy: camera-position procedural is the domain; GPU-native is
   only an optional backend.
2. `03b4c5b4c1-camera-relative-field-domain.md` - CPU-first snapped cells/rings,
   stable origin, churn telemetry, and adjacent-camera stability.
3. `03b4c5b4c2-terrain-normal-slope-eligibility.md` - terrain normals plus
   slope/water/tint rejection in the emitted records.
4. `03b4c5b4c3-surface-tilt-tip-blend.md` - base seating on terrain and
   height-based tip recovery toward world-up.

Do not make GPU compute a separate visual technique. This repo already has CPU
field records, packed normals, and shader tilt; the missing piece is a
first-class camera-relative near/transition/mid/far domain and visual gates for
stability and surface response. B4C0 decides whether CPU remains the proof
backend or whether 03B6 must be pulled forward behind the same record/domain seam.

Do not start this parent ladder until B4B1A0-B4B1A2 and B4B2-B4B5 have accepted
the close lab, body architecture, perf envelope, coverage, strand scale, clump
rhythm, and close palette/atlas lock. B4B1R is rejected evidence, not a
prerequisite. Camera-relative generation is how the accepted grass follows the
viewer and scales with distance; it is not the place to invent the grass look.

## Contract

Add the false-earth-style camera-relative grass domain, CPU first unless B4C0
records a hard CPU/upload blocker. This slice owns **where grass records come
from as the camera moves**, not final grass art.

Current state is camera-aware, not fully false-earth-style camera-relative
procedural generation. Civsim has a snapped/focused CPU grass sampler and
camera-aware selection/fading from stable world-space records; it does not yet
have an explicit backend id, snapped camera origin, near/transition/mid/far
cells or rings, churn/recycle telemetry, terrain-normal eligibility telemetry,
and LOD buckets around the viewer. This slice introduces that first-class seam
while still seating on world terrain normals and rejecting cliffs/water.

## API Seam

Introduce a named seam such as:

```ts
buildCameraRelativeGrassField(camera, terrain, bands, seed)
```

or the repo-equivalent shape. It should publish:

- snapped camera-cell origin and ring/band ids;
- near, transition, mid, and far band bounds;
- source terrain cells, accepted records, emitted records, and churn/recycle
  counts;
- terrain-normal packing, slope/water rejects, and LOD bucket counts;
- instance bytes and submitted primitive counts.

Do not jump to GPU compute/indirect in this slice. B4C0 owns the backend policy;
03B6 owns GPU escalation only when B4C0 or 03B5 records CPU/upload cost as the
blocker. Either way, CPU and GPU must share this record/domain contract.

## Accept / Reject

Accept if adjacent camera positions preserve stable world-anchored grass without
visible swimming, popping, density discontinuity, or reseeding, and stats prove
slope/water rejection plus terrain-normal seating.

Reject if grass is regenerated from screen noise, ignores world terrain normals,
requires final fog/camera changes to hide churn, or starts changing close body
representation from B4B.

## Verification

- Add a debug scene/contact sheet with close, slightly shifted close, mid, and
  reference-ish camera stops.
- Include a band/cell overlay or stats table so snapped origins and LOD bands are
  inspectable.
- Add focused tests for determinism, band counts, slope/water rejection, and
  stable hashes under sub-cell camera movement.
- Use `compare-screenshots` for adjacent-position stability, not target parity.
- Run unprimed `screenshot-critique` scoped to popping, swimming, density seams,
  and terrain seating.

## Next Slice

Continue with `03b4c5b4c0-camera-relative-backend-spike.md`.
