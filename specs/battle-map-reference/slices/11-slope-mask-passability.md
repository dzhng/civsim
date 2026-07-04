# Slice 11 - slope mask and passability

## Contract

Make cliffs a terrain fact. Derive steep rock/cliff regions and impassible
movement cells from the same heightfield slope/normal data.

## Architecture

- Compute slope from the heightfield normal or gradient.
- Above the cliff threshold, mark cells as impassible (`speed=0`) and rock/cliff
  material.
- Use a transition band below the hard cliff threshold for scree/slow ground.
- Treat high plateau interiors behind edge-connected cliff seams as impassible
  highland caps, derived from heightfield elevation/connectivity rather than a
  separate painted gameplay mask.
- Smooth or clean the mask enough to avoid speckled isolated passable cells.
- Keep painted gameplay overrides possible, but slope-derived cliffs are the
  default source of truth for this map.

## Verification

- Publish slope histogram, cliff-cell ratio, slow/scree ratio, and passable
  valley-floor ratio.
- Add a top-down diagnostic showing passable, slow, and impassible regions.
- Add a route/stat check that the visual cliff mask and sim speed mask derive
  from the same slope data.
- Run a focused movement/pathing check proving units cannot cross cliff slopes
  but can move through the intended valley.
- Run screenshot-critique on the top-down mask for obvious speckle/island bugs.

## Accepted diagnostic checkpoint - 2026-07-04

Accepted for the slope/passability diagnostic only:

- `groundDiagnostic=passability-mask` colors directly from `grid.speed` and
  water tint, so the diagnostic cannot drift from the speed mask.
- `referenceHeightmap.passability` publishes slope thresholds, passable/slow/
  cliff ratios, valley-floor passability, and connectivity probes.
- The source is `heightfield-slope-cap`: cliff seams come from the heightfield
  slope, and edge-connected highland plateau interiors are capped from
  height/connectivity so large mountain masses are blocked without a separate
  marker-painted gameplay mask.
- The current green diagnostic scene is
  `VERIFY_GPU=1 VERIFY_URL=http://127.0.0.1:5177 bun run --cwd web scene battle-map-reference-passability-mask`.
- Current telemetry after the Slice 10 source-readability pass:
  `passableRatio=0.5524`, `slowScreeRatio=0.0407`,
  `cliffMaskRatio=0.3986`, `valleyFloorPassableRatio=0.9535`,
  `valleyCorridorReachable=true`, `westCliffBandIsolatesValley=true`, and
  `eastCliffBandIsolatesValley=true`.
- Fresh unprimed screenshot critique did not block acceptance as a diagnostic
  passability mask. It did flag jagged stair-step boundaries, ambiguous yellow
  slow/scree slivers, water-edge ambiguity, and dominant black highland slabs.
  Those are Slice 10/12 terrain-readability follow-ups, not reasons to reject
  this mechanical checkpoint.

## Accept / Reject

Accept if steep terrain is visibly and mechanically the same thing: cliffs read
as blocked terrain in the diagnostic and are not pathable.

Reject if cliffs remain hand-painted independently from relief, if visual rock
and movement blockage can drift, or if the slope mask creates noisy islands that
would confuse battle movement.

## Next

Return to Slice 10/12 clay readability with this mask open beside the clay
shots. Do not start cliff materials or grass from the passability mask alone.
