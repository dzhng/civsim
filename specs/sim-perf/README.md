# sim-perf — a 30k live battle at full rate, without bending the physics

One spec, two levers on the same measured battle:

- **Tick track** (`crates/sim`): make one tick cheaper. Pure-perf slices
  must be bit-identical (state hash); anything that cannot be moves to a
  behavior track and is judged as a designed mechanics change.
- **Worker track** (`web`): take the tick off the render thread. A spike
  with a kill switch: every rung has numbers that say keep or drop.

Same oracles, same ledger, same firewalls; the two verdict styles stay
separate (a budget to meet vs a spike to keep or drop). This folder merges
the July `sim-tick-30k` plan and the September `sim-worker` plan; each old
folder holds a one-line redirect until close-spec.

## Next Agent Prompt

**Status (2026-09-09):** `tick/00` implementation, identity checks and
review are committed (`5461c235`); the integrated workspace suite passes.
The budget gate is honestly red, with substantial machine variation. The
contact pass is being implemented in its own worktree. `worker/00` has a
matching cross-thread hash, but no admissible quiet-machine timing yet.

**Current pickup:** measure the contact variants, then verify and integrate
`tick/01`. Implement scratch reuse in parallel, then integrate both before
the budget checkpoint. Their source owners are separate; correctness and
timing checks remain coordinated so measurements do not include other jobs.
The first-contact window is a small skirmish; check a developed fight before
concluding the broad budget is met. Worker measurements proceed independently
when a quiet timing lane is available; worker production refactoring starts
only after a keep verdict. Its later 12–14 ms frame gates are under review
because an empty-page diagnostic shows a 16.7 ms cadence; thresholds remain
unchanged pending an explicit decision.

**Evidence:** [native baseline](assets/tick00-native-2026-09-09.md),
[developed-window verification](assets/developed-window.md),
[browser hash identity](assets/worker-state-hash.md),
[original visual reference](assets/visual-baseline.md),
[acceptance changes](assets/acceptance-changes.md), and
[choices](choices.md). Run expensive correctness checks concurrently
where useful, but reserve timing runs so they do not measure those checks.

**Warnings:**
- Every browser number needs a quiet machine (load average under ~4). On
  2026-09-08 a loaded machine doubled every frame time, including code that
  had not changed.
- Battle verify baselines (`battle-smoke`, `banner-gallery`,
  `battle-3d-standards`) were already red at HEAD with stale July pixels.
  "Zero re-bless" in every slice means identical failure sets and pixel
  counts to a main-tree run of the same scenes, never PASS. Re-blessing
  them is its own decision, not a side effect of a perf slice.
- "Scene completed without throwing" under load is a screenshot timeout;
  rerun before believing it.

**Global TODO (each → owning slice):**

Tick track
- [x] `tick/00` stage profiler behind a feature + standing budget gate ([slices/tick/00-profiler-and-gate.md](slices/tick/00-profiler-and-gate.md))
- [x] weapon-repel gate — shipped on main 2026-09-08 as an exact per-unit-extent cull (`2e0e4a7c`)
- [ ] `tick/01` shared per-tick contact neighborhood for targeting, weapon-repel and the wall ([slices/tick/01-contact-neighborhood.md](slices/tick/01-contact-neighborhood.md))
- [ ] `tick/02` scratch-buffer reuse ([slices/tick/02-scratch-buffers.md](slices/tick/02-scratch-buffers.md))
- [ ] `tick/03` BUDGET CHECKPOINT — decide the rest with David ([slices/tick/03-budget-checkpoint.md](slices/tick/03-budget-checkpoint.md))
- [ ] `tick/04` deterministic idle sleeping — behavior track ([slices/tick/04-idle-sleeping.md](slices/tick/04-idle-sleeping.md))
- [ ] `tick/05` deterministic in-tick parallelism — last lever ([slices/tick/05-parallelism.md](slices/tick/05-parallelism.md))

Worker track
- [ ] `worker/00` measure — KILL #1 ([slices/worker/00-measure.md](slices/worker/00-measure.md))
- [ ] `worker/01` read seam in-process ([slices/worker/01-read-seam.md](slices/worker/01-read-seam.md))
- [ ] `worker/02` command seam, async-correct harness ([slices/worker/02-command-seam.md](slices/worker/02-command-seam.md))
- [ ] `worker/03` campaign handoff as JSON ([slices/worker/03-campaign-handoff.md](slices/worker/03-campaign-handoff.md))
- [ ] `worker/04` cutover — KILL #2 ([slices/worker/04-worker-cutover.md](slices/worker/04-worker-cutover.md))
- [ ] `worker/05` proof, standing gate, keep/drop ([slices/worker/05-proof-and-gate.md](slices/worker/05-proof-and-gate.md))
- [ ] close-spec when both tracks have a verdict

**Instruction to the next agent:** update this section before ending your
pass, and record every decision made where the spec was silent in
[choices.md](choices.md).

## Clean machine setup

Everything the oracles need, nothing else:

- Rust stable (the workspace builds on 1.94; no nightly, no toolchain file),
  `wasm-pack`, Bun, Google Chrome (the hardware-GPU gates launch it by
  channel), and Playwright's Chromium, which `bun install` in `web` fetches.
- From the repo root: `bun run setup` (web deps and the pre-commit hook),
  then `bun run build:wasm`. `web/src/wasm/` is gitignored; nothing in the
  browser runs without this step.
- Native sampling: on macOS the built-in `sample` command is enough; on
  Linux use `perf record -g`. Inlining hides the passes, so to see inside
  a tick temporarily add `#[inline(never)]` to the pass functions in
  `crates/sim/src/steer`, `separation`, `combat` and `unit.rs`, sample, and
  read the "Sort by top of stack" table. Strip the attributes before
  committing (none exist at HEAD).
- Dev server for browser gates: `bun run --cwd web dev --port <free>` and
  `VERIFY_URL=http://localhost:<port>` on every scene command; multiple
  checkouts contend for the default port.

## Re-baseline (before any slice)

Every number in the ledger below was measured on one Mac on 2026-09-08. A
different machine gets its own rows; thresholds are relative to them.

```sh
# tick, native: idle and with commanders on; ends in the state hash
cargo run --release -p sim --bin profile_tick -- 7 600
cargo run --release -p sim --bin profile_tick -- 7 9000 ai
cargo run --release -p sim --bin profile_tick -- duels      # the seed-set A/B oracle
# frame, browser: main-thread self-time per function, sim live and paused
VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome \
  node web/scene.mjs battle-cpu-profile
PROFILE_SOLDIERS=30500 VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome \
  node web/scene.mjs battle-cpu-profile
# the renderer gate that must keep passing
bun run --cwd web perf:30k
```

Record: native ms/tick idle and ai at 15.5k; browser tick ms and rAF p50/p95
live and paused at 15.5k and 30k; the duel combined hash (it is the identity
every tick slice must reproduce).

## Oracles (every slice, both tracks)

- **State hash.** `Sim::state_hash` is the one fingerprint (positions,
  facings, health, loose timers, alive, per-unit frame, cohesion, stamina).
  The golden test pins it on a scripted clash; `profile_tick duels` runs
  every class pair plus the sandboxes and prints one combined hash; a long
  `profile_tick 7 9000 ai` run reaches melee on the real map. A pure-perf
  slice reproduces all three or it is not pure-perf.
- **Zero re-bless.** Frozen screenshots are the determinism oracle the hash
  cannot give (they see the presented frame). Identical failure sets and
  pixel counts against a main-tree run of the same scenes.
- **Full suites** after anything mechanics-adjacent: `scripts/test-mechanics`,
  `scripts/test-scenarios`, `scripts/test-balance` (memory: turn rate
  couples balance; a green mechanics run does not clear a balance change).
- **The renderer gate** `battle-perf-30k` (GPU time with the sim paused)
  stays exactly as it is; the worker track adds a live gate beside it, never
  replaces it.
- **Instrumentation is feature-gated**; `cargo check -p sim` with default
  features must stay clean and the default build must pay nothing.

## Budget and thresholds

Tick track (locked by David, 2026-07-02, do not re-litigate): **≤ 25 ms per
tick at 30k fighting**, native release, on the implementing machine; 60k is
measured and trended, not gated. The 2026-09-08 idle tick at 15.5k is 6.6 ms
natively (was 20 ms); the fighting tick at 30k has not been re-measured
since July's 50 ms and is the first number tick/00 produces.

Worker track keep/drop table (from the three drafts, strictest of each
pair; re-based on the clean machine's own baseline rows):

| Number | This Mac, 2026-09-08 | Keep | Drop |
|---|---|---|---|
| 15.5k live rAF p50 (seed 7, AI on) | 18 ms | ≤ 12 ms | > 14 ms |
| 30k live rAF p50, sim running | 36–60 ms | ≤ 20 ms | > 25 ms |
| Ticks per wall-second at 30k, live, 20 s | cannot hold | ≥ 29 | < 28 |
| Worker ms/tick at 30k (worker/00) | 25 ms on main | ≤ 30 ms | > 30 ms |
| Main rAF p50 while the worker ticks, paused-sim render work (worker/00) | 17 ms | ≤ 21 ms | > 21 ms |
| Snapshot pack + delivery per tick (worker/00) | — | ≤ 1 ms, age p95 ≤ 66 ms | > 2 ms or > 66 ms |
| Command latency p95 (click → applying tick) | ≈ 16–33 ms | ≤ 70 ms | > 70 ms |
| Stall injection, Δ main rAF p95 | — | ≤ +2 ms | > +5 ms |
| `state_hash`, worker vs direct, every fixture | — | identical | any mismatch |
| Re-blessed baselines | 0 | 0 | any |
| Net production lines (gross also reported) | — | ≤ +700 | > +900 |
| New production files | — | ≤ 5 | > 5 |

A worker drop at 00 costs half a day and keeps only the `state_hash`
export; a drop at 04 reverts 04 and keeps 01–03 (one owner of sim access
is worth having regardless).

## Slice graph

```
TICK (crates/sim)                          WORKER (web)
tick/00 profiler + budget gate             worker/00 measure ── KILL #1
   ├─ tick/01 contact                         │
   └─ tick/02 scratch (parallel)           worker/01 read seam (in-process)
            │                                 │
       integrate both                     worker/02 command seam + harness
   │                                          │
tick/03 BUDGET CHECKPOINT ── David         worker/03 campaign handoff as JSON
   │                                          │
tick/04 idle sleeping (behavior track)     worker/04 cutover ── KILL #2
tick/05 parallelism (last lever)           worker/05 proof + gate + verdict
```

The tracks are independent until close. The worker track is the physical
form of what July called tick/frame decoupling; a lower sim Hz as a product
fallback is David's call at tick/03, not a slice.

## Where the tick goes now (2026-09-08, native, self-time, `#[inline(never)]` sampling)

Idle at 15.5k after the weapon-repel and steer prunes: body-pair solver
~19%, halted-frame slide check (now extent-culled) and the corridor test
(now per-unit) were the next two and are gone, steer sub-passes spread the
rest with no single owner. Melee: target search ~35% (an 81-cell scan per
soldier every third tick, already gated per unit at 40 m), the iterative
body projection in `separation/walls.rs` ~21%, weapon-repel ~13% once
engaged. Those three are tick/01's targets and they match July's ranking
(`assets/investigation-2026-07.md`, recommendations 2 and 3).

## The worker seam (one owner)

New directory `web/src/battle/sim/` owns "how the main thread reads and
commands the sim". After worker/04 nothing in `web/src` imports `Game`
outside it (a vitest greps for it). The interface every consumer sees:

```ts
interface BattleSim {
  readonly static: SimStatic;        // terrain grid, vista bands, generated descriptor/manifest/certificates, class specs, stride
  readonly frame: SimFrame;          // last acquired tick; stable until the next acquire()
  acquire(): SimFrame;               // once per rAF, top of frame
  command(cmd: SimCommand): void;    // FIFO, fire-and-forget; typed union, one per wasm setter
  setRun(state: Partial<SimRunState>): Promise<SimRunState>;   // paused, timeScale
  advance(ticks: number): Promise<SimFrameHeader>;             // scripted ticks; ordered with commands
  pickUnit(x: number, y: number, maxDist: number): number;     // synchronous, over exported pick centres
  stateHash(): Promise<bigint>;
  metrics(): SimMetrics;             // tickMs, tickHz, publishMs, backlog, commandLatencyMs
  campaign: { result(): Promise<string> };                     // BattleResult JSON
  dispose(): void;
}
```

`SimFrame` is the typed snapshot (header plus the soldier, unit-info,
projectile and queued-order arrays) laid out by one table shared by the
in-process adapter, the worker packer and the reader. Consumers never
retain a view across frames. Ownership after the cutover: the types and
layout table; `simHost.ts` (main thread: worker lifetime, requests, latest
snapshot, buffer pool); `simWorker.ts` (the only `Game`, the clock, bounded
catch-up, commands, queries, result); `simSnapshot.ts` (the only code that
knows `*_ptr()` names); `game-wasm` (JSON handoff, pick centres, queued
orders block, `state_hash` export); every existing loop/render/UI module
renders from one acquired frame. The harness table (what `freezeAtTick`,
`advance`, `stats`, `pick_unit`, reinforcements, projectiles and the
campaign handoff become) lives in the worker slices.

## Decisions taken (David overrides any line)

- Shared-memory wasm is out: nightly `-Zbuild-std`, threads glue, and it
  still needs a publication protocol because pointers move on
  reallocation. Three independent drafts rejected it.
- Transport is transferred snapshot buffers with a recycling pool;
  worker/00 also measures a seqlock SharedArrayBuffer so the choice is by
  number. Exactly one ships.
- Seam before worker: worker/01–03 land in-process so a drop at 04 leaves
  one owner behind. The fewest-slices alternative (cutover as the seam,
  three rungs) is cheaper only if the spike is kept.
- Auto-resolve moves to the worker; after 04 no `Game` exists on the main
  thread. The campaign object stays on the main thread; setup and result
  cross as serde JSON.
- The worker pauses on `visibilitychange`, matching today's rAF stop.
- No compat, no migrations, no dual modes past a slice boundary except the
  in-process adapter between worker/01 and 04, which 04 deletes.
- Tick-track ordering is pure-perf first, behavior track only if the
  budget is not met purely or as headroom afterwards (July interview).

## Firewalls

- Tick track touches `crates/sim` (plus bench and report files) and never
  `web`/`packages`; worker track touches `web` and `game-wasm` and never
  `crates/sim`. A slice that needs both is two slices.
- Combat design contract (memory `battle-sim-combat-design`): push,
  block/evade, crush, facing, depth invariant — never bent for speed.
- Never weaken a gate or re-pin a test to pass a pure-perf slice. A moved
  hash is a wrong candidate order, not noise.
- Renderer untouched by either track: no LOD, cull or smoothing retune; the
  worker's gain must come from the thread split alone.
- Fixtures use the game's real spawn shapes (the quick-battle spread cap
  makes density grow with count), so the gate measures the product.

## Ledger

The [original heavy-infantry timeline](assets/visual-baseline.md) records
the pre-change visual comparison, including its existing baseline failures.

| date, machine | scenario | native ms/tick | browser tick ms | rAF p50 live | notes |
|---|---|---|---|---|---|
| 2026-07-02, Mac (July) | 30.6k fighting | 49.4–50.3 | — | — | idle 24.5; 60k fighting 136 |
| 2026-09-08, Mac | 15.5k idle (seed 7) | 6.6 | 8.3 | 18 ms | after weapon-repel + steer prunes; was 20 / 27 / 102 |
| 2026-09-08, Mac | 15.5k ai, 1000 ticks | 7.2 | — | — | was 16.6 |
| 2026-09-08, Mac | 30k live | — | 25 | 36–60 ms | paused-sim frame 17 ms; gate passes |
| 2026-09-09, M5 Pro | 30,560 first-contact, AI on | 36.294 | — | — | gate red; repeats 50.055 / 22.532 ms, 49 minimum fighters; see native evidence |
| 2026-09-09, M5 Pro | 60,060 first-contact, AI on | 102.564 | — | — | telemetry; large repeat spread, ratio 2.826 |
