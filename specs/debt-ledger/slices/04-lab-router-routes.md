# 04 — lab-router-routes

**Contract unlocked:** the renderer lab is a table of routes, one file each;
the wasm terrain grid has one reader shared by lab and production; the
lab-routes footgun scanners see every lab file.

## Seam

- `apps/renderer-lab/src/routes/<name>.ts` exporting `route: LabRoute` for each
  surviving route (the seven already one-per-file move into the folder).
  Shared helpers from `router.ts:5250-6295` (`createConfiguredShell`,
  `publish`, `reportTable`, `chartSnapshot`, `animateShell`,
  `createSkinnedPipeline`, campaign fixture loaders) → `labShell.ts`,
  `labFixtures.ts`, `labCampaign.ts`. `router.ts` keeps the table and
  `mountRendererLab` (≈150 lines) and **must keep existing at that path**
  (scanners read it).
- New owner `packages/game-renderer/src/battle/terrainGrid.ts`:

  ```ts
  export interface TerrainGridSource {
    terrain_w(): number; terrain_h(): number; terrain_cell(): number;
    terrain_origin_x(): number; terrain_origin_y(): number;
    terrain_tint_ptr(): number; terrain_height_ptr(): number;
    terrain_rough_ptr(): number; terrain_speed_ptr(): number;
  }
  /** Copies every field out of wasm memory. Call after any memory-growing wasm call. */
  export function readBattleTerrainGrid(game: TerrainGridSource, memory: WebAssembly.Memory): BattleTerrainGrid
  ```

  Structural type keeps game-renderer free of `web/src/wasm`. Copies, not
  views: a view over `memory.buffer` dies on growth. Consumers migrated in the
  same slice: `web/src/battle/scene.ts:428-431, 473, 504` (read once, reuse for
  minimap and `terrainDebug`), `photorealBattleRoute.ts:250-276`, the device
  route (`router.ts:398-405`).
- `web/scenes/system/renderer-lab-routes.mjs`: the scanners at `:823`, `:1135`,
  `:1155`, `:1181` (and the `endsWith("/apps/renderer-lab/src/router.ts")`
  filters at `:1165`, `:1191`) are hard-coded to `router.ts`. Widen them to
  `tsFiles(apps/renderer-lab/src/)` in the same commit, or the checks go
  vacuous silently. Also add `web/src/shared/` to the
  `findUnguardedRendererReadyFootguns` roots (`:798`) now, ahead of slice 17.

## Decisions resolved here

One file per route; helpers grouped by what they need (shell, fixtures,
campaign). Stats keys published by each route are unchanged.

## Delegated to the implementer

File names inside `routes/`; whether `labFixtures` and `labCampaign` merge.

## Verification

- G0, G-lab (`renderer-lab-routes` walks every entry; `findRawShaderModuleFootguns`
  recurses `apps/renderer-lab/src/` so the new files are covered), G-verify,
  G-photo (`photoreal-battle` route moved).
- New `web/tests/terrainGrid.test.ts` (vitest after slice 15; until then under
  the existing runner): fake `WebAssembly.Memory`, assert the result is a copy.
- Pure move: any red snap is a bug, never a re-bless.

## Must stay green

All lab and battle scenes byte-identical; route stats keys unchanged.

## Feedback that would change this slice

None.
