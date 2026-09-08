# Slice 02 — Command / control seam, async-correct harness, pick centres, state hash

## Contract unlocked

Every mutation and every time-control operation goes through `BattleSim`
as data (`SimCommand`) or an awaited method; the debug API and every scene
are already correct under an asynchronous sim; `pick_unit` is a main-thread
pure function with a pinned parity oracle; the state hash is reachable from
the browser. Still in-process, still pixel-identical.

## API seam

- `sim/simCommand.ts` — discriminated union, one member per wasm setter:
  `move` (with optional facing), `attack`, `attackMove`, `disengage`,
  `enqueue`, `pace`, `files`, `reform`, `pursue`, `fireAtWill`, `evadeAuto`,
  `spawnUnit`, `spawnClass`, `aiTeam`. Emitters: `battleControls.ts`,
  `battleOrders.ts`, `battleDebugApi.ts`.
- `SimRunState {paused, timeScale}` owned by `BattleSim`; `BattleFreeze`
  keeps its pause-before-freeze bookkeeping but calls `sim.setRun`.
  `frozen` stays a main-thread presentation flag (renderer `fixedTime`),
  never a sim concept.
- `battleLoop.ts` stops calling `advance_ticks`; the in-process adapter
  drives `SimClock` internally so behaviour is unchanged, but the loop no
  longer knows a clock exists. `freezeAtTick` becomes async in the order the
  README table gives; `advance(n)` returns the header.
- `stats()`, `tickCount()`, `unitInfo(u)`, `soldierPos`, `soldierAlive`,
  `projectileCount`, `formationDebug` stay synchronous over `sim.frame`.
- Rust: `refresh_unit_info` appends `pick_x, pick_y = Unit::center()`
  (`UNIT_INFO_STRIDE` 35 → 37; `unitInfoLayout.ts` gains two names).
  `sim/pickUnit.ts` is the nearest-within-`maxDist` scan over units with
  `alive > 0`. A Rust test asserts `Sim::pick_unit(p, d)` equals the argmin
  over the exported centres on three seeded fixtures including a mounted
  unit; a vitest pins the TS scan against a fixture recorded from that test.
  The `pick_unit` and `queued_orders` wasm exports are deleted.
- `Game::state_hash()` (from 00) surfaces as `sim.stateHash()` and
  `window.__game.stateHash()`; `battle-smoke` gains one pinned hash at tick
  480 for seed 7 — a bit-exact oracle that needs no screenshot.
- Scene audit: the sites that read synchronously right after a mutation get
  an `await` — `banner-gallery.mjs` (`freezeAtTick(4000)` then `unitInfo`),
  `battle-camera-zoom.mjs`, `battle-3d-standards.mjs`,
  `battle-genmap-smoke.mjs`, the `battle-arrows.mjs` advance loop, the two
  `battle-cavalry-plow.mjs` advances, `battle-ai.mjs`, `battle-smoke.mjs`,
  `campaign-reinforcements.mjs`. About twenty one-line edits. Predicates
  inside `waitForFunction` that read `stats()` are untouched.

## What the human runs and sees

The identical game; `p`, freeze and scripted advance behave as before.

## Verification

Same suites as 01 with zero re-bless; `pickUnit.test.ts`; the Rust parity
test; a typing test that every `window.__game` member scenes call exists
(the list is greppable from `web/scenes/**`).

## Delegated to the implementer

Whether `command()` posts immediately or batches per rAF (default
immediate; FIFO order is the contract either way); whether `select` and
`selected` stay in the debug adapter (yes, they are presentation).

## Must stay green

Everything in 01, `cargo test --workspace`, `profile_tick duels` unchanged
(nothing in `crates/sim` moved).

## KILL

Any baseline re-bless; `pick_unit` parity fails on any fixture (the centre
export is wrong — fix before proceeding); the scene audit needs materially
more than the ~20 edits above (the harness relied on synchronous mutation
semantics more than the recon found — re-scope before 04).
