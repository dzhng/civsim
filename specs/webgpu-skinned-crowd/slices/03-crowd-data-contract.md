# 03 — Crowd Data Contract

## Contract

Battle state is converted into compact GPU-ready instance data without changing
the sim or camera contracts.

## API Seam

- `packages/crowd-runtime/src/instanceData.ts`
  - `buildCrowdInstances(inputs, outputBuffers): CrowdBuildStats`
  - inputs are zero-copy views: positions, facings, frames, alive, unit info.
- Instance fields:
  - position
  - facing
  - class/archetype
  - faction
  - alive/death state
  - frame/clip state id
  - variation seed

## Playable Deliverable

- `/webgpu/crowd-data`
- Renders generated marker instances using the raw WebGPU shell.

## Verification

- Unit tests for buffer packing and deterministic seeds.
- Scenario with 1k/10k/30k generated soldiers renders expected marker counts.
- Exact click and drag selection still use existing game/camera paths.

## Must Stay Green

- `crates/sim` and `crates/game-wasm` are untouched.
- `web/src/battle/input.ts` and `web/src/shared/camera.ts` are untouched.

## Human Feedback

The screen should show formation-shaped colored markers before any real meshes
exist.
