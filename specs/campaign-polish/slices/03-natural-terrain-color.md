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

## Status (2026-06-29)

The natural views already read green in hue, but an unbiased `screenshot-critique`
of the bare-grass crops called the color **anemic and flat** — a pale
yellow-olive uniform fill, not living turf. Fixed in `naturalCampaignColor`
(`packages/game-renderer/src/campaign/mapPass.ts`): the grass now reaches green
earlier (`smoothstep(0.16, 0.46, moisture)`), lands on a richer, less-yellow
endpoint, and gains a low-frequency `meadow` term that breaks a wide field into
darker/lusher and lighter sun-bleached patches. Close-Rome greenRatio rose
0.76→0.85; the named terrain-feature crops stayed readable.

The slice-1 `terrainFeatureCropMetrics` mountain floors were recalibrated: the
old `warmStone` classifier counted tan plains as "mountain" (inflating the
crops), so greening the grass dropped the *ratio* without removing a single rock
prop — the mountains in fact read MORE clearly against green (critique-verified).
Floors lowered to the true rock content; the `greenRatio` floor was *raised* to
0.55 to pin the greening.

Re-blessed all natural + faction campaign/fixture baselines; faction view stays a
distinct ownership wash over the greener ground (no leak into the natural
capture). Re-runs at 0 px.

Unbiased before/after `screenshot-critique` (old vs new grass, close + regional +
foothill + full): "clear, substantial upgrade … living, Mediterranean-appropriate
color; natural, organic variation; better readability — ship with confidence."
Mountains and coastline read more clearly, not less. No defects.

## Done

- [x] Close Rome natural terrain reads green.
- [x] Central Italy natural terrain reads green.
- [x] Faction overlay does not alter the natural baseline capture.
- [x] Controlled terrain fixture passes before the real campaign palette is
  accepted.
- [x] A fresh screenshot critique has reviewed the terrain fixture and the real
  Central Italy crop.
