# 10 — battle-world-split

**Contract unlocked:** `battleWorld.ts` is a ≈500-line orchestrator; the grass
field (base layer + focus ring + rebuild state) and the terrain build each have
one owner. Dead constructor options are gone.

## Seam

`packages/photoreal-renderer/src/battle/battleGrassField.ts`:

```ts
export class BattleGrassField {
  constructor(scene: THREE.Scene, profile: BladeFieldProfile, transition: BladeFieldTransition, wind: WindSignal);
  setTerrain(grid: BattleTerrainGrid, field: TerrainHeightField, cover: BattleGroundCover): void;
  update(view: { x: number; y: number; zoomT: number; eyeZ: number }): void; // ring engage/release/rebuild
  stats(): BladeFieldStats & { rebuild: GrassRebuildStats };
  setVisible(on: boolean): void;
  dispose(): void;
}
```

Moves `battleWorld.ts:283-316` (constants), `397-446` (`grassRebuildStats`),
`537-550` (base + ring construction), `1088-1423` (17 private methods). The
ring **stays** — `meadowFocusRing` defaults ON in production
(`battleWorld.ts:636`); the option and its `!== false` plumbing are deleted,
the ring is unconditional and zoom-gated as today. The stats `strategy` field
collapses to its one production value.

`battleTerrainBuild.ts`: `buildBattleTerrain(input): BattleTerrainBuild`, a
pure function from `setTerrain/applyTerrain` (715-880): ground, vista, ocean,
lake meshes.

Also retire `disabledGroundDetail` (only `photorealBattleRoute.ts:74-86` sets
it from `?detail=`; delete the route param and the `terrainLayer.ts:136/530/565`
branches).

Orchestrator keeps: layer wiring, `draw` (crowd + seating), `render` (sun sync,
shadow refit, grass `update`), `resize`, `stats` composition, `dispose`.

## Decisions resolved here

Ring stays. Option surface of `PhotorealBattleWorld.create` = environment,
shadows, sea, post, postGrade, grassQuality.

## Delegated to the implementer

Internal naming inside `BattleGrassField`; whether rebuild stats keep all 40
fields (delete any no scene reads — grep `grassRebuild` in `web/scenes`).

## Verification

- G0. G-verify, G-verify-full, G-photo at **0 px** including
  `battle-map-style-grass-close` and the seating tripwire in
  `battle-photoreal-parity` (four maps after slice 01).
- `full-game-rendering-performance` unchanged; `battle-perf-30k` within its
  band (hardware only, not a CI gate).
- `battleWorld.ts` ≤ 600 lines.

## Must stay green

All battle scenes byte-identical.

## Feedback that would change this slice

None.
