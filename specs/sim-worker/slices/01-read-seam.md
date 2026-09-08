# Slice 01 — Read seam: `SimFrame` / `SimStatic` behind one owner (in-process)

## Contract unlocked

No file outside `web/src/battle/sim/` constructs a typed array over
`wasm.memory.buffer` or calls a `*_ptr()`, `*_count()`, `victor()`,
`terrain_*`, `generated_*` or `class_specs` accessor. Every consumer reads
one acquired `SimFrame` per rAF and one immutable `SimStatic`. The game is
pixel-identical; this is the refactor that makes 04 a transport change.

## API seam

- `sim/battleSim.ts` — the `BattleSim` interface (README) and
  `SimRunState`, `SimMetrics`.
- `sim/simFrame.ts` — `SimFrame`, `SimFrameHeader`, the ordered
  `SIM_FRAME_LAYOUT` table (field, element type, scale: per soldier / per
  unit / per projectile / per queued order), `frameByteSize(counts)`.
- `sim/simStatic.ts` — `SimStatic` (stride, class specs, terrain grid via the
  existing `readBattleTerrainGrid`, vista bands via the loop now in
  `battleTerrain.ts`, generated descriptor / manifest / certificates).
- `sim/inProcessBattleSim.ts` (~150 lines) — the SHORT-LIVED adapter: holds
  the `Game`, drives `SimClock` internally, `acquire()` rebuilds views over
  wasm memory for this frame (no copy), `advance()`/`command()` call `Game`
  directly and resolve immediately. Named as compatibility in its header
  comment; 04 deletes it.
- `BattleWorld` gains `sim: BattleSim` and loses `game`, `memory`,
  `positions()`, `facings()`, `unitInfo()`. `BattleConfig` carries `sim`.
- Consumers edited mechanically: `battleCrowd.ts`, `battleOrders.ts`,
  `battleTerrain.ts`, `battleControls.ts`, `battleHudBridge.ts`,
  `battleMinimap.ts`, `battleUnitPresentation.ts`, `battleLoop.ts`,
  `battleDebugApi.ts` (its `positions()`/`unitInfo` closures become frame
  reads). `main.ts` builds `SimStatic`-dependent descriptors from
  `sim.static`, and the throwaway probe `Game` for class specs goes.
- Queued orders take the flat `{offsets, triples}` shape now (Rust
  `queued_orders_flat` pointer export, ~25 lines), so 04 is one memcpy.

## What the human runs and sees

The identical game. `bun run --cwd web verify`, `verify:full`, the genmap
scenes and `verify:campaign` with **zero re-blessed baselines** (identical
failure sets and pixel counts to a main-tree run of the same scenes).

## Verification

- `bun run check` (fmt, lint, typecheck, vitest).
- New `simFrame.test.ts` pins the layout table: every field's element type
  and scale, the byte-size formula, `allocFrame(n).positions.length === 2n`.
- A vitest greps `web/src` for `game_wasm.js` `Game` imports outside
  `web/src/battle/sim/` and `web/src/campaign/` and fails on any other hit
  (the campaign's own `Campaign` import stays).
- The battle scene suites above, diffed against a main-tree run.

## Delegated to the implementer

Whether `SimFrame` reuses its container object across acquires (it should;
views are rebuilt); the exact `SimStatic` shape for the two hand-made maps;
naming inside `sim/`.

## Must stay green

Everything; `cargo test --workspace` (the pointer export is additive).

## KILL

Any baseline needs re-blessing (the seam changed a pixel: a semantic leak),
or net lines in `web/src/battle/**` after this slice exceed +200. Either
means the seam is not a pure refactor — stop and reassess before building
on it.

## Feedback that would change this slice

If David prefers the fewest-slices path (cutover as the seam), this and 02
fold into 04; the cost is that a drop at 04 leaves nothing behind.
