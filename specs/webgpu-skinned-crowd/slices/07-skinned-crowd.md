# 07 — Skinned Crowd

## Contract

Thousands of placeholder soldiers render through batched raw WebGPU draw calls
using shared mesh/VAT resources and compact instance data.

## API Seam

- `packages/crowd-runtime/src/crowdRenderer.ts`
  - `uploadCrowdInstances(instances)`
  - `drawCrowd(pass, view)`
  - `stats(): CrowdRenderStats`
- One draw family per `(LOD, archetype/material)` where possible.

## Playable Deliverable

- `/webgpu/skinned-crowd`
- Crowd controls: count, formation shape, clip override, faction palette,
  phase freeze/advance.

## Verification

- Scenario renders 2k placeholder skinned soldiers.
- Animation phase change produces measurable pixel difference.
- Stats expose instance counts and draw counts.
- Screenshot verifies both player and enemy accent colors.

## Must Stay Green

- Frozen snapshots remain deterministic.
- Existing DOM battle UI is not required for this isolated lab route.

## Human Feedback

This checkpoint answers: does the crowd read as living troops at scale before
real battle integration?
