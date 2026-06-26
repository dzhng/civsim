# 06 — Single GPU-Skinned Soldier

## Contract

One placeholder soldier is skinned in a raw WebGPU vertex shader from baked VAT
data and changes pose under deterministic phase control.

## API Seam

- `packages/webgpu-core/src/skinnedPipeline.ts`
  - pipeline creation and bind group layouts.
- `packages/webgpu-core/src/vatLayout.ts`
  - maps manifest clip/bone/frame data to shader coordinates.
- `packages/soldier-assets/src/soldierMesh.ts`
  - mesh buffers: position, normal, uv, bone indices, weights.

## Playable Deliverable

- `/webgpu/skinned-soldier`
- 3D preview with clip selector, phase slider, faction color toggle, and mask
  overlay.

## Verification

- Scenario screenshots phase A and phase B; pixels inside AABB differ.
- Known vertex/bone fixture deforms to expected position.
- Faction mask tints accent regions, not the whole body.

## Must Stay Green

- No per-character CPU skeletal animation.
- No Babylon/Three runtime renderer dependency.

## Human Feedback

Scrub the clip. The placeholder should visibly walk/attack/hit/death even if
the art is simple.
