# 13a — Shared World Camera And Depth Contract

## Contract

Campaign and battle use one WebGPU world/camera/depth model for every true
3D object. A renderer pass may choose a different visual style, but it may not
invent separate projection math, depth normalization, or ad-hoc draw ordering
for the same kind of world-space composition.

This is the contract that makes the hard visual cases basic engine behavior:
a city standard planted inside the city volume, a future garrisoned army inside
a settlement, battle ranks and weapons crossing in depth, roads and ground
decals under units, selection rings foreshortened on the terrain plane, and
shadows that sit on the ground instead of floating as screen overlays.

## API Seam

- `packages/webgpu-core/src/cameraUniform.ts`
  - owns the CPU-side `CameraSnapshot`, packed uniform data, and
    `worldToScreen`/`screenToWorld` helpers.
- `packages/webgpu-core/src/cameraWgsl.ts`
  - owns the shared WGSL camera uniform declaration plus `cameraSpace`,
    `perspectiveDepth`, `projectGround`, and `projectWorld3d`.
  - owns named game-depth helpers. Battle and campaign share projection
    semantics, but their world extents use explicit helpers instead of
    pass-local magic numbers.
- `packages/webgpu-core/src/frameShell.ts`
  - binds the shared camera uniform to every render pass and exposes named
    frame phases: `background`, `world`, and `overlay`.
  - owns the live `world-depth` pass and publishes the executed phase list in
    frame stats so scenarios can prove a route used the shared depth contract.
  - requires each `world-depth` graph pass to declare a depth mode: `read` for
    ground decals/roads/cues, `read-write` for true 3D geometry, and `write`
    only for explicit depth-fill passes.
- `packages/game-renderer/src/**`
  - model, terrain, decal, and fixture passes import the shared WGSL helpers
    instead of copying camera structs and projection functions.
  - background and overlay-adjacent passes still share the same camera helpers:
    campaign map textures, territory, water/cloud quads, map markers, and label
    anchors may choose non-depth overlay behavior, but they do not carry private
    camera uniforms or projection formulas.

## Playable Deliverable

- `/webgpu/world-camera`
- Shows the same small scene through campaign-style and battle-style cameras:
  ground grid, raised road, selection ring, city-with-standard, garrison token,
  two crossing ranks, projectile/debug line, and screen/HUD labels.
- Includes toggles for pitch, yaw, perspective, depth visualization, draw-order
  scramble, and overlay-only mode.

## Verification

- Type tests or unit tests prove the packed `CameraSnapshot` layout matches the
  WGSL struct offsets and stays 16-byte aligned.
- Browser scenario opens `/webgpu/world-camera` and asserts:
  - CPU `worldToScreen` agrees with GPU-projected anchor pixels for ground
    points used by labels, picking, and DOM/HUD overlays.
  - Selection rings are ellipses on the ground plane after pitch/perspective,
    not screen-space circles.
  - Scrambling draw order does not change city-standard occlusion, garrison
    visibility, or battle rank overlap where depth should decide.
  - Overlay labels remain readable and intentionally ignore depth.
- `webgpu-visual-report` includes cropped world-camera rows for flag-in-city,
  garrison-in-city, selection-ring-grounding, rank-depth, and label-anchor
  agreement.
- `compare-screenshots` records the metric movement for campaign-label-zoom and
  battle-selection after each migration to the shared projection helpers.
- `screenshot-critique` gets tight crops for the same features before accepting
  the slice.

## Must Stay Green

- Existing WebGPU lab routes and production adapters keep rendering through the
  same `RawFrameShell` camera bind group.
- Depth-sensitive routes expose `background -> world-depth` in frame stats;
  labels/minimaps/HUD can add a later `overlay` phase but true 3D model passes
  do not draw through untyped side callbacks.
- Every live `world-depth` pass publishes its depth mode in frame stats, and
  scenarios assert the modes for nested-object, skinned-depth, and production
  campaign UI gates.
- Declarative render-graph depth modes are exclusive contracts: `read` must not
  write the depth attachment, `write` must not read it, and only the shared
  `worldDepth` attachment is valid for full-game world composition.
- Campaign UI labels/icons keep the old font/icon style while their anchors
  move onto the shared projection contract.
- Battle picking, drag selection, minimap viewport, and DOM unit banners remain
  consistent with the rendered world position.
- No sim/campaign mechanics change.

## Current Checkpoint

- `packages/webgpu-core/src/cameraWgsl.ts` now exposes the first shared WGSL
  camera/projection helpers.
- `CampaignEntityPass`, `CampaignSceneryPass`, `CampaignSelectionPass`, and
  `Nested3dFixturePass` use that shared WGSL source for projection instead of
  each pass owning a private copy.
- `/webgpu/world-camera` renders the nested-object fixture through the shared
  helper path and publishes CPU-vs-GPU ground-anchor agreement stats so picking,
  labels, and shader projection can be checked together.
- Battle skinned soldiers, battle terrain/scenery quads, battle overlays, and
  the production debug triangle pass now consume the same shared WGSL camera
  helpers while preserving their existing depth/pass ordering.
- Battle skinned soldiers now render through a depth-compatible pipeline using
  the shared battle world-depth helper, and production/lab battle routes submit
  them through the depth world pass instead of the background pass. Terrain
  remains a background surface; tactical selection/path/minimap/debug lines are
  deliberate overlays.
- Campaign entities, scenery, road meshes, and selection decals no longer own
  separate depth formulas. True 3D campaign meshes use the shared campaign
  world-depth helper; ground decals and roads render in the depth world pass
  with depth writes off so later world geometry can occlude them naturally.
- `RawFrameShell.drawFrame` now requires named phase callbacks instead of
  generic side-channel hooks. Production and lab routes publish the actual
  phase list, and the lab route scenario asserts the depth-critical routes
  execute `background -> world-depth` rather than relying on visual pixels
  alone.
- `RawFrameShell` built-in terrain/backdrop/marker shaders and campaign
  map/territory/atmosphere/label-anchor shaders now import
  `WORLD_CAMERA_WGSL`; label atlas quads keep screen-space offsets only after
  anchoring through the shared `cameraSpace`/`perspectiveDepth` helpers.
- `webgpu-lab-routes` now scans WebGPU renderer source files and fails if a
  shader string reintroduces a private `struct Camera` outside
  `packages/webgpu-core/src/cameraWgsl.ts`.
- `/webgpu/skinned-depth` exercises the real `SkinnedCrowdPipeline` with a
  hostile cross-bucket order: the nearer soldier is submitted before a later
  rear class bucket, and the scenario samples the overlap to prove depth wins.
- Normal production battle and campaign renderer stats now expose the shared
  camera contract, allocated depth attachment, and executed frame phases, and
  production scenarios assert those fields instead of relying only on lab gates.
- `CampaignEntityPass`, `CampaignSceneryPass`, and `CampaignSelectionPass` now
  expose only the depth-compatible `draw(pass)` path. Their old no-depth
  pipeline variants and `drawDepth` twin APIs were removed, and
  `webgpu-lab-routes` scans those files so the footgun stays gone.
- The frame shell now brands render pass callbacks by phase:
  `BackgroundRenderPass`, `WorldRenderPass`, and `OverlayRenderPass`.
  Depth-sensitive draws such as `SkinnedCrowdPipeline`, nested 3D fixtures,
  campaign entities/scenery/selections/roads, and depth campaign lines require
  `WorldRenderPass` at compile time, and `webgpu-lab-routes` scans for the
  brand so true 3D geometry cannot casually drift back into background or
  overlay callbacks.
- Background and overlay draw entry points are branded as well: battle terrain,
  campaign map/territory/water/flat lines require `BackgroundRenderPass`, while
  battle overlays/minimap/debug triangles and campaign clouds/markers/labels
  require `OverlayRenderPass`. The lab route source guard now checks the full
  phase-brand contract, not only depth-sensitive world draws.
- Live frame submission now uses graph-shaped pass lists instead of
  callback-shaped `background`/`world`/`overlay` fields. Each submitted pass has
  a stable id and a frame phase, and `RawFrameShell.stats().phases` publishes
  the executed pass ids so scenarios can verify the real frame shape, not only
  the declarative render-graph skeleton.
- Live `world-depth` passes now declare a `FrameGraphDepthMode`. The frame shell
  validates phase order, publishes depth pass ids/modes in stats, and the lab
  scenario scans source routes so a future depth pass cannot omit its
  read/write contract.
- `FrameGraphDepthMode`, the production `worldDepth` attachment name, and the
  `depth24plus` format now flow from `packages/webgpu-core/src/depthContract.ts`.
  Render graph and pipeline code import the contract rather than redeclaring the
  union or hard-coding matching literals; the lab scenario scans production
  TypeScript for those footguns.
- Depth-writing world geometry now uses named material helpers from
  `packages/webgpu-core/src/pipelineContracts.ts`. Skinned soldiers, nested
  fixtures, and opaque campaign entity/scenery volumes use the opaque world
  target/depth contract; campaign entity/scenery shadows are separate
  alpha-blended depth-read decal draws inside the same world pass. The lab
  scenario scans those files so alpha blending cannot quietly return to a
  depth-writing model bucket.
- Campaign line rendering is phase-specific rather than selected at draw time.
  Background map borders use `CampaignLinePass`; sea lanes that need world-depth
  read semantics use `CampaignWorldLinePass`. The lab source guard rejects
  `drawDepth`, parallel `depthPipeline` fields, and production routes that wire
  sea lanes through the background line class.
- Normal production flow scenarios now import `web/scenarios/_webgpu-contract.mjs`
  and assert concrete pass ids plus depth modes, not only broad renderer
  readiness or phase order. Battle launch/input/handoff/perf checks require the
  `battle-skinned-crowd` read-write depth pass; campaign launch/save/load/menu
  checks require selection, road, sea-lane, scenery, and entity depth modes. The
  lab route scans those scenario files so weaker local phase-only helpers cannot
  quietly replace the shared contract.
- `compileRenderGraph` now rejects mismatched depth accesses: read-only passes
  that write depth, write-only passes that read depth, and private depth
  attachments. `/webgpu/render-graph` publishes negative fixtures for those
  cases so the browser scenario proves the graph contract, not only the happy
  path.
- The declarative full-game render graph now tracks content domain and runtime
  frame phase separately. Battle/campaign classify ownership, while
  `background -> world-depth -> overlay` classifies attachment semantics. The
  graph compiler rejects depth outside `world-depth`, rejects `worldDepth`
  resources in background/overlay passes, and the render-graph lab route
  publishes the graph frame phases plus depth-pass ids.
- Type batching is permitted only as a performance strategy. Batches for trees,
  rocks, cities, armies, and soldier mesh variants must not create their own
  visual ordering rules or private depth scales.
- `/webgpu/campaign-model-gates?gate=city` now publishes tight production
  city-standard samples. The route asserts that a lower red standard segment
  planted inside the city resolves to city material while the upper cloth
  remains visibly faction-colored, so the real city mesh is checked for
  interpenetrating-object behavior instead of relying only on the abstract
  nested fixture.
- `/webgpu/campaign-model-gates?gate=garrison-city` now publishes production
  garrison samples using the same city and army entity pass. The route asserts
  that a later-drawn army occupant can sit inside the settlement volume with its
  lower body occluded by city material while its raised standard remains
  readable above the roofs.

## Human Feedback

Review the fixture crops as engine behavior, not aesthetics. If the flag still
looks layered on top of a city, if a garrison token cannot sit inside a city, or
if a selection ring reads as a flat screen circle, this slice is not accepted
even if the broader screenshot score improves.
