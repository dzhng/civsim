# LOD Mesh Tiers

## Contract

Soldiers render through real LOD mesh tiers (L0 full mesh, L1 reduced, L2/L3
impostor) selected per instance by camera distance, instead of a binary
full-mesh / impostor switch. Crowd-scale frame cost drops at zoom-out without a
visible pop at battle distances.

## Why

Gaps from the gap review:

- `assignCrowdLods()` (`lod.ts:36`) computes levels but is only called in lab
  routes; `CrowdInstance` has no `lod` field; `groupInstances()` groups by class
  only. Battle is a binary switch — `rendererWebGPU.ts:109`: zoom < 1.2 → L3
  impostor, else L0 mesh. No L1/L2.
- `ART_CONTRACT.md:101-102` requires L0 + L1 minimum.

## API Seam

- `packages/crowd-runtime/src/instanceData.ts` — add an `lod` field to
  `CrowdInstance`; `buildCrowdInstances()` or a dedicated pass calls
  `assignCrowdLods()` in the production battle path, not just the lab.
- `packages/crowd-runtime/src/lod.ts` — define the tier thresholds (L0/L1/L2/L3)
  and hysteresis to avoid flicker at boundaries.
- `packages/soldier-assets/` — reduced-tri L1 (and L2) mesh variants per class,
  baked alongside L0; impostor stays the farthest tier.
- `packages/webgpu-core/src/skinnedPipeline.ts` — `groupInstances()` groups by
  `(classId, lod)`; draw the matching mesh per group.
- `web/src/battle/rendererWebGPU.ts` — replace the binary zoom switch with the
  per-instance LOD selection.

## Human Review

Zoom sweep on a large battle: soldiers swap L0→L1→L2→impostor smoothly with no
visible pop at gameplay distances. A perf probe shows draw cost dropping as the
crowd moves to coarser tiers. At max zoom-in, foreground soldiers are full L0.

## Verification

- LOD-assignment test: instances bin to expected tiers by distance, with
  hysteresis preventing per-frame flips at thresholds.
- Crowd-scale perf probe: frame cost at zoomed-out battle is meaningfully below
  the all-L0 cost and within budget.
- Pop check: screenshot crops at tier boundaries show acceptable silhouette
  continuity.

## What Must Stay Green

- Battle scene gates and the crowd-scale frame budget.
- Existing impostor path (it becomes the farthest tier, not removed).

## Feedback That Would Change This Slice

- How many tiers are worth maintaining (L0+L1+impostor minimum vs. full L0–L3).
- Tier distances tuned to the real battle camera, judged on screenshots not
  numbers.
