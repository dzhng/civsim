# 13 — battle-renderer-wrapper

**Contract unlocked:** `web/src/battle/renderer.ts` is an adapter above the
photoreal world, not a second owner of its state.

## Seam

- `stats()` → `{ ...world.stats(), renderer: "gpu", performance }` instead of
  the 25-field `?? fallback` remap (406-450). Before deleting fallbacks, grep
  `web/scenes` for `renderStats.` fields read before `__ready`; keep only
  those, typed. The frozen key list (add, never rename): `terrain`, `soldiers`,
  `tacticalLines`, `expectedSoldiers`, `environment`, `markerLayer`, `lod`,
  `device`, `camera`, `standards`, `readouts`, `performance.frameCpuMs`,
  `performance.gpuTimeMs`.
- Delete the mirrored `soldierUnit`, `unitTeam`, `staticSoldiers`, and the
  byte-identical `lastCamera` initializer (87-93, 113-126); the world exposes
  `debugBlockTriangles()` for `?debug=blocks` (`battle-selection.mjs`).
- Wrapper-only features that stay because they have live callers: frozen
  frames (`fixedTime`, `preserveFrozenEffects` — `battle/scene.ts`),
  `debug=blocks`, `frameCpuMs` (`full-game-rendering-performance.mjs`).
- Delete the stale header sentence naming `frozenSelectionGroundCues` (0 hits).
- `setTerrain(grid, opts)` with a named options object replaces the positional
  parameter list.
- Drop the `?sea` and `?measurecards` reads (no live consumer; slice 21 deletes
  the rest of the orphan params).

Lands after slice 19 (both touch `battle/scene.ts` call sites).

## Decisions resolved here

The world is the owner of camera and unit state; the wrapper owns production
policy (frozen frames, perf split) only.

## Delegated to the implementer

Shape of the `setTerrain` options object.

## Verification

- G0. G-verify, G-verify-full at **0 px**; `battle-selection` (`debug=blocks`),
  `full-game-rendering-performance` (`frameCpuMs`), `battle-renderer-default:43`
  (`markerLayer === "far-lod-impostor"`).
- `renderer.ts` ≤ 450 lines.

## Must stay green

All battle scenes.

## Feedback that would change this slice

None.
