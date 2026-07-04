# Slice 14 - foreground dense grass band

## Contract

Bring the already-better close grass foundation into the battle heightmap route
so the lower foreground reads as dense, rooted green/olive grass.

This parent slice is split because the first foundation pass was not enough:
`14a-foreground-grass-foundation.md` proved terrain-owned field grass plumbing,
while `14b-foreground-blade-legibility.md` hardened the close-blade diagnostic
surface. For the current style-family direction, the existing field-owned grass
stack is accepted as the foreground foundation; do not keep restarting grass
architecture before composing the rest of the scene.

## Slice Variable

Foreground close grass.

- **Judge:** lower foreground density, blade/body readability, rooting, green
  color family, and slope/cliff exclusion.
- **Do not judge:** midground LOD softness, cliff height, fog, or full-frame
  composition.

## Architecture

- Start from the proven field-owned close-grass work in this branch; do not
  begin by inventing a new grass primitive. The relevant machinery is
  `sampleGrassField`, `BattleGroundPass.setMeadowFromGrassField`,
  `BattleGrassPass.setGrassFieldSnapshot`, the field-fiber/body/strand
  candidates, and `apps/renderer-lab/src/falseEarthCloseGrass.ts`.
- Treat texture-carrier as a baseline/control only. It proves terrain ownership
  and dense record plumbing, but it is not the active visual target for this
  slice because it reads as speckled/carpet grass at the review camera.
- Promote/reuse the useful architecture on the battle heightmap route:
  camera-relative close density, terrain-normal/slope eligibility, packed
  records where appropriate, field-owned body/root coverage, and blade-owned
  material variation.
- Convert any red/pink False Earth debug palette into the shared battle
  green/olive palette. Mood must come from environment/fog, not grass albedo
  hacks.
- Keep grass terrain-owned: no grass on cliff/rock cells, no separate floor
  sheet, no backdrop grass cards.
- Keep performance explicit. If the close grass is too expensive, reslice into a
  perf/LOD sub-slice instead of lowering visual density blindly.

## Review Surface

- Lower foreground crop from the Slice 12b horizon-band camera, proving the
  final composition route uses the selected field-owned close grass stack.
- Close-grass workbench crop using the same battle terrain data, proving blade
  geometry/rooting at a camera distance where blades are legible.
- Texture-carrier/grass-off controls only to show the selected stack is an
  improvement, not as acceptance targets.

## Current Split

- **14a done:** heightmap route can run the shared field grass stack with
  terrain masking, meadow/root body, one draw call, and texture-carrier as a
  useful plumbing/density control.
- **14b parked as diagnostic polish:** the close heightmap camera gate remains
  useful for future foreground polish, but it no longer blocks Slice 15. The
  horizon-band shot should now carry the best field-owned grass forward as the
  foreground band while midground LOD and fog are built.

## Verification

- Publish close-grass telemetry: generated records, visible/culled records,
  draw calls, submitted triangles, slope-rejected records, camera-relative
  radius, and projected blade height.
- Use
  [compare-screenshots](../../.agents/skills/compare-screenshots/SKILL.md)
  against the perspective reference lower foreground and the current band shot
  for density/color family only.
- Run
  [screenshot-critique](../../.agents/skills/screenshot-critique/SKILL.md)
  scoped to close grass density, rooting, and color.
- Keep existing terrain/passability gates green.

## Accept / Reject

Accept if the foreground reads as dense grass at the review camera, with the
False Earth-quality close density adapted to battle colors and terrain masks.

Reject if the result is sparse yellow specks, flat stippled/carpet grass,
red/pink debug grass, grass on cliffs, or a brand-new primitive that bypasses
the existing field-owned grass stack.

## Next

Continue to `15-midground-grass-lod-collapse.md`. Return to
`14b-foreground-blade-legibility.md` only if the composed scene still fails
foreground grass readability after midground LOD and fog are in place.
