# Slice 03B4C5B - card/cell distribution and primitive scale

## Contract

Make the texture-volume candidate stop reading as repeated debris, cards, or
stamps on a flat terrain sheet. This slice owns only **where texture-volume cards
are placed, how large each primitive reads, how cells layer, and how orientation
breaks repetition**.

Freeze:

- generated atlas content and colours;
- low-alpha texture shader coverage from 03B4C5A;
- field-cell density budget (`1900` reference cells, about `2064` texture records,
  and under `83200` submitted triangles);
- 03B3A meadow coverage, 03B4B2 root material, camera, terrain, fog, water, sky,
  crop windows, and reference target.

Do not change meadow colour, root strength, fog, camera, terrain, atlas strokes,
or broad palette in this slice.

## Approach

Hold the route and budget fixed, then test placement/scale only:

1. Break visible field-cell/card spacing by changing deterministic placement
   within each selected cell, not by changing how many field records exist.
2. Reduce the read of each texture card as a discrete object: smaller per-card
   footprint, less regular cell-centered placement, and more overlap only where
   it does not create a billboard wall.
3. Vary orientation and depth layering enough to hide repeated card silhouettes,
   while keeping bases seated on the terrain and tips biased upward.
4. Keep route telemetry explicit: source records, field cells, texture records,
   submitted triangles, atlas bytes, and active baseline.

## Verified Result - 2026-07-01

This slice is browser-verified and **visually rejected**. It is useful evidence,
not an accepted visual.

Implemented approach:

- `aggregateFieldCellAccentRecords(...)` now selects field cells through
  view-depth/lateral buckets instead of only slicing the highest-scored cells.
  The goal is to break the visible patch-island distribution without changing
  the 1900-cell budget.
- Field-cell yaw now mixes camera-facing yaw with source-record yaw so adjacent
  records do not share one repeated orientation.
- Cells with at least two source records can emit a second layer
  deterministically, still capped by the existing record budget.
- Texture records use larger off-center jitter plus adjusted footprint, width,
  height, and copy offset, so each primitive should read less like a discrete
  object.
- The texture card mesh keeps the 20-triangle texture-volume budget with more
  local yaw variation.

Checks completed:

- `./node_modules/.bin/tsc --noEmit`
- `node --experimental-strip-types --import ./web/tests/register-ts-extension-loader.mjs --test web/tests/grassModels.test.ts web/tests/grassField.test.ts`
- `git diff --check`
- `UPDATE_SHOTS=1 VERIFY_URL=http://127.0.0.1:5177 VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome node scene.mjs battle-map-reference-primitive-family`
- `compare-screenshots` target and field-shell crop artifacts under
  `assets/03b4-evidence/03b4c5-texture-backed-grass-volume/`
- unprimed `screenshot-critique` via subagent `Goodall`

Current route stats:

- `accentAggregation='field-cell'`
- `accentClumps=1900`
- `accentTufts=2064`
- `bladeInstances=8256`
- `meshTriangles=20`
- `submittedTriangles=41280`
- `textureBytes=65536`

Visual verdict:

- Against the target foreground crop, `edgeEnergyRatio=0.55962`,
  `parityDistance=0.46258`, and `avgLuminanceDelta=-22.2023`.
- Against the target midground crop, `edgeEnergyRatio=0.48684`,
  `parityDistance=0.64581`, and `avgLuminanceDelta=-45.87045`.
- Against the field-shell baseline, foreground edge energy is `1.85248x`, but
  midground edge energy is only `1.02238x`; the midground is effectively still
  the old smooth shell result.
- Direct inspection rejects the full shot and crop sheet: the added marks are
  separated clumps/flecks over a smooth painted meadow, not a continuous fuzzy
  lower-third grass mass.
- Neutral critique rejects it with high confidence: sparse clustering breaks
  continuity, individual primitives remain legible, density is uneven by patch,
  depth falloff is abrupt, ground-plane exposure dominates, rows/arcs are
  visible, integration is weak, and midground has almost no added vegetation read.

Do not continue to 03B4C5C from this result. This finding led to the later
carrier spikes (03B4C5B2/B3), which are now also rejected evidence rather than
the current pickup.

## Accept / Reject

Accept only if foreground/midground crops stop reading as individual stamps,
flecks, cards, flowers, debris, or a grid. The candidate should read as a
continuous grass body with small-scale fuzzy structure, even if colour and final
midground LOD still need later slices.

Reject if:

- the foreground metric rises but the visible structure is still repeated dots or
  card silhouettes;
- scale still reads as small objects scattered over terrain;
- the pass only works by changing atlas colour, meadow/root material, fog,
  camera, or terrain;
- submitted triangles exceed the old rejected all-card budget without a separate
  perf/LOD decision.

## Verification

- Capture `battle-map-reference-primitive-family`.
- Archive full shots, crop sheets, target/candidate crops, and
  `compare-screenshots` artifacts under
  `assets/03b4-evidence/03b4c5-texture-backed-grass-volume/`.
- Use `compare-screenshots` against the target foreground and midground crops and
  against the field-fiber-shell baseline. Judge card/cell distribution and scale
  only.
- Run an unprimed `screenshot-critique` scoped to stamps, flecks, scale, depth
  falloff, and ground-plane exposure before accepting.
- Keep `battle-map-reference-primitive-family`, `battle-map-reference`,
  `renderer-lab-routes`, `tsc --noEmit`, and the focused grass tests green.

## Next Slice

Continue with `03b4c5b2-continuous-coverage-carrier-spike.md`. Only move to
`03b4c5c-atlas-tile-content-and-color-integration.md` after a carrier/distribution
path no longer reads as isolated stamps, flecks, rows, or exposed ground.
