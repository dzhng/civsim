# 11 — Grass battle integration: swap and delete

The ratified blade field becomes THE production grass — landing on all maps
(hand and generated), with the old tuft path deleted in the same slice.

## Contract unlocked

One grass render owner in production. The single most visible style upgrade
ships repo-wide, independent of the generator track.

## API seam

- `PhotorealBattleWorld` consumes the slice-10 blade layer wherever it
  consumed `PhotorealGrassField`; the tuft path (and its
  `buildBattleTerrainGrass` render-side plumbing) is **deleted in this
  slice** — no parallel grass abstractions, no long-lived flag. If perf fails,
  the slice does not land; that is the rollback.
- Wind unbaked: Bézier control-point perturbation driven by the **owned time
  uniform** (TSL `time` node is banned). Snapshots stay deterministic (scenes
  pin time); motion reviewed as a short GIF (write-anim pattern).
- Grass eligibility keeps coming from the data owner (`sampleGrassField`:
  tint/slope/water masks) — cliffs, rock, water, and forest-belt cells grow
  nothing.

## Human can run

Any battle. The judged surfaces: the slice-00 vista camera on a hand map and
on a fixed generated seed.

## Verification

- Judged crops: `near-grass` band at the vista (integration: mass, rooting,
  no speckle/shimmer — blades ≈4.5 px here, *never* ratified individually)
  and the close gate (must still pass slice 10's oracle).
- **`perf:30k` green on hardware** — this is the slice's hard gate.
- `battle-terrain-elevation` tripwire green; battle baselines re-blessed
  deliberately (this changes every battle shot — expected).
- Wind GIF human checkpoint (non-blocking, preview-shots): rhythm reads as
  wind, not jelly.
- screenshot-critique on the vista frame; compare-screenshots against the
  pre-swap baseline for a less-wrong verdict (the tuft look is the thing being
  beaten).
- **Out of scope wrongness:** cliff material, water, haze, LOD budget tuning
  beyond what perf demands (slice 12 owns budget hardening).

## Stays green

perf:30k, elevation tripwire, all cargo, all non-battle scenes.

## Code-landed (2026-07-05) — BMS11-SLICE-E9C4

- `PhotorealBattleWorld` now creates `PhotorealBladeFieldLayer` as the
  production grass render owner. The layer receives packed records from
  `sampleGrassField` using the slice-10 accepted profile: width 0.13, height
  1.25, density 0.8, 40k record cap, heightJitter 0.5, bend 0.45/0.35,
  fieldCell 0.42, snap 8, clump 1.55, minNormalZ 0.45. The record window
  follows the snapped battle camera focus at the old grass refresh cadence;
  GPU LOD routing runs every render from the live ground focus.
- The render-side tuft path in `photoreal-renderer` is deleted:
  `PhotorealGrassField`, its `buildBattleTerrainGrass` consumption, and the
  `foliageLayer.ts` GRASS_WGSL-derived material port are gone. `foliageLayer`
  now owns scenery only. `game-renderer` grass data/legacy lab routes remain.
- Wind is unbaked. Blade sway reads the world-owned `PhotorealWorld.uTime`
  uniform through `BattleFrameUniforms.time`; the TSL `time` node remains
  banned. Sway is a small wind-direction offset (phase speed 0.82,
  spatial scales 0.035/0.021, tip amplitude 0.034 m).
- `terrain.grass` now publishes blade-field stats plus data-owner sample stats
  (`acceptedRecords`, rejected tint/slope cells, packed stride/bytes). Old
  production tuft fields (`tuftInstances`, `bladeInstances`) no longer exist
  on the photoreal battle stats path.

ORCHESTRATOR-TODO: run battle scenes; capture vista + close-gate crops;
re-bless battle baselines deliberately; run `perf:30k` on hardware; run the
`battle-terrain-elevation` tripwire; capture/review the wind GIF.

## Landed (2026-07-05) — production grass is the blade field

- `PhotorealBattleWorld` owns a `PhotorealBladeFieldLayer` with a production
  tier envelope (8/30/150 m) and edge fade ON; the ratified close-lab
  envelope (5/20/64 m, no fade) stays the layer default. Records refresh on
  the snapped-focus cadence from `sampleGrassField`; `routeGpu` runs per
  frame. Tuft render path deleted (foliageLayer 311→146 lines; scenery
  stays); wind rides `PhotorealWorld.uTime` (no TSL time node).
- **Integration findings (orchestrator review):**
  - The scenes' `?only=` filters select grass by the `battle-grass` name
    prefix — the blade meshes inherit it (`battle-grass-blades-*`). The
    original `battle-blade-field-*` name made production framing silently
    bald while every stat check passed.
  - The grass ring centers on the CAMERA's ground position (eyePosition), not
    the view center — view-centering reads as a floating grass disc at the
    vista.
  - The far cull must exceed the vista eye height (~59 m); with the close-lab
    64 m envelope the vista distance-culled everything.
  - Blades blend to the meadow tone over the last quarter of the ring
    (edge fade) so the coverage edge dissolves; real stratified thinning is
    slice 12.
- Gates: all battle scenes green twice; elevation tripwire green;
  `perf:30k` hardware PASS at 110k records (GPU median 5.4/6.3 ms, budget
  33 ms); wind verified by two-frame diff (7% of blade pixels move).
- Slice-12 note: at gameplay mid-zoom (zoom 3) the eye sits beyond the ring
  and zero blades draw — the zoom transition/thinning is slice 12's job.

## Feedback that would change it

Legibility of units against the new grass at gameplay zoom (aesthetics rule:
battles stay bright and legible) — if soldiers get lost in blades, the answer
is height/density under units or contact shadows, parameterized, not a
primitive change.
