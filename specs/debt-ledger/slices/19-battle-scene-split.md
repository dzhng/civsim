# 19 — battle-scene-split

**Contract unlocked:** `BattleScene.enter()` composes named owners instead of
holding 93 closures. The scene globals are unchanged.

## Seam

From `web/src/battle/scene.ts:259-2332`:

- `battleDebugApi.ts` — builds `window.__game` (the 37 keys at 2193-2321:
  stats, setOrder, select, selected, setPace, attackOrder, attackMove,
  disengage, enqueue, queuedOrders, previewDebug, formationDebug,
  terrainDebug, advance, projectileCount, tickCount, freezeAtTick(+WithEffects),
  freeze, reviewFrame(+Clear), groupMove, setFiles, spawnUnit, spawnClass,
  groupAttack, unitInfo, soldierStartOf/Pos/Alive, debugSoldierAnim, audio,
  heightAt, vistaHeightAt, cameraSurfaceDebug, setCamera, generatedManifest)
  and `__cam`, `__ready`. Key names frozen — 43 scenes and `worlds.mjs` wait
  on them.
- `battleLoop.ts` — `frame` (1688-1987) and `updateHud` (1988) on `SimClock`
  (slice 17).
- `battleHudBridge.ts` — `onToolbarCmd` (726), toolbar state (763-793),
  `setFps`/`setInfo` (1991, 2066), `checkGameover` (838).
- `battleMinimap.ts` — `drawMinimap` (568).
- `battleOrders.ts` — `groupMove` (913), `tacticalLineFrame` (1269).
- `battleFreeze.ts` — `doFreeze` (2075) and the frozen-frame flags.

`BattleScene` keeps `enter/exit/frame/restartBattle` and wires the owners
around a small `BattleWorld` handle (game, wasm memory, renderer, camera rig).
`sharedRenderer` module singleton (233, 300-312) stays — it is the restart
reuse contract.

Lands before slice 13 (both touch call sites in this file).

## Decisions resolved here

Split by owner, not by line count; `__game` keys are the consumer contract.

## Delegated to the implementer

Whether the debug API is built from the other owners' methods or keeps its
own closures over the handle.

## Verification

- G0. G-verify, G-verify-full, and every battle scene in `scene:renderer` at
  **0 px**; `renderer-lab-routes` `findUnguardedRendererReadyFootguns`.
- `scene.ts` ≤ 600 lines.

## Must stay green

All battle scenes.

## Feedback that would change this slice

None.
