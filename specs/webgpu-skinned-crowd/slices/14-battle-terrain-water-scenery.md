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
- The sim-tint prop pass now weights terrain features toward authored objects
  instead of broad translucent stains: forest/mud/scree base mask alpha was
  lowered, forest boundaries get denser cypress/shrub detail, and mud/scree
  patches add more distinct potholes and rocks while reducing broad churn
  smears. The accepted report moved Battle Selection DPR2 from `0.10955` to
  `0.10869`, Battle Max Crowd from `0.21015` to `0.20990`, and Campaign Handoff
  Battle from `0.17713` to `0.17936`; the small handoff regression is accepted
  because an unprimed critique flagged broad smudged decals as the more
  important artifact to reduce. Terrain evidence increased from `1641 / 1531`
  quads/scenery to `2028 / 1892` in DPR2, and from `12879 / 12079` to
  `18279 / 17379` in Battle Max Crowd.
- A wide tactical terrain shader style now applies only to low-zoom battle
  cameras, leaving close selection views on the calmer default terrain. This
  scoped pass raised Battle Max Crowd edge energy without destabilizing DPR2:
  Battle Max Crowd moved from `0.20990` / `0.23754` crop to `0.20404` /
  `0.22554`, world-crop edge ratio improved from `0.75226` to `0.87749`, and
  Battle Selection DPR2 stayed at `0.13474` crop.
- Battle terrain now submits authored object detail through the same shared
  world-depth phase as soldiers. `BattleTerrainPass.draw()` renders only
  background underpaint (water, beaches, tint masks, churn stains, and shadows),
  while `BattleTerrainPass.drawProps()` renders discrete trees, shrubs, and
  rocks through an opaque/cutout `world-depth` pipeline using the shared battle
  depth helper, not a fixed clip-depth shortcut. Production and lab battle
  stats expose `backgroundQuads` and `worldPropQuads`, and the scenario contract
  requires the `battle-terrain-props` pass before accepting the production
  renderer.

## Verification

- Scenario screenshots terrain-only map A/map B/coast fixtures.
- Pixel checks assert warm grass, readable water, nonblack sky, and deterministic
  frozen ground animation.
- `VERIFY_WEBGPU=1 node scenario.mjs battle-webgpu-default webgpu-lab-routes`
  checks the production battle atmosphere stat, warm terrain, team colors,
  richer water/foam/scenery/world-prop terrain fixture counts, sky, minimap,
  DPR input, and frozen-pixel determinism.
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

Fresh unprimed critique on the current accepted terrain pass still flags:
bottom UI/minimap overlap, tiny soldiers dominated by flags/bars, missing
ground-space selection marker, visible rectangular playfield edges, terrain
feature blobs needing stronger object/contact structure, fragile `KITE` labels,
terrain noise competing with unit dots, and the handoff road reading as repeated
oval stamps. This slice addressed the terrain-blob portion by reducing broad
feature masks and increasing deterministic object detail; the other findings are
queued for the battle UI/compositor, crowd LOD/readability, selection marker,
camera/world-boundary, label, and road slices.

Two follow-up terrain-density trials were rejected for Battle Selection DPR2:
a dedicated irregular pothole shader with more potholes moved full/world-crop
parity from `0.10869` / `0.13494` to `0.11165` / `0.14004`, and a
fewer-potholes/more-rocks variant moved it to `0.11206` / `0.14102`. Both still
read as patterned/stamped terrain. The next terrain-feature pass should change
feature representation, boundaries, and object placement rather than adding
more per-cell detail density.

Fresh unprimed critique on the wide tactical Battle Max Crowd update says the
candidate is more complete in terrain coverage, crowd count, and environmental
texture, but not yet more readable overall. Remaining blockers: soldiers still
read as tiny specks behind dominant cards/bars, the yellow-green haze flattens
props, the lower HUD covers active battle space, and repeated terrain mottling
is visible.
