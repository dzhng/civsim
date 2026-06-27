# 13 — Shared 3D Render Graph And Resource Lifetime

## Contract

The raw frame shell becomes a reusable full-game WebGPU render graph that can
host battle, campaign, menu, overlays, screenshots, and perf instrumentation
without each surface reinventing device, swapchain, pass ordering, resize, or
resource lifetime.

This slice also establishes the proper 3D engine contract for the rest of the
port. Battle and campaign must be able to render true 3D objects with depth
testing, not just paint meshes in a manually curated order. Nested and
interpenetrating objects are first-class test cases: a standard planted inside a
city, an army garrisoned inside a city, battle ranks overlapping in depth,
weapons/shields crossing bodies, trees/rocks/buildings occluding ground
markers, and projectiles passing through the scene must all resolve from a
shared camera/depth model.

The accepted architecture is a render graph with explicit attachment ownership:
color, depth, optional picking/id buffers, and any later shadow/normal buffers
belong to named passes with compatibility checks. A pass that writes depth must
declare it; a pass that deliberately ignores depth, such as labels/HUD, must be
an overlay pass by contract. Adding a depth attachment is not a local pipeline
option; it is a render-graph decision that keeps all pipelines in that pass
compatible or splits them into separate passes.

## API Seam

- `packages/game-renderer/src/renderGraph.ts`
  - `createGameRenderer(canvas, options): GameRenderer`
  - `beginFrame(frameState)`
  - `addPass(pass)` with declared color/depth/input/output attachments.
  - `submit()`
  - `resize(size)`
  - `destroy()`
- `packages/webgpu-core/src/resources.ts`
  - buffer/texture/pipeline caches keyed by stable descriptors.
- `packages/webgpu-core/src/depth.ts`
  - depth texture allocation/reuse, resize lifecycle, clear/load/store policy,
    and standard compare/write presets for opaque 3D, ground decals, and
    overlays.
- `packages/webgpu-core/src/camera3d.ts`
  - shared camera-space/world-space projection helpers used by battle and
    campaign model passes so depth, picking, and screenshots agree.
- `packages/webgpu-core/src/timing.ts`
  - CPU timing now; GPU timestamp hooks when available.
- `packages/game-renderer/src/fixtures/nested3d.ts`
  - deterministic geometry fixtures for flag-inside-city, garrison-inside-city,
    rank-overlap, ground-marker-occlusion, and projectile-depth review.

## Playable Deliverable

- `/webgpu/render-graph`
- Shows ordered passes for terrain, depth-tested opaque 3D, depth-aware ground
  decals, transparent/atmosphere, labels/HUD overlays, and debug visualization.
- Includes a nested-object fixture gallery:
  - flag planted inside a city volume with the lower mast/cloth occluded by the
    city roofs/walls.
  - army token inside a city volume with selectable occlusion states: visible
    outside, partially garrisoned, fully hidden.
  - two battle ranks crossing in depth with shields/weapons sorting correctly.
  - ground selection ring partly covered by units/trees/rocks.
- Debug panel exposes pass names, attachment formats, depth clear/load/store
  policy, resource counts, frame number, resize state, device identity, and
  whether any pipeline was rejected for incompatible attachments.

## Implementation Checkpoint

- `RawFrameShellImpl` now supports an optional `depthExtra` world pass that
  loads the existing color target, clears a reusable `depth24plus` attachment,
  binds the shared camera uniforms, and draws depth-tested geometry after the
  existing flat frame pass.
- `packages/game-renderer/src/renderGraph.ts` declares the first shared
  full-game graph skeleton with `worldDepth` ownership: terrain/ground write
  depth, opaque 3D battle/campaign passes read-write depth, and labels/UI are
  explicit overlay passes that cannot write depth.
- `/webgpu/render-graph` includes `Nested3dFixturePass`, a deterministic
  depth-only proof surface for flag-in-city, garrison-in-city-stub,
  rank-overlap, and ground-ring-occlusion. The fixture deliberately submits
  occluding city/front-rank geometry before later flag/ring/rear-rank geometry
  so a passing image proves depth, not painter order.
- `web/scenarios/webgpu-lab-routes.mjs` now samples pixels from the
  render-graph canvas to prove the city occludes the lower planted standard,
  the upper flag remains visible, and the front battle rank wins the overlap.
- `webgpu-visual-report` now includes a `Render Graph Nested Depth` row so
  this foundation remains visible before production city, army, and battle mesh
  polish can be accepted.

## Verification

- Unit tests prove pass order, resize reconfiguration, and destroy idempotence.
- Unit tests prove depth attachment reuse, resize destruction/recreation,
  pipeline compatibility validation, and that overlay passes cannot
  accidentally write depth.
- Scenario opens `/webgpu/render-graph`, resizes the viewport, and verifies the
  canvas does not blank.
- Scenario captures the nested-object gallery and asserts visible pixel
  evidence for:
  - city geometry occluding part of an inserted standard.
  - garrisoned army hidden/partially hidden according to the fixture state.
  - back battle rank not painting over the front rank when geometry overlaps.
  - selection ring visible outside an object footprint but occluded beneath the
    object volume.
- `webgpu-visual-report` includes these nested-object crops before campaign or
  battle mesh polish can be accepted as final.
- `webgpu-device` and `webgpu-lab-routes` keep passing.

## Must Stay Green

- Existing lab routes keep using the same render graph path or a thin adapter.
- No battle/campaign gameplay state changes.
- Existing campaign and battle screenshots may change only when the production
  adapters opt into the new graph deliberately and are reverified through the
  visual report. This slice may add the graph and fixture route without forcing
  every current pass into depth in the same commit.

## Human Feedback

Review whether the nested-object fixtures behave like real 3D, not layered
stickers. If the flag-in-city or garrison-in-city fixture fails visually, do not
try to fix the production city mesh first; fix the shared render graph/camera
depth contract.

Current unprimed screenshot critique supports the intended depth evidence:
flag/standard lower parts are occluded by the city volume, the ground ring is
partly hidden by the city, and the front rank wins the overlap. It also flags
the fixture as visually crude: weak flag attachment, low-contrast/jagged
selection ring, exposed board-like terrain horizon, missing shadows, toy-like
unit forms, and nonspecific terrain detail. Treat those as follow-up art and
production-pass blockers, not reasons to keep painter-order hacks.
