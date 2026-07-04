# Slice 12 - vista clay camera

## Contract

Use the heightmap terrain source in the battle reference route from the marked
camera hill. This slice judges macro silhouette and depth in clay only.

## Status

Accepted 2026-07-04 as a broad clay terrain checkpoint.

## Scope

- No foreground grass acceptance.
- No cliff texture acceptance.
- No fog, sky, water material, or color mood acceptance.
- No pixel parity with the perspective reference.

## Review Surface

- Hilltop perspective clay shot with grass off.
- Crops for foreground hill, midground valley, and background cliff/mountain
  masses.

## Verification

- [x] The route reports `terrainSource=heightmap-layout` or equivalent.
- [x] Geometry-truth probes report real midground/background crest structure rather
  than zero visible crests.
- [x] Existing terrain elevation/seating gates still pass.
- [x] Run screenshot-critique scoped to clay landform silhouette and depth only.
- [x] Use compare-screenshots against the previous clay terrain only for a
  less-wrong verdict; do not compare grass, fog, or color.

## Evidence

- Route:
  `/renderer/battle-terrain-3d?gate=highland-valley&terrainSource=heightmap-layout&view=heightmap-vista&grassTechnique=off&groundDiagnostic=layout-clay&geometryProbe=midground-valley`
- Scene gate:
  `VERIFY_GPU=1 VERIFY_URL=http://127.0.0.1:5177 bun run --cwd web scene battle-map-reference-vista-clay-camera`
- Supporting gates:
  `battle-map-reference-heightmap-layout` and
  `battle-map-reference-passability-mask`
- Artifacts:
  `assets/slice-12-vista-clay-camera/vista-clay-camera.png`,
  `assets/slice-12-vista-clay-camera/vista-clay-camera-crops.png`, and
  `assets/slice-12-vista-clay-camera/route-stats.json`
- Current route telemetry: `meanRelief=13.649`, `maxRelief=23.087`,
  `maxVisibleCrests=1`, `passableRatio=0.4885`,
  `slowScreeRatio=0.0248`, `cliffMaskRatio=0.5024`,
  `valleyFloorPassableRatio=0.9715`, and all path checks true.

## Findings

- Opus review correctly diagnosed the initial blocker as terrain design: the
  camera/probe was seeing a monotone smooth floor because the previous relief
  was broad low humps over a northward ramp.
- The accepted pass adds broken transverse valley relief in
  `referenceHighlandHeightmap.ts`; the route keeps grass, scenery, and final
  materials disabled.
- `layout-clay` now keeps water cells in the neutral clay diagnostic so the
  clay checkpoint does not mistake water material color for landform quality.
- Fresh screenshot critique judged the image acceptable as a broad clay vista
  checkpoint, but not final art. Remaining debts: smooth foreground, blurred
  terrain edges, flattened shelf perspective, ambiguous top-right drainage/water
  seam, muddy central ravines, and smeared left cliff silhouette.
- The previous clay terrain was a different camera/viewport, so pixel metrics
  would be misleading. Qualitatively, the accepted shot is less wrong because
  the cliffs and valley bands are terrain-owned rather than backdrop slabs.

## Accept / Reject

Accept if the clay perspective shows a plausible valley view with foreground
hill, midground recession, and terrain-owned background cliff masses.

Reject if the camera still sees a flat meadow with decorative background, if
terrain rows do not overlap in depth, or if acceptance requires grass/fog to hide
the shape.

## Next

Run `12b-horizon-band-camera.md`.
