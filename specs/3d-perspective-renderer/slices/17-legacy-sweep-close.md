# Slice 17 — Legacy deletion sweep + close-spec

## Contract unlocked

Nothing legacy remains: the bespoke world-pass estate orphaned by `08b` (and `16a`,
if GO) is deleted with a consumer-inventory audit, the scaffolding ledger is empty,
and the spec closes as a rationale record. The finished renderer reads as designed
for three.js-on-camera3d from scratch — not the bespoke engine with a photoreal
renderer bolted on.

## API seam (a deletion inventory, 05b-style)

Grep every consumer and account for each — deleted, migrated to a photoreal
equivalent, or recorded as a named exception:

- **Bespoke battle world passes** (orphaned since `08b`): `BattleGroundPass`,
  `BattleGrassPass` + `grassField` render side, `BattleHorizonPass`,
  `BattleGroundCuePass`, `BattleEffectLinePass`, inline `BattleTrianglePass`,
  battle `SkinnedCrowdPipeline` + `SoldierShadowDecalPass` instances, `particlePass`.
- **Bespoke campaign world passes** (if `16a` was GO): `mapPass` world side,
  `territoryPass`, `entityPass`, `selectionPass`, `sceneryPass`, campaign
  `skinnedPipeline`/`soldierShadowPass`, label/fog/cloud passes. If NO-GO, these
  survive as the recorded campaign exception — the inventory shrinks, it does not
  blur.
- **Water WGSL:** `WaterPlanePass`, `packages/game-renderer/src/water/gerstnerField.ts`
  and bespoke water shading (battle owner is `seaLayer` since `12`; campaign per the
  16a ruling).
- **`frameShell` world machinery** scoped down to what surviving lab/campaign routes
  actually need — audit `apps/renderer-lab/src/router.ts` route-by-route: port to a
  photoreal-lab equivalent, retire, or record as an intentional exception
  (`minimapPass` lab route and the DOM battle minimap stay 2D by design;
  `camera3d-probe` stays). `fixtures/nested3d` and any stale fixture die here.
- **Flags and remnants:** any surviving `real:`/`reverseZ`-era scaffolding (05b owns
  their deletion — this re-proves zero), `pickingDebug.ts` if not re-pointed at `08b`.
- **Grep-audit list (all zero or named exceptions):** `projectGround`,
  `projectWorld3d`, `worldDepth3d`, `gpuWorldDepthStencil` legacy uses,
  `WaterPlanePass`, `SoldierShadowDecalPass`, `three-probe`, `bakeoffProbes`,
  `gerstnerField`.
- **Ownership audit:** stats identity fields asserted engine-wide; one projection
  (`camera3d`), one preset owner (`CIVSIM_ENVIRONMENTS`), one sky, one aerial, one
  water seam, one foliage owner, one LOD policy — the README invariants, grep-proven.
- Reconcile with `05b`'s landed inventory so nothing is double-deleted or stranded.

Then: `refactor-clean` pass over what remains → `review` → `close-spec` (archive to
`specs/done/3d-perspective-renderer`, rewritten as rationale; fold/close
`specs/battle-map-reference` per the ruling recorded at `13`).

## What the human can run / see

The whole game, unchanged behavior, smaller repo. `renderer-lab-routes` scene
re-derived to the surviving route set.

## Verification

- Full suite green: `cargo test --workspace`, `bun run --cwd web test:unit`, all
  battle + campaign scenes under SwiftShader, seating tripwire `match=true`.
- **Final perf-gate run recorded** — the ladder's frame-time ledger closes with the
  everything-on headline number in this file and the closed spec.
- Zero-diff screenshots (deletion must not move pixels): battle + campaign scene
  suites byte-identical to their pre-17 baselines.
- Grep-audit output pasted into this file (the zero-proof, 05b-style).

## Must stay green

Everything — this slice deletes code, not behavior. Any pixel that moves means a
consumer was still alive: stop, account for it, then delete.

## Human feedback that would change this slice

Whether `frameShell` survives as a lab-probe harness or dies entirely — decide from
the route inventory, not by fiat; record the call. Sign-off on closing
`battle-map-reference` (flagged since `13`).
