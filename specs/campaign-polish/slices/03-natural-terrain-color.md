# Natural Terrain Color

## Contract

Natural campaign views read green and alive, not like a brown political overlay.
Faction color mode remains available, but it must not leak into natural review
scenes.

## API Seam

- `packages/game-renderer/src/campaign/mapPass.ts` terrain shader/color grading
- `web/src/campaign/rendererWebGPU.ts` faction-view and terrain upload path
- `web/src/campaign/terrain.ts` canonical terrain field

## Human Review

Compare central Italy natural shots against the previous renderer baseline and
`assets/user-feedback/03-mountains-roads-trees.png`. Land should read as green
Mediterranean terrain with variation, not flat brown.

## Verification

- Keep natural and faction-view captures for the same camera.
- Add crop-level green terrain checks that exclude water, roads, labels, and
  city roofs.
- Do not tune by whole-image similarity score.

## Done

- [ ] Close Rome natural terrain reads green.
- [ ] Central Italy natural terrain reads green.
- [ ] Faction overlay does not alter the natural baseline capture.
