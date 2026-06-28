# 06 — Single GPU-Skinned Soldier

## Contract

One placeholder soldier is skinned in a raw WebGPU vertex shader from baked VAT
data and changes pose under deterministic phase control.

Current checkpoint: the placeholder has been split into 15 procedural
class-look meshes that reuse the old class vocabulary for armor, helmets,
shields, weapons, mounted silhouettes, and faction accents. The skinned WebGPU
pipeline batches instances by class mesh so production battle rendering and the
model-gate screenshots exercise the same path.

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
- `VERIFY_WEBGPU=1 node scene.mjs webgpu-soldier-gates` writes individual
  class turntable PNGs, battle-camera readability PNGs, and deterministic
  animation stills under
  `specs/webgpu-skinned-crowd/visualizations/soldier-gates/`.
- Known vertex/bone fixture deforms to expected position.
- Faction mask tints accent regions, not the whole body.

## Must Stay Green

- No per-character CPU skeletal animation.
- No Babylon/Three runtime renderer dependency.

## Human Feedback

Scrub the clip. The placeholder should visibly walk/attack/hit/death even if
the art is simple.
