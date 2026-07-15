# 04 — feathered earth edges

**Visual variable:** edge character of grass↔earth seams (measured width, breakup, spill).
Open-meadow contrast and strand look frozen — a moved open-meadow baseline means the mask
leaks and fails the slice. Mud interior churn, rock/scree slopes, water shoreline: out of scope.
**Depends on:** 03 (judged over the turf layer; spill uses `turfDetailNode`). 01 supplies
`MEADOW.earth`.

## Contract unlocked

Grass↔earth seams (mud tint 5; the cosmetic road where the classifier pins it) dissolve
over a measured ~1–2 m with noise-modulated, non-grid-aligned edges, and strand detail
spills slightly onto the earth side (albedo only — the reference's tuft-spill read without
touching blade geometry). One coverage mechanism owns all earthy-tint edges; future road
decals consume this seam.

## The mechanism (and its pre-declared escalation ladder)

Today `buildBattleGroundMesh` box-filters tints into vertex colors at ~8 m vertex spacing —
an un-noised grid-aligned airbrush the shader cannot un-mix.

**Primary — `gEarth` scalar vertex attribute:** `buildBattleGroundMesh` grows one
interleaved float: the box-filtered earth fraction (exactly the existing `gWater` pattern,
groundPass.ts:261–273), and stops pre-mixing earth tints into vertex color. The fragment
shader composes earth albedo from `MEADOW.earth` with
`coverage = smoothstep(0.5−f, 0.5+f, gEarth + fbm(world·~1.5)·±0.25)` — thresholding a
smooth field with noise yields thin 1–2 m fingers even from an 8 m ramp. Turf strength
modulates through the same coverage for the spill.

**Escalation (recorded, only if the measured-width probe fails):** CPU signed-distance
field built once per terrain load from the tint grid, uploaded as one compact filterable
texture, sampled in world space. A mechanical widening, not a redesign.

Hazards owned in the same commit:
- **Stride 10 → 11 is shared** with the legacy bespoke `GROUND_WGSL` pass: update its
  vertex layout AND reproduce the old pre-mix in its shader from `gEarth` — its baselines
  are a zero-diff gate for this slice.
- **Churn coupling:** churn (terrainLayer.ts:495–508) keys off `color.r − color.g` of the
  PRE-MIXED color; with mud un-mixed its input moves. Re-key churn's earth detection off
  `gEarth` — one owner for "is this earth" instead of a color heuristic.
- **Road-vs-scree classifier:** the cosmetic road is tint 6 + rough 0.0 + speed 1.0
  (battlegen.rs:270); real scree is tint 6 with high rough / low speed. Thread `rough`
  (and `speed` if needed) through the existing wasm pointers → `setTerrain()` handoff
  (read-only; no sim change), classify
  `road = tint===6 && rough<=ROAD_ROUGH_MAX && speed>=ROAD_SPEED_MIN`, pin thresholds
  against battlegen fixtures in a unit test. If it does not pin cleanly, feather mud only
  and record roads as follow-up — do not guess thresholds.

Feather width, warp amplitude, and spill strength are `TURF_CONTRAST.edge` entries
(groundDetail.ts stays the constants owner; `coverEdgeNode` lives there).

## Runnable artifact

`battle-ground-turf.mjs` fixture already contains a mud patch and the cosmetic road; add a
scree control region. Shots: `ground-turf/dirt-edge.png` (close-mid crop on the grass↔mud
seam), `ground-turf/road-edge.png` (RTS + close road crops, scree control in frame), and a
world-meter ruler case for the width probe.

## Verification

- Measured width: median 10%→90% coverage transition within [1.0, 2.0] m on both road
  sides and representative mud edges; no 4/8 m stair-step signature; no one-pixel dark halo;
  noise displacement stays within its declared bound (no detached islands).
- **compare-screenshots**: `dirt-edge.png` vs `assets/ref-dirt-edge.png` — edge character
  ONLY (their tuft geometry and brown hue are non-targets); and vs 03's accepted shots
  (open meadow must be near-identical).
- **screenshot-critique** (unprimed) on the edge shots — last check before blessing.
- Bespoke-renderer baselines zero-diff (the stride gate). Blade record count/hash and
  blocked-tint behavior unchanged (mud still blocks blades; eligibility untouched). Scree
  keeps its current hard treatment.
- Cargo untouched — tint/rough/speed/height bytes and semantics unchanged; sim reads none
  of the new render fields.
- Re-bless wave expected SMALL (only scenes framing mud/road boundaries — enumerate from
  the genmap catalog); a broad-field shot that moves is a bug, not a re-bless.
- Perf spot-check (one more fbm + one attribute); campaign byte-identical.
- Non-blocking preview-shots checkpoint (~5 min): does the seam look bitten-into by turf
  rather than airbrushed?

## Stays green

Water shore blend (`gWater` untouched), slope branches, churn interior look, campaign,
grass-width contract, all of 02/03's accepted telemetry on open meadow.

## Feedback that changes this slice

- "Too airbrushed" → narrow/roughen the band (within [1,2] m); "still cut out" → widen.
- "Road became scree" (or vice versa) → classifier thresholds, not the feather.
- "Real tufts spilling over the edge" (geometry, not albedo) → separately approved slice;
  it touches the sacred blade contract and is NOT this feature.
- Measured width unreachable from the vertex ramp → the SDF escalation, recorded.
