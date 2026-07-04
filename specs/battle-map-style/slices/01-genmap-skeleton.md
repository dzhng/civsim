# 01 — Genmap skeleton: seed → playable battle

Prove one seed flows Rust → wasm → frontend → photoreal → screen,
deterministically, before any landform sophistication exists.

## Contract unlocked

`crates/sim/src/genmap/` exists with the seam every later G-slice fills in:
`MapRecipe { seed: u64, .. }` → `generate(&MapRecipe) -> Terrain`. A seeded
battle is playable in the browser.

## API seam

- `crates/sim/src/genmap/mod.rs`: `MapRecipe` (serde-able from day one — the
  future campaign seam in slice 19 is a straight embed; defaults reproduce
  today's extents: half_w 1200, half_h 800, cell 4, plus `vista_extent: 2.0` —
  the rendered-world multiplier slice 14 consumes; the skeleton only carries
  it). `generate` is pure, no
  I/O, writes `height/speed/tint/rough` fields directly — never stacked paint
  ops. First output deliberately boring: a gently rolling plain (integer-hash
  value noise — reuse the wrapping-mul hash family already in `maps.rs`; **no
  transcendentals** anywhere the output feeds `speed`), E/W sealed with the
  existing crag vocabulary, N/S open.
- Wasm (`crates/game-wasm`): `load_generated_map(seed)` and
  `start_battle_generated(seed)` beside the existing integer `load_map`;
  confirm u64/BigInt crosses bindgen cleanly in the first hour (fall back to
  u32 if not — record the call). Plus `generated_map_descriptor() -> String`
  JSON `{ seed, groundCover, reliefScale }` so the frontend never
  reverse-engineers identity from an integer.
- Web: `?map=gen&seed=N` boots the battle route; presentation flows through
  the existing catalog-less path (`deriveBattleEdgeRoles`) + the descriptor's
  `groundCover`. **No fake catalog entries keyed by seed.**

## Human can run

Fight a full battle on `?map=gen&seed=42` in the browser.

## Verification

- `crates/sim/tests/genmap.rs`: same seed twice → byte-identical fields
  (FNV/golden hash); two seeds differ; E/W sealed-fraction and N/S
  open-fraction thresholds mirroring `edgeSealMismatches` semantics; a first
  N–S BFS corridor certificate (library code in `genmap/certify.rs` from the
  start — tests and `generate` debug-asserts share it).
- A wasm-vs-native golden hash fixture for one pinned seed (the determinism
  contract's tripwire).
- New scene `battle-genmap-smoke.mjs`: boots seed 7, asserts stats
  (dimensions, sealed edges, deployment bands passable), snaps once.

## Stays green

All existing cargo tests, the three hand maps byte-identical, `perf:30k`,
elevation tripwire, every existing scene.

## Feedback that would change it

David wanting different map extents for generated maps (the recipe carries
extents, so this is a default change, not a reshape).

## Landed 2026-07-04

- `crates/sim/src/genmap/` owns `MapRecipe { seed: u64, half_w: f32,
  half_h: f32, cell: f32, vista_extent: f32 }`, serde defaults
  `0/1200/800/4/2.0`, `generate(&MapRecipe) -> Terrain`, certificate helpers,
  and the FNV terrain hash.
- The first landform is intentionally plain: integer-hash value noise writes
  rolling `height` and light `rough`; `speed` is direct passable/open or crag
  wall geometry only; west/east use crag-circle seals, north/south stay open.
- Wasm landed as u64/BigInt: `load_generated_map(seed: u64)`,
  `start_battle_generated(seed: u64)`, and `generated_map_descriptor()`.
  Descriptor JSON is `{ seed, groundCover: "green-grass", reliefScale: 1.0,
  terrainHash }`.
- `?map=gen&seed=N` launches a non-catalog battle kind. The frontend passes no
  fake catalog `wasmMapId`, so the existing catalog-less
  `deriveBattleEdgeRoles` path handles edge roles; `BattleScene` applies the
  descriptor relief scale before the existing `setTerrain` call.
- Golden pins:
  `generated(seed=7)=0x97616c1950edf8b8`,
  `RiverAndCrags=0x1d65c06afbab0eca`,
  `WalledPlain=0x864fe11f35ddf30c`,
  `CoastalScrub=0x020ad95c550af7b6`.
- Verified here: `cargo test -p sim --test genmap -- --nocapture`,
  `cargo test --workspace`, `bun run --cwd web typecheck`,
  `bun run --cwd web lint`, and `bun run --cwd web format`.
- ORCHESTRATOR-TODO: this sandbox cannot install/run `wasm-bindgen`, dev
  servers, browser scenes, or Preview. `bun run build:wasm` compiled Rust but
  failed when `wasm-pack` tried to install `wasm-bindgen` (`Operation not
  permitted`). Run `bun run build:wasm`, then from `web/` run
  `VERIFY_GPU=1 node scene.mjs battle-genmap-smoke` twice, bless its snapshot,
  inspect the screenshot for a real nonblank terrain frame, and rerun
  `VERIFY_GPU=1 node scene.mjs battle-terrain-elevation`.
