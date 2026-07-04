# 13 — Cliff material

Steep terrain reads as layered rock of the reference family — striated faces,
green creep on benches — without touching the landform.

## Contract unlocked

The in-grid flank walls stop reading as gray clay; the slope-responsive
material family exists for the vista backdrop (14) to reuse.

## API seam

- TSL material extension in `packages/photoreal-renderer/src/battle/terrainLayer.ts`:
  slope/height-masked rock response — dark striated albedo on steep faces,
  scree grading at the foot, grass/moss creep onto low-slope benches.
- **Single-sourced slope semantics:** the material's rock threshold derives
  from the same `SlopeBands` values the generator uses (exported through the
  descriptor or a shared constant), so visual rock and gameplay cliff cannot
  drift — the salvage recorded exactly this drift as a bug.
- Neutral albedos; all mood from the environment (aesthetics law). Distance
  desaturation only via the aerial owner.

## Human can run

The vista route on a fixed generated seed; a close orbit of the west wall.

## Verification

- Judged crop: the `flank-cliff` bands from slice 00 only.
  compare-screenshots against the reference's cliff band; screenshot-critique
  unprimed last.
- Both lighting presets: the same material must read under
  `battle-overcast-highland` *and* `golden-hour` (materials are shared;
  prove it).
- perf:30k stays green (texture/shader cost).
- **Out of scope wrongness:** silhouette scale/height (landform, slice 02 /
  vista, slice 14), grass, water, haze depth.

## Stays green

Landform verdict (no reshaping heights to flatter the material), grass gates,
tripwires.

## Feedback that would change it

Striation scale/color taste — parameters. "The cliffs need to be taller" is a
slice-02 recipe change or slice-14 evidence, never a material hack.
