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
- `packages/webgpu-core/src/frameShell.ts`
  - binds the shared camera uniform to every render pass and exposes the
    depth-capable frame split.
- `packages/game-renderer/src/**`
  - model, terrain, decal, and fixture passes import the shared WGSL helpers
    instead of copying camera structs and projection functions.

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

## Human Feedback

Review the fixture crops as engine behavior, not aesthetics. If the flag still
looks layered on top of a city, if a garrison token cannot sit inside a city, or
if a selection ring reads as a flat screen circle, this slice is not accepted
even if the broader screenshot score improves.
