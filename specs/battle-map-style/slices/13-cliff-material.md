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

## Landed (2026-07-05)

- Slope-driven rock response in terrainLayer.ts, single-sourced with the
  generator: `generated_map_descriptor()` exports SlopeBands; the shader
  compares mesh normal.z via `normal.z = 1/sqrt(1+slope^2)` against the same
  Rust thresholds. Hand maps untouched (no slopeBands -> old path;
  byte-identity test green).
- Look: fracture-first rock (vertical fbm streaks) with faint noise-varied
  strata, scree pebble flecks, green bench creep. The first striation pass
  (evenly spaced elevation bands) was REJECTED by the unprimed critique as a
  topo-map read and replaced - recorded so nobody reintroduces contour bands.
- Orchestrator review fixes: the wall camera aimed inside the wall (scree
  top-down) - re-aimed from the corridor; env-id predicate hit the slice-00
  stats trap again; exact float equality on f32-roundtripped SlopeBands
  replaced with epsilon; luma is not a valid wall-vs-grass signal (haze
  lifts the far wall) and hue classification needs directional light - ratio
  checks run under golden, overcast keeps snapshot evidence.
- Known remaining artifice at the wall (unprimed critique): the legacy
  horizon-blocker spikes/triangles behind and through the ridge - slice 14's
  replacement target; and grid-quantized tint borders at the rock/grass
  seams - candidate polish for 14/17.

## Feedback that would change it

Striation scale/color taste — parameters. "The cliffs need to be taller" is a
slice-02 recipe change or slice-14 evidence, never a material hack.

## Landed (2026-07-05) — BMS13-SLICE-C2E5

- `generated_map_descriptor()` now exports the generator's `SlopeBands`
  (`flatMax=0.035`, `rollingMax=0.115`, `slowMin=0.135`,
  `cliffMin=0.32`, `cliffDilateCells=6`, `highlandCapMinM=35`) alongside the
  existing seed/cover/relief/hash descriptor. Production and renderer-lab pass
  those bands only for generated maps; hand maps do not opt into the new
  slope-rock response.
- `terrainLayer.ts` maps the true-meter ground normal back to the Rust slope
  semantics with `normal.z = 1 / sqrt(1 + slope^2)`. Generated maps arrive at
  the photoreal world with reliefScale 1.0 after the temporary hand-map
  exaggeration seam, so this comparison is in the same units as
  `passability::slope_field`.
- The material remains TSL-only and texture-free: height-banded striation uses
  deterministic `fbm`/`fract` over `position.z`, scree uses hashed pebble
  flecks, and bench creep uses low-slope normal bands plus seeded noise. No
  `time` node and no material-local fog/desaturation.
- `web/scenes/battle/battle-genmap-cliff.mjs` boots
  `/renderer/photoreal-battle?map=gen&seed=7` under both `golden-hour` and
  `overcast-foggy`, at a close west-wall orbit and the locked vista, snaps the
  west-wall crop for each, and compares wall-vs-corridor luma/rock/green
  ratios.

ORCHESTRATOR-TODO: run GPU browser capture, bless the four new crops, inspect
the actual PNGs, and run unprimed screenshot-critique as the final visual
acceptance step.
