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

## Feedback that would change it

Legibility of units against the new grass at gameplay zoom (aesthetics rule:
battles stay bright and legible) — if soldiers get lost in blades, the answer
is height/density under units or contact shadows, parameterized, not a
primitive change.
