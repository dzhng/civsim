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
  trampled-ground patches, and retained team-color/HUD readability.
- A visual review screenshot is compared against the Aegean aesthetic references
  before blessing.

## Must Stay Green

- `web/src/shared/camera.ts` remains the world/screen source of truth.
- `?debug=blocks` behavior scenarios are not churned by terrain art.
- Existing battle snapshots stay available until the cutover slice retires them.

## Human Feedback

This is the first taste checkpoint for whether the WebGPU battle feels like the
same warm Aegean world rather than a technical test grid.
