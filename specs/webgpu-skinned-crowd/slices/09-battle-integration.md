# 09 — Live Battle Integration

## Contract

The raw WebGPU crowd renderer can drive a real battle while preserving camera,
input, UI, picking, banners, overlays, and deterministic freeze behavior.

## API Seam

- `web/src/battle/rawWebGpu/battleRenderer.ts`
  - implements the same public draw surface `BattleScene` needs.
- Imports production-ready pieces from `packages/webgpu-core`,
  `packages/soldier-assets`, and `packages/crowd-runtime`.
- Lab route:
  - `/webgpu/battle`
- Later production switch:
  - a deliberate route or renderer selection once this slice is complete.
  - default remains unchanged until this slice is complete.

## Playable Deliverable

- `/webgpu/battle`
- Debug overlay exposes WebGPU status, LOD counts, draw counts, visible soldiers,
  and animation clock mode.

## Verification

- Scenario boots a live battle and checks visible terrain/player/enemy pixels.
- Existing DPR click and drag-box selection checks pass.
- Frozen battle, two animation phases, pixel diff inside selected unit AABB.
- `web/verify-battle.mjs` or `web/scenario.mjs` gains named raw-WebGPU cases.

## Must Stay Green

- Unit cards, command buttons, banners, minimap/HUD, and selection stay DOM/2D.
- `web/src/shared/camera.ts` remains unchanged.
- Sim golden tests are unaffected.

## Human Feedback

This is the first point where the feature should feel like playing the actual
battle, even with placeholder soldiers.
