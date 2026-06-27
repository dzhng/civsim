# 14 — Battle Terrain, Water, Sky, And Scenery

## Contract

The battle world surface is raw WebGPU: terrain tints, roughness, roads/paths,
water, sky gradient, horizon haze, shadows, trampled ground, selection glow,
and sparse Mediterranean scenery render without Babylon.

## API Seam

- `packages/game-renderer/src/battle/terrainPass.ts`
- `packages/game-renderer/src/battle/waterPass.ts`
- `packages/game-renderer/src/battle/sceneryPass.ts`
- Inputs remain current terrain wasm views: speed, roughness, tint, terrain
  dimensions, origin, and camera snapshot.

## Playable Deliverable

- `/webgpu/battle-terrain`
- Fixture selector for map A, map B, beach/coast, muddy melee patch, and sparse
  prop field.

Current checkpoint:

- The shared raw-WebGPU frame shell now reports `aegean-sky-haze`, uses a warmer
  sky clear, and applies distance haze plus sun-bleached olive/tan grading in
  the base terrain shader.
- `BattleTerrainPass` is field-aware on the production battle route: the coast,
  beach shelf, foam/glint bands, trampled patch, shadows, olive scrub, rocks,
  cypress silhouettes, and warm gold selection glow scale from the current
  battlefield rect instead of sitting as a fixed tiny lab stamp.
- Production battle stats expose the same atmosphere contract through
  `window.__game.stats().renderStats.atmosphere`.
- `webgpu-visual-report` records that atmosphere evidence for battle default,
  DPR2 battle selection/HUD, and campaign-to-battle handoff captures, with the
  battle rows explicitly naming the field-aware coast and feathered shore.
- The DPR2 visual report frame now filters frozen-review overlay segments so
  transient paths/projectiles/attack arcs do not appear as unexplained colored
  debug lines. Churned terrain patches use ragged oval alpha instead of hard
  rectangular quads, removing the square-artifact read while keeping trampled
  ground detail.
- Production WebGPU battle terrain now reads the real wasm `terrain_tint`
  grid used by the minimap instead of an unrelated decorative fixture. Forest,
  mud, and rough-ground cells are translated into faint masks plus deterministic
  tree, shrub, pothole, churn, and rock quads from the same data source so the
  main battlefield and minimap agree without exposing a raw raster overlay as
  final art.
- The Battle Selection DPR2 parity pass now adds deterministic grass/stubble and
  pebble micro-detail in the shared base terrain shader, not extra debug
  overlays. Against the archived renderer the compare-screenshots parity
  distance moved from `0.17527` to `0.15910`, and the candidate edge-energy
  ratio moved from `0.65520` to `0.70633`, while the visible terrain features
  remain sourced from the same data as the minimap.
- The sim-tint terrain detail pass now shifts visual weight away from flat
  translucent feature masks and into deterministic props/details: denser
  cypress/shrub forest cells with contact shadows, and denser mud/scree cells
  with potholes, churn marks, and rocks. Production battle `renderStats` now
  exposes terrain quad/scenery counts, and `webgpu-visual-report` records those
  counts for battle rows. Battle Selection DPR2 parity distance moved from
  `0.15910` to `0.15681`, with edge-energy ratio up from `0.70633` to `0.71841`.
- The shared base terrain shader now leans greener with denser deterministic
  grass, stubble, and pebble flecks, while sim-tint terrain lowers the broad
  forest/mud masks and increases smaller tree, shrub, pothole, churn, and rock
  detail. Battle Selection DPR2 terrain evidence moved from `970 / 908`
  quads/scenery to `1394 / 1314`, and parity distance moved from `0.15594` to
  `0.13756`; edge-energy ratio improved from `0.71041` to `0.78274` without
  reintroducing the earlier colored-line or square-mask artifacts.
- The base terrain shader now adds a denser deterministic grass/stubble/pebble
  fleck layer without increasing terrain quad or scenery counts. Battle
  Selection DPR2 parity distance moved from `0.13792` to `0.12433`, and
  edge-energy ratio improved from `0.78536` to `0.85960`. The accepted capture
  was inspected to confirm the added edges read as ground texture rather than
  the earlier random straight-line or square-overlay artifacts.
- A follow-up bounded shader-only fleck pass raised the deterministic seed
  frequency and tightened stubble/stone/light/dark fleck thresholds without
  adding overlay geometry. Battle Selection DPR2 parity distance moved from
  `0.12433` to `0.11798`, and edge-energy ratio improved from `0.85960` to
  `0.90481`. The accepted PNG and candidate edge map were inspected to confirm
  the new breakup still reads as grass/stubble texture and not debug noise.
- The next base-terrain shader tune widened the light/dark/stone fleck
  thresholds and raised the seed frequency while keeping terrain quad counts
  unchanged. Battle Selection DPR2 parity distance moved from `0.11580` to
  `0.10955`, Battle Max Crowd moved from `0.21370` to `0.21015`, and
  Campaign Handoff Battle moved from `0.19672` to `0.17713`. The accepted
  side-by-side was inspected to confirm the extra texture reads as grass and
  stubble, with no return of random straight-line overlays or square terrain
  artifacts.

## Verification

- Scenario screenshots terrain-only map A/map B/coast fixtures.
- Pixel checks assert warm grass, readable water, nonblack sky, and deterministic
  frozen ground animation.
- `VERIFY_WEBGPU=1 node scenario.mjs battle-webgpu-default webgpu-lab-routes`
  checks the production battle atmosphere stat, warm terrain, team colors,
  richer water/foam/scenery terrain fixture counts, sky, minimap, DPR input, and
  frozen-pixel determinism.
- `VERIFY_WEBGPU=1 node scenario.mjs webgpu-visual-report` regenerates the
  cutover contact sheet; the current inspected battle captures show a wider
  feathered water/shore band, no random frozen-overlay streaks, softened
  trampled-ground patches, deterministic grass micro-detail, sim-sourced forest
  and mud props/details, and retained team-color/HUD readability.
- `node .agents/skills/compare-screenshots/scripts/visual-parity-diff.mjs`
  records the current Battle Selection DPR2 terrain movement in
  `visualizations/visual-diff/visual-parity-diff.json`.
- A visual review screenshot is compared against the Aegean aesthetic references
  before blessing.

## Must Stay Green

- `web/src/shared/camera.ts` remains the world/screen source of truth.
- `?debug=blocks` behavior scenarios are not churned by terrain art.
- Existing battle snapshots stay available until the cutover slice retires them.

## Human Feedback

This is the first taste checkpoint for whether the WebGPU battle feels like the
same warm Aegean world rather than a technical test grid.

Fresh unprimed critique on the 2026-06-27 DPR2 battle selection capture still
flags broader battle-readability work outside this terrain-source slice: the
playfield edge reads as a rectangular tile, the top-left HUD can cover active
formations, selected world units need a clearer ground-space marker, flags/bars
dominate tiny soldiers at this zoom, labels are fragile over busy terrain, and
terrain features must keep moving away from low-res stain/blob reads toward
grounded props and authored detail. These remain acceptance blockers for the
later battle UI/compositor, crowd parity, and default cutover slices.
