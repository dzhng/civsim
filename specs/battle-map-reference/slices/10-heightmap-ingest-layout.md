# Slice 10 - heightmap ingest and layout

## Contract

Create the first clean terrain substrate for the reset spec: one macro
heightmap-derived terrain source, visible in top-down clay and hilltop
perspective clay views. This slice proves layout and terrain data ownership, not
grass, cliff material, fog, or final composition.

## Inputs

- Style reference: `../assets/target-battle-map.png`
- Loose top-down layout guide:
  `../assets/style-references/topdown-heightmap-layout.png`

The layout guide is not a mask to trace. It supplies topology: a central valley,
a small camera hill, flanking mountain masses, braided drainage, and an optional
east/northeast lake basin.

## Architecture

- Add a heightmap terrain source that can feed `TerrainHeightField`.
- Publish stats for source dimensions, world bounds, cell size, height span,
  camera-hill anchor, slope histogram, and optional lake-mask ratio.
- Keep the existing analytic `referenceHighlandGrid` path only as legacy
  fallback until this slice is accepted; do not tune it to pass this slice.
- Use clay/neutral rendering with grass off.

## Review Surface

- Top-down clay view: confirms the heightmap macro layout.
- Hilltop north-facing perspective clay view: confirms the camera sees valley
  foreground, midground recession, and background cliff/mountain masses.

## Verification

- Add a browser scene for the heightmap layout route.
- Assert the route publishes the heightmap stats listed above.
- Assert the playable/camera hill exists and is not below the valley floor.
- Run screenshot-critique on both clay shots before accepting.
- Use compare-screenshots only as a less-wrong comparison against the top-down
  layout guide; do not require pixel alignment.

## Accepted checkpoint - 2026-07-04

Accepted as the macro terrain source checkpoint:

- Source: `packages/game-renderer/src/battle/referenceHighlandHeightmap.ts`
  defines one continuous analytic macro field `H(u,v)` sampled 1:1 into
  `BattleTerrainGrid`. This intentionally replaces the compact 25x47 control
  lattice; PNG ingestion remains a possible future authoring upgrade, but is no
  longer required for this slice.
- Route: `/renderer/battle-terrain-3d?gate=highland-valley&terrainSource=heightmap-layout`
  activates the source explicitly. Default `highland-valley` still uses the
  legacy analytic fixture.
- Review views:
  `view=layout-topdown` and `view=layout-perspective`.
- Review diagnostic:
  `groundDiagnostic=layout-clay`, a clay-only terrain layout mode that keeps
  lake/drainage readable and avoids the older contour-heavy `landform-clay`
  debug look.
- Scene:
  `web/scenes/battle/battle-map-reference-heightmap-layout.mjs`.
- Baselines:
  `web/shots/battle/map-reference/heightmap-layout-topdown.png` and
  `web/shots/battle/map-reference/heightmap-layout-perspective.png`.
- Evidence crops:
  `../assets/slice-10-continuous-heightfield/`.
- Green command:
  `VERIFY_GPU=1 VERIFY_URL=http://127.0.0.1:5177 bun run --cwd web scene battle-map-reference-heightmap-layout`.

The current pass closes the source-cell blocker. Fresh review found the former
enlarged-source-cell defects are gone: no axis-aligned slab stepping, no
rectangular hill blob, and no source-stepped shoreline in the clay shots.

Accepted changes:

- The source footprint is taller/more square, so the hilltop perspective no
  longer shows the near/southern source edge in the foreground or the
  far/northern source edge at the horizon.
- `layout-clay` makes the east lake and drainage more legible than
  `landform-clay`.
- Legacy `BattleHorizonPass` edge blockers remain disabled for `layout-*`
  views, so the clay review surface no longer relies on a separate low-poly
  cliff/ocean wall.
- The passability diagnostic now proves the route is using the same visual
  vertical scale for slope-derived speed masks as the clay review terrain.
- Slice 11's passability gate now isolates the valley from west/east highland
  bands mechanically while preserving valley-floor movement.
- The camera hill anchor moved toward the valley center and the hilltop
  perspective no longer begins beside the old west slab.
- The top-down review frame is widened (`zoom=0.34`) so the shot judges macro
  layout instead of a cropped central strip.
- The height source now uses smooth interpolation, terrain-owned highland ridge
  relief, and incised drainage geometry, and `layout-clay` now reads that relief
  with stronger hillshade.
- The compact control lattice was replaced with a continuous field. The gate now
  publishes `sourceKind="continuous-field"`, `sourceRows=620`,
  `sourceColumns=360`, `gridRows=620`, `gridColumns=360`, and
  `outputCellsPerSourceCell=null`.
- The Slice 11 path probes remain green: `passableRatio=0.4936`,
  `slowScreeRatio=0.0189`, `cliffMaskRatio=0.4972`,
  `valleyFloorPassableRatio=0.9717`, `lakeMaskRatio=0.0091`, and all path checks
  true.

Deferred debt:

- Some highland ridge relief still reads patterned in top-down clay. Treat this
  as cliff-material/relief craft debt for Slice 13, not a source ownership
  blocker.
- The camera hill is numerically and visually present, but it should read more
  clearly once Slice 12 frames the vista camera.
- The passability mask remains cell-classified and therefore has jagged edges
  and thin yellow scree slivers. That is acceptable for the diagnostic, but
  final material/readability work should soften the presentation without
  changing the slope-derived legality owner.

## Accept / Reject

Accept if the clay shots show the intended topological family from one terrain
source: central valley, camera hill, visible flanking ridge/cliff masses, and no
separate apron/card/sheet artifacts.

Rejected paths: returning to the 25x47 marker lattice, covering only the playable
flat floor while cliffs are decorative, reporting a discrete source-cell ratio
for a continuous field, accepting visible axis-aligned source-cell stepping, or
depending on material/fog/grass to hide terrain ownership problems.

## Next

Continue with Slice 12: place this accepted heightfield under the battle
reference camera in clay, prove the foreground/midground/background read, and
only then move to cliff materials or grass.
