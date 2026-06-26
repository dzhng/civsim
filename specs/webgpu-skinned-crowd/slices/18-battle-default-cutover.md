# 18 — Battle Default Cutover

## Contract

Normal battle launch uses the raw WebGPU battle renderer. The old
BattleRenderer3D and 2D paths are removed from production code instead of kept
behind query-string fallbacks.

## API Seam

- `web/src/battle/scene.ts`
  - renderer construction is always `BattleRendererWebGPU`.
- `web/src/battle/rendererWebGPU.ts`
  - production adapter that speaks the existing battle scene renderer contract
    while drawing terrain, skinned crowds, overlays, attack triangles, and
    `?debug=blocks` via raw WebGPU passes.
- `web/scenario.mjs`
  - named battle scenarios target WebGPU by default.
- `web/verify-battle.mjs`
  - quick battle verify requests WebGPU browser flags and keeps long full-tier
    scenarios behind `--full`.

## Playable Deliverable

- `/` → Quick Battle → any battle uses WebGPU.
- `?gfx=3d` and `?gfx=2d` no longer select battle renderers.
- The old `?test=models` Babylon battle turntable is retired in favor of the
  raw-WebGPU lab/asset workbench lane.

## Verification

- `VERIFY_URL=http://127.0.0.1:5175 npm run verify` passes against WebGPU
  battle defaults.
- `battle-webgpu-default` asserts normal battle launch reports
  `renderer: "webgpu"` and draws the 30k soldier crowd.
- Battle smoke baselines are re-blessed to WebGPU output. These are now the
  routine battle screenshots; old renderer captures are migration evidence.
- LOD/readability checks pass through a WebGPU `?debug=blocks` layer instead of
  relying on Babylon debug blocks.
- Build output has no battle `renderer3d-*`, 2D battle-renderer chunk, or
  Babylon chunk.

## Must Stay Green

- `?gfx=2d`/`?gfx=3d` do not reactivate battle legacy renderers.
- Campaign battle handoff still launches and returns correctly.
- No sim golden hash moves.
- `npm run verify -- --full` still owns the long 30k cluster/cavalry/mechanics
  checks; quick verify must stay fast enough for routine WebGPU screenshot runs.

## Human Feedback

This is the “does the battle feel shipped?” review. If not, do not delete the
old renderer yet.
