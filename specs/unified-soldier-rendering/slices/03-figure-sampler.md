# Slice 3 — Representative-figure sampler (pure, no render change)

A pure, deterministic function that turns a stack's roster into the handful of figures we
draw. No GPU, no scene wiring — the one place the "≤6 scaled to the cap, class mix from
roster" rule lives, so it can be reasoned about and pinned in isolation.

## Contract this unlocks

`unitsByClass[] → CrowdInstance[]`: the representative figures for one army stack, driven
by the real roster proportions, deterministic so frozen snapshots are stable.

## API seam

New pure module `packages/crowd-runtime/src/stackCrowd.ts` (beside `instanceData.ts` /
`lod.ts`), sim-agnostic, no web/wasm imports:

```
buildStackCrowd(
  unitsByClass: number[],
  opts: { unitCount, stackUnitCap, x, y, faction, seed, mountedClasses, terrainHeight? }
): CrowdInstance[]
```

- **Count:** `figures = clamp(round(6 * unitCount / stackUnitCap), 1, 6)`
  (`stackUnitCap = 20`). Never exceed 6.
- **Which:** allocate the `figures` slots across classes by `unitsByClass` proportions
  using largest-remainder (so a 60/40 spear/archer stack reads as spear-heavy). Fallback
  to `roster` if `unitsByClass` is empty.
- **Class id:** clamp/map via `modelLookForClass` exactly as battle's `buildCrowdInstances`
  does — do not assume roster indices are 1:1 with placeholder looks (Slice 0 confirms).
- **Layout:** small deterministic formation offset around `(x, y)` (reuse
  `generatedFormation` spacing math, extended to a proportional multi-class mix).
- **Mounted:** from `mountedClasses` (`mountedClassesFromKit`).
- **Elevation:** sample `terrainHeight` at each figure's jittered position.
- **Determinism:** seed by army id + per-figure offset so figures don't churn frame to
  frame and snapshots are reproducible. Animation phase is computed by the caller from
  `fixedTime` (kept out of this pure fn, or passed in explicitly).

*(Alt considered: place this in `game-renderer/src/campaign/armyCrowd.ts` taking an
`ArmyView`. Chose crowd-runtime + a plain `number[]` so it stays web-type-free and
unit-testable.)*

## What the human can run / see

Nothing visual yet. Optionally exercised through the Slice 0 spike route before that route
is deleted.

## Verification gate

If `packages/crowd-runtime` has (or can host) a fast pure-TS test, pin: count formula at
the cap boundaries (`unitCount` 1, 3, 10, 20, 40 → 1,1,3,6,6), proportional class
allocation, and determinism (same inputs → identical output). Otherwise the proportions
are verified visually via Slice 4's `campaign-models` gate — note that gap explicitly if
no pure test is added.

## What must stay green

Everything — new module, no importers yet.

## Feedback that would change this slice

The count curve (`6 × unitCount / 20`) and the largest-remainder mix are the tunables. If
David wants small stacks to still show ≥2 figures, or a minimum-1-per-present-class rule,
change the allocation here.
