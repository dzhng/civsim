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

**Primary — separate photoreal coverage attributes:** preserve `BattleGroundMesh.vertices`
at its existing stride 10 so the bespoke renderer remains byte-identical. Alongside the
already-separate photoreal `tint` attribute, add box-filtered `mudCoverage` and
`roadCoverage` arrays (using the exact existing `gWater` kernel) plus an un-premixed
`surfaceColor` array. Two coverages are required because mud and classified road have
different albedos and only mud owns churn. The fragment shader composes the appropriate
`MEADOW.earth` albedo with
`coverage = smoothstep(0.5−f, 0.5+f, sourceCoverage + centeredFbm(world·~1.5)·±0.25)` —
thresholding a smooth field with centered noise yields thin 1–2 m fingers even from an
8 m ramp. Turf strength modulates through the same combined earth coverage for the spill.

**Escalation (recorded, only if the measured-width probe fails):** CPU signed-distance
field built once per terrain load from the tint grid, uploaded as one compact filterable
texture, sampled in world space. A mechanical widening, not a redesign.

Hazards owned in the same commit:
- **Legacy isolation:** `GROUND_WGSL` consumes only the existing stride-10 interleaved
  buffer. Do not change its layout, upload, or reconstructed color; its baselines and a
  byte-equality mesh test are the zero-diff gate for this slice.
- **Churn coupling:** churn (terrainLayer.ts:495–508) keys off `color.r − color.g` of the
  pre-mixed color. Re-key it to an interior-only mud mask derived from `mudCoverage`, not
  the feathered visual coverage and never combined mud+road coverage.
- **Road-vs-scree classifier:** the cosmetic road is tint 6 + rough 0.0 + speed 1.0
  (battlegen.rs:270); real scree is tint 6 with high rough / low speed. Thread `rough`
  (and `speed` if needed) through the existing wasm pointers → `setTerrain()` handoff
  (read-only; no sim change), classify
  `road = tint===6 && rough<=0.05 && speed>=0.95` (epsilon-aware), pin thresholds against
  battlegen fixtures in a unit test. This includes the authored road and bridge while
  excluding every reconned scree/hill tuple. Missing fields classify as not-road. If it
  does not pin cleanly, feather mud only and record roads as follow-up — do not guess.

Feather width, warp amplitude, and spill strength are `TURF_CONTRAST.edge` entries
(groundDetail.ts stays the constants owner; `coverEdgeNode` lives there).

## Runnable artifact

The generated browser fixture does **not** contain the campaign-only cosmetic road. Add a
lab-only synthetic terrain override with separated mud, road, and scree control regions;
do not mutate campaign/sim data. Shots: `ground-turf/dirt-edge.png` (close-mid crop on the grass↔mud
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

## Result — ACCEPT (2026-07-16)

The primary vertex-coverage mechanism was visually **KILLED** despite passing its scalar
probe: it exposed 4/8 m facets and a false categorical-tint halo. The pre-declared SDF
escalation shipped instead. One terrain-load RG8 field carries earth-union and classified
road distance; the playable ground samples it once and vista does not sample it.

Measured widths are 1.747 m mud and 1.431/1.142 m road, with zero detached islands. Fresh
unprimed critique accepted dirt close, road close, and the wide road+scree control. The
30k Apple/Metal gate passed at 25.13/24.77 ms median GPU. See
`../reports/slice04-visual-gate.md`, `../reports/slice04-change-ledger.md`, and
`../reports/perf-after-slice04.json`.
