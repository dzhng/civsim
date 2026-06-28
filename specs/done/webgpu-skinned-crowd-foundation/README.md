# WebGPU Renderer Foundation

This record closes the original WebGPU renderer-foundation plan. It is not the
final release record. The foundation phase replaced the old renderer direction
with a raw WebGPU architecture, production routes, scene gates, report plumbing,
and model/soldier/campaign evidence.

The later `specs/webgpu-skinned-crowd/` campaign plan was folded back into this
closed record and retired because it had become a noisy mix of temporary
reports, screenshots, and broad release work. The active campaign planning
surface is now the smaller campaign-only polish spec:
[../../campaign-polish/README.md](../../campaign-polish/README.md).

## What Shipped

- Raw WebGPU became the production rendering path for the default battle,
  campaign, menu, and lab routes.
- The renderer gained shared frame-shell, camera-uniform, depth-contract,
  render-graph, and pipeline-contract modules under `packages/webgpu-core` and
  `packages/game-renderer`.
- Battle rendering moved through `web/src/battle/rendererWebGPU.ts` with WebGPU
  input, HUD, minimap, visual, and performance scenes under `web/scenes`.
- Campaign rendering moved through `web/src/campaign/rendererWebGPU.ts`,
  `surface.ts`, `terrain.ts`, `icons.ts`, and `webgpuUiLayer.ts`, with
  production, handoff, save/load, visual, map-alignment, and LoD scenes.
- WebGPU reports and gates were wired into `web/package.json`:
  `scenario:webgpu`, `scenario:webgpu:campaign`, `cutover:webgpu`, and
  `release:webgpu`.
- Model and soldier gates were added so individual assets, animation poses,
  nested objects, labels, and regression crops could be reviewed outside the
  full game frame.

## Durable Invariants

- Battle and campaign share one world/camera/depth contract. A mesh, road,
  selection cue, shadow, projectile, tree, mountain, city, soldier, and flag
  must land in the same world space and resolve through the same depth rules.
- Render passes declare semantic roles. World geometry writes depth, decals and
  ground cues read depth without replacing geometry, and UI/labels remain
  explicit overlay layers.
- The campaign map uses canonical campaign coordinates for land, water,
  faction colors, cities, roads, rivers, labels, markers, fog, and LoD. Water is
  never a free overlay that can drift away from cities and roads.
- Selection rings are world-ground geometry. They foreshorten with the camera
  and sit outside the model shadow or footprint.
- Nested objects are ordinary 3D composition. City flags, army standards, and
  later garrisoned armies live inside the city or formation volume and rely on
  depth, not hand-sorted type buckets.
- Fonts, icons, label halos, and readable color treatment are game UI contracts,
  not polish. Campaign labels preserve the old renderer's white text with dark
  outline and icon language unless a deliberate replacement is reviewed.
- Screenshot scores are diagnostic telemetry. Release acceptance comes from
  scene-specific evidence, focused crops, critique, and explicit human review of
  whether WebGPU is equal or better for play.

## Evidence Kept

Historical contracts and reference notes from this phase are kept in `assets/`
beside this file. Current generated screenshots and reports live in the active
product snapshot folders and scene harness outputs; feature-owned campaign
review images for the next pass live under
`specs/campaign-polish/assets/user-feedback/`.

Useful foundation evidence includes:

- `web/shots/campaign/campaign-3d.png`
- `web/shots/campaign/campaign-natural.png`
- `web/shots/campaign/campaign-political.png`
- `web/shots/baseline/models/`
- `web/shots/baseline/models-ingame/`
- `web/shots/anim/`
- `web/scenes/webgpu-model-gates.mjs`
- `web/scenes/webgpu-soldier-gates.mjs`
- `web/scenes/campaign-webgpu-lod.mjs`

## Dead Ends And Course Corrections

- Chasing a global similarity score was retired. Better graphics can score
  farther from the old renderer, so comparisons are used to find regressions,
  missing content, and crop-level differences.
- Type-bucket sorting is not a visibility architecture. It caused flags, trees,
  rings, and units to layer incorrectly. Shared world depth is the accepted
  foundation.
- A flat campaign board was not parity. Campaign close and overview cameras
  must preserve the old perspective language where distance, labels, roads, and
  terrain foreshorten together.
- Water-mask edits were the wrong fix for campaign alignment. The previous
  renderer proved the map asset can align; WebGPU must sample and project the
  existing land/water/faction data through one coordinate transform.
- The retired campaign plan proved that a giant spec with every generated
  report becomes hard to use. Keep temporary artifacts out of durable plans;
  copy only the images used for judgment into the active feature spec.
- Headless SwiftShader performance is liveness evidence only. Release evidence
  requires named hardware, browser, resolution, and current-renderer baseline
  context.

## Remaining Work

The foundation is closed because the architecture, WebGPU routes, reports, and
initial evidence exist. The game is not yet release-complete. Remaining
campaign work is tracked by the live campaign polish spec:

- city/road/label polish around Rome and central Italy;
- green natural terrain, mountains, forests, trees, and road life;
- focused screenshot evidence instead of broad temporary report folders;
- final campaign acceptance before any release cutover claim.
