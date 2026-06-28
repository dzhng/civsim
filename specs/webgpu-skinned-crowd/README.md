# WebGPU Campaign Playability

## Goal

Finish the WebGPU campaign map until it is playable, geographically accurate,
and visually equal or better than the previous campaign renderer. The current
release blocker is not the battle crowd foundation; it is the campaign 3D map:
`campaign-3d.png` still lacks enough terrain readability, land richness,
mountains, trees, forests, road continuity, fog behavior, and signs of life.

This spec keeps the existing `specs/webgpu-skinned-crowd/visualizations/` path
because current scenes and reports read and write there. The closed renderer
foundation rationale is archived at
[../done/webgpu-skinned-crowd-foundation/README.md](../done/webgpu-skinned-crowd-foundation/README.md).

## Current State

The WebGPU foundation is real: production routes run raw WebGPU, campaign and
battle share render-graph/depth contracts, model and soldier gates exist, and
WebGPU report scripts are wired. That is not enough for release.

The live campaign gaps are:

- `campaign-3d.png` does not yet read like Roman Italy: green terrain is weak or
  absent, mountain ranges are missing or too sparse, forests/trees are missing,
  and faction/terrain colors are too flat.
- Roads can be cut off, submerged, or visually broken. Roads must be continuous
  raised or ground-conforming world geometry with visible junction treatment,
  not terrain-underpaint that disappears.
- The land/water/faction/city/road projection must remain aligned while the
  camera pans, zooms, and changes LoD. Cities and roads are ground truth; water
  and terrain must match them.
- Every LoD threshold that changes visible campaign content needs its own scene,
  including close Rome, central Italy, whole Italy, and whole map views.
- Fog must hide city/army flags, labels, and markers when the territory is not
  visible, while preserving the attractive border-fog effect at zoomed-out
  levels.
- City/army colocation needs a single readable stacked label: army name and
  size on top, city name below, with no label collision.
- Campaign close-up composition still needs flag height/direction, label
  margins, selection rings, shadows, tree/city clearance, and nested-object
  depth to stay correct under camera movement.
- The map needs ambient life. Moving carts, road traffic, or equivalent small
  animated props should make important roads feel alive without hurting
  readability.
- Final release still requires accepted visual evidence, named hardware
  performance, and a trustworthy cutover audit.

## Non-Negotiable Invariants

- One canonical campaign coordinate system drives terrain, water, factions,
  cities, roads, rivers, forests, mountains, labels, fog, minimap, and picking.
- The previous campaign renderer's aligned natural-map output is the parity
  floor. WebGPU may improve style and detail, but it must not move cities,
  roads, rivers, or coastlines away from their real campaign positions.
- Roads are first-class world geometry or depth-aware decals with explicit
  elevation bias. They cannot be hidden by terrain, clipped at segment joins, or
  appear to run into water unless the crossing is an explicit bridge, ferry, or
  sea-lane semantic.
- Terrain features are visible content, not stains. Forest regions contain
  many trees, mountain regions contain grouped mountain/rock meshes, mud or
  rough regions contain rocks/potholes, and all feature edges avoid jagged
  low-resolution masks.
- Labels preserve the previous implementation's font, white text, black outline,
  icon silhouettes, zoom behavior, and density rules unless a better replacement
  is deliberately accepted.
- Selection rings are projected world-ground geometry and remain outside the
  model shadow/footprint at the correct perspective.
- Nested world objects use depth, not manual type sorting. City flags emerge
  from inside city volume; trees behind flags cannot draw over them.
- Visual metrics are telemetry. The goal is campaign readability, accuracy, and
  beauty, not minimizing a similarity number.

## Scenes Required

Every campaign LoD band must be represented by an addressable scene and a
stored screenshot in this spec's `visualizations/` tree.

- Close Rome: city, garrison/army label, roads, road junctions, flags, selection
  ring, and nearby terrain props.
- Central Italy: Roma, Ostia/Portus, Tibur, Narnia, Spoletium, Reate, Cosa,
  Clusium, Volsinii, Ferentinum, and the road network between them.
- Italy overview without faction colors: natural terrain, coastlines, roads,
  city labels, mountains, forests, and water compared to the archived
  `campaign-3d.png` baseline.
- Italy overview with faction colors: same camera, proving political overlays
  do not distort land/water/road alignment.
- Whole map: all LoD label rules, sea labels, border fog, major landforms, and
  terrain-color readability.
- Fog view: hidden cities/armies/flags are absent, border fog remains readable,
  and visible content still anchors correctly.
- Road continuity harness: fake and real-map scenes proving roads stay above
  terrain, connect through city/junction volumes, and only cross water through
  explicit bridge/ferry/sea-lane semantics.
- Camera stability harness: same anchors sampled across pan/zoom/LoD changes
  prove that city, road, water, and terrain pixels remain aligned.
- Ambient-life harness: carts or road traffic animate on road splines without
  breaking picking, labels, or performance.

## Verification

- Use `npm run scenario:webgpu:campaign` for the campaign scenario bundle.
- Use `npm run scenario:webgpu` before any release claim.
- Use `npm run cutover:webgpu` as a status report, not final proof.
- Use `npm run release:webgpu` only when visual comparisons and hardware
  performance evidence are ready to be judged.
- Use screenshot critique on close Rome, central Italy, Italy overview, whole
  map, fog, and road-continuity captures before accepting visual work.
- Keep archived current-renderer captures in this spec folder when they are used
  for judgment; do not rely on mutable screenshots outside the spec.

## Slices

1. [Campaign Coordinates And Alignment](slices/01-campaign-coordinates-and-alignment.md)
2. [Terrain Landforms And Biomes](slices/02-terrain-landforms-and-biomes.md)
3. [Roads And Junction Geometry](slices/03-roads-and-junction-geometry.md)
4. [Campaign Entities Labels And Fog](slices/04-campaign-entities-labels-and-fog.md)
5. [LoD Scene Matrix](slices/05-lod-scene-matrix.md)
6. [Ambient Campaign Life](slices/06-ambient-campaign-life.md)
7. [Campaign Visual Acceptance](slices/07-campaign-visual-acceptance.md)
8. [Release Cutover After Campaign Parity](slices/08-release-cutover-after-campaign-parity.md)
