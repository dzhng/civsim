# Per-Class VATs And Clip Tables

## Contract

Each soldier class can carry its own baked VAT and its own clip-frame table.
Distinct skeletons, distinct clip durations, and distinct silhouettes are
representable instead of one global placeholder VAT shared by all 15 classes.

## Why

Gaps from the gap review:

- `placeholders.ts:4` hardcodes one `human-placeholder.vat.json`;
  `skinnedPipeline.ts:113` takes one `vat: VatBake`; `renderer.ts:245`
  loads it once for every instance. `groupInstances()` (`skinnedPipeline.ts:199-206`)
  routes by `classId` but every class shares `this.layout`. `archetype.skeleton`
  is never consulted.
- Clip frames are global constants (`animationState.ts:17-23`);
  `resolveVatClip()` takes no `classId` (`vatLayout.ts:26-28`);
  `skinnedPipeline.ts:222` uses one global layout — different skeletons cannot
  have different clip durations.
- All 7 clips are synthetic hardcoded bone rotations
  (`soldier-placeholders.mjs:41-74`).

## API Seam

- `packages/soldier-assets/src/placeholders.ts` + a manifest — a
  `classId → VatBake` registry (URL per class), still defaulting to the shared
  placeholder where a class has no dedicated bake yet.
- `packages/renderer-core/src/skinnedPipeline.ts` — hold a per-class VAT bind group
  + layout keyed by `classId`; `groupInstances()` selects the right VAT/layout
  per group. One pipeline, per-class resources.
- `packages/renderer-core/src/vatLayout.ts` — `resolveVatClip(layout, classId,
  clip, t)` so clip tables are per-class.
- `packages/crowd-runtime/src/animationState.ts` — per-class frame tables instead
  of global `FRAME_*` constants.
- `web/src/battle/renderer.ts` — load the per-class registry instead of a
  single VAT.

## Human Review

Run the soldier gates. Each class is driven by its own VAT/clip table; a class
given a distinct placeholder skeleton reads differently from its neighbors.
Classes without a dedicated bake fall back to the shared placeholder with no
regression.

## Verification

- Soldier-gate harness renders each class through its per-class VAT; assert the
  selected `classId` resolves to the registered bake (or the documented
  fallback).
- Clip-table test: two classes with different clip durations animate at their own
  rates from the same frame input.
- Fallback test: a class with no dedicated bake still renders via the shared
  placeholder.

## What Must Stay Green

- Default render stability for any class still on the shared placeholder.
- `skinnedPipeline` instancing/perf — per-class grouping must not regress the
  crowd-scale frame budget (still one pipeline, grouped draws).

## Feedback That Would Change This Slice

- Whether classes share one humanoid skeleton (clip-table-only divergence) or
  need genuinely distinct skeletons/bone counts.
- Whether the registry is static config or data-driven from the archetype table.
