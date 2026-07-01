# Slice 03B4C5B4C1 - camera-relative field domain

## Contract

Introduce a false-earth-style camera-relative grass domain using the backend
policy accepted in B4C0. This slice owns **where grass records come from as the
camera moves**.

Current state is only partly camera-aware: the renderer samples stable CPU field
records from terrain and selects/fades records by camera focus/depth. It does not
yet maintain snapped near/transition/mid/far cells or rings around the viewer with
explicit churn telemetry.

Out of scope: body representation, strand/clump tuning, backend policy, surface
tilt, atlas colour/content, fog, terrain polish, final reference compose, GPU
compute, and indirect draws.

Do not begin this slice as a rescue for a weak close-lab result. The input is the
accepted B4B1A0 lab, B4B1A1R body architecture, B4B1A2 perf envelope, B4B2-B4B5
close body/strand/clump/palette stack, and accepted B4C0 backend/perf policy; this slice
changes only the field domain around the camera. B4B1R remains rejected
camera/proxy evidence, not a prerequisite.

## API Seam

Add a named seam such as `buildCameraRelativeGrassField(...)` or the
repo-equivalent shape. It should publish:

- backend id selected by B4C0;
- snapped camera-cell origin and stable world-space cell/ring ids;
- near, transition, mid, and far band bounds;
- source terrain cells, accepted records, emitted records, recycled records, and
  churn counts;
- slope/water/tint rejects and terrain-normal availability;
- LOD bucket counts, instance bytes, and submitted primitive counts.

The generated domain must be camera-position procedural in world space: snapped
origins and stable cell/ring ids move only when the camera crosses a cell
boundary. Merely selecting or fading a fixed global record list by camera depth
does not satisfy this slice. GPU may be present only as the B4C0-selected backend
behind the same stats and record contract; it is not a separate visual route.

## Accept / Reject

Accept if adjacent camera positions preserve stable world-anchored grass without
visible swimming, popping, reseeding, or density discontinuity, stats prove the
snapped domain is doing the work, and the B4C0 perf telemetry remains within its
accepted policy.

Reject if grass is regenerated from screen noise, if sub-cell camera motion
reshuffles records, if churn is hidden with fog/camera tricks, if this slice
changes the accepted B4B close body/strand/clump look, or if it reopens the
CPU-vs-GPU decision without updating B4C0/03B6.

## Verification

- Add tests for deterministic hashes, snapped origin stability, band counts,
  slope/water rejects, and low churn under sub-cell camera movement.
- Add a debug scene/contact sheet with close, slightly shifted close, mid, and
  reference-ish camera stops plus band/cell overlay or stats table.
- Use `compare-screenshots` for adjacent-position stability, not target parity.
- Run unprimed `screenshot-critique` scoped to popping, swimming, density seams,
  and world anchoring.

## Next Slice

Continue with `03b4c5b4c2-terrain-normal-slope-eligibility.md`.
