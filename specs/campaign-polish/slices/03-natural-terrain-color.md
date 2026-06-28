# Natural Terrain Color

## Contract

Natural campaign views read green and alive, not like a brown political overlay.
Faction color mode remains available, but it must not leak into natural review
scenes. The palette must be judged first on controlled terrain fixtures, then on
the real Central Italy camera.

## API Seam

- `packages/game-renderer/src/campaign/mapPass.ts` terrain shader/color grading
- `web/src/campaign/rendererWebGPU.ts` faction-view and terrain upload path
- `web/src/campaign/terrain.ts` canonical terrain field
- a natural-terrain fixture scene with land, shoreline, road, city, and faction
  overlay toggles using fixed camera/light

## Human Review

Compare central Italy natural shots against the previous renderer baseline and
`assets/user-feedback/03-mountains-roads-trees.png`. Land should read as green
Mediterranean terrain with variation, not flat brown.

Before the full campaign pass, inspect the fixture scene with faction overlays
off and on. The natural view should be green without losing road/city contrast;
the faction view may tint the land but must not become the natural baseline.

## Verification

- Keep natural and faction-view captures for the same camera.
- Add crop-level green terrain checks that exclude water, roads, labels, and
  city roofs.
- Do not tune by whole-image similarity score.
- Run screenshot critique on the controlled swatch and Central Italy crop; ask
  for visible color/readability defects, not a numeric similarity judgment.

## Done

- [ ] Close Rome natural terrain reads green.
- [ ] Central Italy natural terrain reads green.
- [ ] Faction overlay does not alter the natural baseline capture.
- [ ] Controlled terrain fixture passes before the real campaign palette is
  accepted.
- [ ] A fresh screenshot critique has reviewed the terrain fixture and the real
  Central Italy crop.
