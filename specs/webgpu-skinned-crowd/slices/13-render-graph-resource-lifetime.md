# 13 — Render Graph And Resource Lifetime

## Contract

The raw frame shell becomes a reusable full-game WebGPU render graph that can
host battle, campaign, menu, overlays, screenshots, and perf instrumentation
without each surface reinventing device, swapchain, pass ordering, resize, or
resource lifetime.

## API Seam

- `packages/game-renderer/src/renderGraph.ts`
  - `createGameRenderer(canvas, options): GameRenderer`
  - `beginFrame(frameState)`
  - `addPass(pass)`
  - `submit()`
  - `resize(size)`
  - `destroy()`
- `packages/webgpu-core/src/resources.ts`
  - buffer/texture/pipeline caches keyed by stable descriptors.
- `packages/webgpu-core/src/timing.ts`
  - CPU timing now; GPU timestamp hooks when available.

## Playable Deliverable

- `/webgpu/render-graph`
- Shows three ordered passes: terrain, instanced markers, UI/debug overlay.
- Debug panel exposes pass names, resource counts, frame number, resize state,
  and device identity.

## Verification

- Unit tests prove pass order, resize reconfiguration, and destroy idempotence.
- Scenario opens `/webgpu/render-graph`, resizes the viewport, and verifies the
  canvas does not blank.
- `webgpu-device` and `webgpu-lab-routes` keep passing.

## Must Stay Green

- Existing lab routes keep using the same render graph path or a thin adapter.
- No battle/campaign gameplay state changes.

## Human Feedback

Review whether the debug panel names enough internals to diagnose later battle
and campaign passes without opening code.

