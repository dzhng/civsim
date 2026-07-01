# Slice 5 — Zoom LOD: figures near, banner/base marker far

Keeps the strategic map readable and draw cost bounded once real games have many stacks on
screen. Depends on Slice 4.

## Contract this unlocks

Near zoom shows the animated crowd; zoomed out over the whole map collapses to the banner /
base marker (figures fade/collapse). Draw cost stays bounded regardless of army count.

## API seam

`web/src/campaign/renderer.ts`, in `draw`:
- Gate `buildStackCrowd` emission on a calibrated `cam.scale` threshold (from Slice 0 —
  campaign zoom units differ from battle's `zoom < 1.2`; measure, don't copy). This mirrors
  battle's binary skinned-vs-impostor switch (`renderer.ts:230-243`).
  - **Near:** full mini-crowd + shadow.
  - **Far:** build **zero** crowd instances; draw only the retained
    `buildCampaignStandardMesh` banner + the existing overview markers
    (`campaignMapMarkers`, `renderer.ts:611`).
- Avoid pop: ramp figure count (or a smoothstep fade band) with `cam.scale`, matching the
  existing `campaignPitch` / `campaignPerspective` smoothstep style.
- Optionally refine surviving figures with per-instance tiers via
  `assignCrowdLodsByDistance` + `createPlaceholderSoldierMeshTiers` (`crowd-runtime/lod.ts`),
  but the cheap banner-collapse is the primary bound.

## What the human can run / see

Live campaign: zoom from a single stack out to the whole map — figures collapse to banners;
the overview view is banners/markers only.

## Verification gate

- `web/scenes/campaign/campaign-lod.mjs` at its whole-map / regional / close cameras.
- `campaign-polish-markers.mjs`.
- Perf: `web/scenes/system/full-game-rendering-performance.mjs` — assert a bounded
  instance/draw-call ceiling with many armies at overview zoom.
- **Visual slice — required:**
  [screenshot-critique](../../../.claude/skills/screenshot-critique/SKILL.md) at three zoom
  bands (close / mid / overview) to confirm the collapse reads cleanly and doesn't pop.

## Review checkpoint (non-blocking)

Open the three-band captures for David with
[preview-shots](../../../.claude/skills/preview-shots/SKILL.md); ~5 min. If silent, accept
on the evidence, record the chosen thresholds, close Preview, proceed.

## What must stay green

Slice 4's close-zoom look; battle untouched; campaign contract.

## Feedback that would change this slice

The near/far thresholds and the fade band width are the knobs. If David wants figures
visible further out (at a perf cost) or a harder cut, tune here.
