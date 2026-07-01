# Slice 0 — SPIKE (throwaway): campaign mini-crowd on the real map

**This slice is deleted before the feature ships.** Its only job is to buy certainty
about the seams before we commit to the refactor. Write it fast and disposable; do not
add committed gates or baselines.

## Contract this unlocks

Confidence that a `SkinnedCrowdPipeline` mini-crowd renders correctly and cheaply on the
real campaign map — enough to lock the Slice 1 depth design and the Slice 4 faction
approach.

## What to do

Behind a query flag (mirror battle's `blockMode` pattern) or a scratch renderer-lab
route (`/renderer/campaign-crowd-spike` in `apps/renderer-lab/src/router.ts`):

- Boot a campaign shell/camera; load the placeholder kit + VATs + meshes with the same
  loaders battle uses (`loadPlaceholderKit`, `loadClassVats`, `createPlaceholderSoldierMeshes`).
- Construct a `SkinnedCrowdPipeline` against the **campaign** shell. Temporarily hack the
  WGSL depth call to `civsimCampaignWorldDepth3d` (or add the Slice 1 param early) to see
  the corrected sort.
- Draw ~6–8 hardcoded `CrowdInstance` per army at a few real stack positions, seated via
  `field.heightAt` / `this.surface.heightAt`, animation phase from the campaign clock.
- Also instantiate the (still-in-place) shadow pass with campaign depth to eyeball the
  grounding decal.

## What the human can run / see

The spike route or `?spike=crowd` on the live campaign — animated figures on a real map
(e.g. Italy) at close zoom, plus a mid-zoom capture.

## Unknowns this must resolve (write the answers into the README)

1. **Depth:** does battle depth visibly mis-sort figures vs city/mountains? (Confirms
   Slice 1 and its design: surgical `worldDepthFn` param vs camera-uniform depth profile.)
2. **Faction:** does friend/foe/neutral two-tone read acceptably on a multi-faction map,
   or is per-instance RGB livery required (stride change)?
3. **Perf:** instances = armies × figure-count across a full fogged map — is draw cost
   bounded? Should per-stack layout be cached and only re-phased each frame?
4. **Seating:** figures sit on relief without float/sink (campaign relief is raw, no
   `RELIEF_EXAGGERATION`); which height sampler matches the surface mesh.
5. **Zoom band:** the `cam.scale` value where figures should collapse to the banner.
6. **Class mapping:** do `unitsByClass` indices map 1:1 to placeholder looks or need
   `modelLookForClass` clamping?

## Verification

Manual [screenshot-critique](../../../.claude/skills/screenshot-critique/SKILL.md) for a
sanity second opinion, plus a jotted perf number from `stats()` / `performance.now()`.
**No committed baseline** — throwaway.

## Review checkpoint (non-blocking)

Open the spike captures for David with
[preview-shots](../../../.claude/skills/preview-shots/SKILL.md); give ~5 min. If silent,
record the spike's findings in the README, close the Preview windows, and proceed to
Slice 1 on the evidence.

## What must stay green

Nothing committed changes — the spike is additive and thrown away. Do **not** modify the
battle renderer in this slice.

## Feedback that would change this slice

If David wants a different figure silhouette, count, or a fundamentally different
campaign look (e.g. keep an abstract marker after all), that surfaces here — cheaply,
before the refactor.
