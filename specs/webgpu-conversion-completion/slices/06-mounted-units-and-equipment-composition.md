# Mounted Units And Equipment Composition

## Contract

Mounted units are a real horse skeleton with a rider composed on top, and
equipment pieces (shield, weapon, helmet) are composable per archetype instead of
fused into one box mesh. Cavalry stops being a single fused human skeleton.

## Why

Gaps from the gap review:

- Only one VAT per pipeline (`skinnedPipeline.ts:113`); `archetype.mount` is never
  read; `CrowdInstance` has no mount fields (`instanceData.ts:15-26`);
  `horse-placeholder` is a 1-bone stub never rendered
  (`soldier-placeholders.mjs:96`); cavalry meshes fold horse+rider into the human
  skeleton (`soldierMesh.ts:93-111`). LOD scale also misses cavalry class 14
  (`lod.ts:38` only scales 6,7).
- Equipment is packed into one buffer (`soldierMesh.ts:112`) and drawn in one call
  (`skinnedPipeline.ts:161`); `pieces:string[]` (`schema.ts:31`) is only validated
  non-empty (`validate.ts:70`), never used for per-piece draw/tint.

## API Seam

- `packages/soldier-assets/` — a real baked horse VAT/skeleton; rider VAT composes
  onto a mount attachment bone. Builds on slice 04's per-class VAT registry and
  slice 03's importer.
- `packages/crowd-runtime/src/instanceData.ts` — add mount fields to
  `CrowdInstance`; `buildCrowdInstances()` populates them from `archetype.mount`.
- `packages/webgpu-core/src/skinnedPipeline.ts` — render mount + rider as composed
  skeletons (two VATs / a combined rig) sharing one instance transform; optional
  per-piece draw ranges driven by `pieces`.
- `packages/crowd-runtime/src/lod.ts` — include cavalry class 14 (and any other
  mounted class) in LOD scaling.

## Human Review

Mounted-unit gate: cavalry reads as horse + rider, the rider seated on the mount,
both animating coherently — not a fused box. Equipment (shield/weapon/helmet)
reads as distinct pieces with correct placement. Class-14 cavalry scales with LOD
like classes 6 and 7.

## Verification

- Mounted-class gate crops at turntable + ingame angles; re-bless once.
- LOD scaling test covers every mounted class (6, 7, 14, …), not just 6/7.
- Composition test: rider transform follows the mount attachment bone across the
  ride cycle.

## What Must Stay Green

- Sim-driven positions/facing for cavalry are unchanged (render-only composition;
  no change to `pick_unit` or sim).
- Crowd-scale perf with the extra mount draws.

## Feedback That Would Change This Slice

- One combined horse+rider rig vs. two composed skeletons (simplicity vs.
  reuse/animation flexibility).
- Whether per-piece equipment draw is needed now or deferred (mask-tint may
  suffice for accents — see slice 05).
