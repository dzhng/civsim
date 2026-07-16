# Slice 05 ownership and refactor audit

## Owners retained

- `packages/game-renderer/src/battle/meadowPalette.ts` remains the sole open-meadow
  hue owner across ground, blades, far turf, and terrain quads.
- `packages/photoreal-renderer/src/battle/groundDetail.ts` remains the single
  photoreal turf contrast and earth-feather amplitude owner. Its former `fiber`
  noise label was renamed `fine`; it is low-amplitude canopy value noise, not a
  synthetic strand or substrate owner.
- Real blade geometry remains the only near-camera fine turf. No baked texture,
  strand ridge, capsule, or analytic substrate-fiber helper survives.
- `WIDE_DETAIL_TERRAIN_STYLE` is retained deliberately. It is selected below
  zoom 1.2 and has independently tuned fleck thresholds, contrast, and aerial
  strength; collapsing it would remove a real distant-minification owner rather
  than deduplicate equivalent constants.
- Remaining private terrain color literals belong to rock, scree, dust, or
  diagnostic bench surfaces. They are categorical non-meadow materials and are
  therefore exempt from the meadow-palette ownership rule.

## Test placement

`groundSurface.test.ui.ts` is DOM-free but intentionally remains in the Vitest
path. It imports the production Three/TSL graph through `groundDetail.ts`; the
Vitest aliases resolve Three's browser exports consistently with Vite. Moving it
to the stripped-TypeScript Node harness would replace that established module
resolution seam without improving the tested ownership boundary. The `.ui.ts`
suffix means “Vite/Vitest renderer test” in this repository, not “DOM test.”

## Rejected paths confirmed absent

Searches across production source find no turf bake lifecycle, substrate texture,
view-aligned ridge, cell-capsule fiber, or alternate meadow palette. Historical
mentions remain only in archived evidence and grass-model experiment names; those
model-family identifiers refer to real grass geometry and are not substrate
owners.
