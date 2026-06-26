# 08 — LOD, Impostors, And Sprite Fallback

## Contract

The renderer chooses the cheapest readable representation per distance/zoom:
near skinned mesh, cheaper mid mesh, impostor, then strategic sprite.

## API Seam

- `packages/crowd-runtime/src/lod.ts`
  - pure CPU reference assignment for tests.
- `packages/crowd-runtime/src/lodCompute.ts`
  - GPU cull/LOD compaction once the CPU reference is locked.
- `packages/crowd-runtime/src/impostors.ts`
  - generated placeholder impostor atlas and renderer.

## Playable Deliverable

- `/webgpu/lod`
- Slider for zoom/distance bands, overlay for L0/L1/L2/L3 counts, and forced
  LOD mode for review screenshots.

## Verification

- CPU LOD assignment unit tests.
- GPU counts match CPU reference for fixed camera/fixture.
- Screenshot checks near faction detail and far team readability.
- Transition screenshots are reviewed for unacceptable popping.

## Must Stay Green

- Existing 2D atlas remains available as L3.
- `?debug=blocks` still bypasses the skinned pipeline for vibe baselines.

## Human Feedback

Review whether transitions are tactically readable before chasing final beauty.
