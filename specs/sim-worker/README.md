# sim-worker — the battle tick off the main thread (a spike with a kill switch)

Move `Game.advance_ticks` into a Web Worker so the render thread only renders
and the sim holds its 30 Hz on its own core. This is a **spike**: every rung
carries a numeric kill criterion, and if the result over-complicates the
codebase for little gain the worker rungs are reverted and the branch dropped.
The measured problem it answers: on one thread the 15.5k default battle
serializes an 8 ms tick with ~10 ms of render work (18 ms frame), and a 30k
battle cannot hold real time at all (25 ms tick → 36–60 ms live frames).
Renderer alone is ~17 ms at 30k, so the gain on offer is a 60 fps main thread
with the sim at full rate.

This spec delivers `specs/sim-tick-30k` slice 07 (frame/tick decoupling) by
physical decoupling; it does not touch slice 06 (parallelism inside a tick) or
`crates/sim` at all.

## Next Agent Prompt

**Status (2026-09-08):** spec authored from three independent drafts (Claude
fewest-slices, Claude seam-quality, Codex risk-first) over a verified recon
brief; nothing implemented. **Start at slice `00`** — the half-day measurement
that can kill the whole idea before any seam work. Do not write production
code before `00`'s numbers are in the ledger below.

**Exact pickup point:** [slices/00-measure.md](slices/00-measure.md). Run it
on hardware Chrome (`VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome`)
on a quiet machine — load averages above ~4 double every browser number (seen
2026-09-08) and make the verdict meaningless.

**Warnings:**
- Battle verify baselines (`battle-smoke`, `banner-gallery`,
  `battle-3d-standards`) are ALREADY red at HEAD with stale July pixels. The
  "zero re-bless" gate in every slice means: the failure set and pixel counts
  are identical to a main-tree run of the same scenes, never "PASS".
- "Scene completed without throwing" failures under machine load are
  screenshot timeouts; rerun before believing them.

**Global TODO (each → owning slice):**
- [ ] `00` measure: worker tick rate, contention, snapshot cost, hash parity — KILL #1 ([slices/00-measure.md](slices/00-measure.md))
- [ ] `01` read seam in-process: `SimFrame`/`SimStatic`, one owner, zero re-bless ([slices/01-read-seam.md](slices/01-read-seam.md))
- [ ] `02` command/control seam, async-correct harness, pick centres, state hash export ([slices/02-command-seam.md](slices/02-command-seam.md))
- [ ] `03` campaign handoff as serde JSON, hash round-trip ([slices/03-campaign-handoff.md](slices/03-campaign-handoff.md))
- [ ] `04` worker cutover, in-process adapter deleted — KILL #2, the verdict ([slices/04-worker-cutover.md](slices/04-worker-cutover.md))
- [ ] `05` determinism + stall proof, standing gate, keep/drop record, close-spec ([slices/05-proof-and-gate.md](slices/05-proof-and-gate.md))
- [ ] update `specs/sim-tick-30k/README.md` slice 07 row with the verdict (05)

**Instruction to the next agent:** update this section before ending your
pass — status, pickup point, the ledger, and any decision you made where this
spec was silent (record it in [choices.md](choices.md), which starts empty).

## Interview — assumed answers (David: override any line)

The session that wrote this was autonomous, so these are the recommended
answers to the questions the spec would have asked, recorded as decisions:

1. **Outcome:** main thread renders only; the worker owns the only `Game`;
   the sim holds 30 Hz at 30k. Keep or drop by the numbers in the ledger.
2. **Non-goals:** no change to what a tick computes; no new sim Hz; no
   parallelism inside a tick (that is sim-tick-30k 06); no renderer or crowd
   smoothing retune; no shared-memory wasm (nightly `-Zbuild-std`, threads
   glue, and a publication protocol on top — three drafts rejected it
   independently).
3. **Transport:** transferred snapshot buffers with a recycling pool
   (postMessage transfer, no SharedArrayBuffer, no Atomics). Two drafts chose
   it; the third chose a seqlock SharedArrayBuffer and slice 00 measures
   both so the choice is by number, not taste. Exactly one ships.
4. **Seam first:** slices 01–03 move the eleven files that read wasm memory
   behind one owner while still in-process, with zero re-blessed baselines.
   They are worth keeping even if 04 is dropped (one owner per concept is
   house style, see `specs/done/debt-ledger`), and they make 04 a
   transport change instead of a consumer rewrite. The alternative — cutover
   as the seam, three slices total — was the fewest-slices draft; it is
   cheaper if the spike is kept and far more expensive if it is dropped.
5. **Sacred:** determinism (`Sim::state_hash`, the golden test, `profile_tick
   duels`), pixel-identical frozen screenshots, the combat design contract,
   the 30k GPU gate (`battle-perf-30k`, which pauses the sim and stays).
6. **Auto-resolve** moves to the worker too (same recipe, both AIs on, the
   existing 21,600-tick cap): after 04 no `Game` exists on the main thread,
   ever. The campaign object itself stays on the main thread.
7. **Background tab:** the worker pauses on `visibilitychange`, matching
   today's rAF stop. Not a new mode, a recorded decision.
8. **Compat / migrations:** none. Hard cutover in 04; the in-process adapter
   from 01 is a named short-lived seam and 04 deletes it in the same commit.
9. **Review surface:** the standing gate scene's numbers table, the
   zero-re-bless diff, and the production line ledger.

## Keep / drop thresholds (the spike's contract)

| Number | Today | Keep | Drop |
|---|---|---|---|
| 15.5k live rAF p50 (seed 7, AI on) | 18 ms | ≤ 12 ms | > 14 ms |
| 30k live rAF p50, sim running | 36–60 ms | ≤ 20 ms | > 25 ms |
| Ticks per wall-second at 30k, live, 20 s | cannot hold | ≥ 29 | < 28 |
| Worker ms/tick at 30k (slice 00) | 25 ms on main | ≤ 30 ms | > 30 ms |
| Main rAF p50 while worker ticks, renderer paused-sim work (00) | 17 ms | ≤ 21 ms | > 21 ms |
| Snapshot publish + delivery per tick (00) | — | ≤ 1 ms / age p95 ≤ 66 ms | > 2 ms / > 66 ms |
| Command latency p95 (click → tick that applied it) | ≈ 16–33 ms | ≤ 70 ms | > 70 ms |
| Stall injection, Δ main rAF p95 | — | ≤ +2 ms | > +5 ms |
| `state_hash` worker vs direct, every fixture | — | identical | any mismatch |
| Re-blessed baselines | 0 | 0 | any |
| Net production lines (gross adds also reported) | — | ≤ +700 | > +900 |
| New production files | — | ≤ 5 | > 5 |

A drop at 00 costs half a day and keeps only the `state_hash` export. A drop
at 04 reverts 04 and keeps 01–03. The record of either goes into
`specs/sim-tick-30k/README.md` next to slice 07.

## Slice graph

```
00 measure (throwaway worker, numbers only) ─── KILL #1
 │
01 read seam: SimFrame/SimStatic + BattleSim owner, in-process adapter
 │
02 command/control seam + async-correct harness + pick centres + state hash
 │
03 campaign handoff as serde JSON (Rust split, hash round-trip)
 │
04 worker host + snapshot transport + HARD CUTOVER (adapter deleted) ─── KILL #2
 │
05 determinism + stall proof, standing gate, keep/drop, close-spec
```

Strictly sequential. 00 before any seam work; 01–03 each leave `main` with
one owner and zero re-blessed pixels; 04 is the verdict; 05 pins it.

## The seam (one owner)

New directory `web/src/battle/sim/` owns "how the main thread reads and
commands the sim". After 04 nothing in `web/src` imports `Game` outside it (a
vitest greps for it). The shape every consumer sees:

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

`SimFrame` is the typed snapshot: header `{tick, soldierCount, unitCount,
victor, projectileCount, seq}` plus `positions, facings, alive, fighting,
loosing, switchCooldown, soldierUnit, currentWeapon, unitInfo (+stride),
projectiles {x,y,z,vx,vy,vz,kind}, queuedOrders {offsets, triples}`. One
layout table (`SIM_FRAME_LAYOUT`) is shared by the in-process adapter (01),
the worker packer and the main-thread reader (04). Consumers never retain a
view across frames; `acquire()` is the only way to get one.

Ownership after 04:

| Owner | Responsibility |
|---|---|
| `sim/battleSim.ts`, `sim/simFrame.ts`, `sim/simStatic.ts`, `sim/simCommand.ts`, `sim/simRecipe.ts` | the types and the layout table; no I/O |
| `sim/simHost.ts` | main-thread `BattleSim`: worker lifetime, request ids, latest snapshot, buffer pool, async failure |
| `sim/simWorker.ts` | the only `Game`; `SimClock` (moves unchanged from `web/src/shared`); tick scheduling with bounded catch-up; command application; queries; result |
| `sim/simSnapshot.ts` | pack a `Game` into one buffer / read one buffer into a `SimFrame` — the only place that knows `*_ptr()` names |
| `campaign_bind.rs` / `lib.rs` | `BattleSetup` / `BattleResult` across the boundary as JSON; pick centres and the queued-orders block in `unit_info`; `state_hash` export |
| every existing loop/render/UI module | presentation from one acquired frame; no wasm imports, no transport |

## What each harness call becomes (determinism, concretely)

| Call | After 04 |
|---|---|
| `freezeAtTick(t)` | `setRun({paused:true})` acked → `advance(t − frame.tick)` runs synchronously in the worker and publishes once → `acquire()` → `tickGroupAttacks()` → `settlePresentedFrame()`. The frozen frame snaps render positions to sim positions (`battleCrowd.ts` frozen branch), so pre-freeze cadence cannot change pixels. Same target tick → same state → same pixels. An already-passed target rejects explicitly. |
| `advance(n)` | request; applied in FIFO order with commands; exact count; resolves after that tick's snapshot has landed. Scenes that call it inside synchronous loops get an `await` (02). |
| `stats()`, `tickCount()`, `unitInfo(u)`, `soldierPos`, `projectileCount` | synchronous over the acquired frame (37 `waitForFunction` predicates depend on this). |
| `p` pause in the 30k gate | `setRun({paused:true})`; the worker stops publishing; `tickCount()` is stable after the in-flight batch (≤ 4 ticks) lands. |
| `pick_unit` | main-thread pure scan over `unit_info` pick centres exported from Rust (`Unit::center()`, not the centroid the layout carries today); parity pinned by a Rust test before the wasm export is deleted. |
| Reinforcements / `spawnClass` | every snapshot is self-sized from its header counts; a count-changing command publishes immediately even while paused (the 30k gate's `waitForFunction(stats().soldiers >= floor)` depends on it). |
| Projectiles | seven arrays plus a count in the frame; frozen-with-effects behaviour is renderer-side and unchanged. |
| Campaign | `Campaign.battle_setup_json(eid)` → recipe → worker `Game.from_campaign_setup_json` (same `campaign::units` modifier closures, run in the worker's copy of the module) → `sim.campaign.result()` → `Campaign.report_battle_json`. Auto-resolve is the same recipe with both AIs on. |

## Risks, ordered by how early they can kill

1. **Worker throughput / memory-bandwidth contention** — 00. A wasm tick in
   a worker should match the main thread (same V8 tier), but Chrome's worker
   scheduling against the render thread on macOS is unmeasured.
2. **Publication cost and staleness** — 00. ~1.2 MB per snapshot at 30k;
   packing is typed-array `.set`, expected 0.1–0.3 ms; delivery age must stay
   under one tick.
3. **Hidden non-determinism** — 00/05. Same binary, same seed, same call
   order must hash-match; a mismatch means something outside the sim leaks in.
4. **Async harness edge cases** — 02, before any worker exists. Six known
   sites read synchronously right after a mutation and get `await`s; unknown
   ones surface as scene failures in 02.
5. **Crowd cadence leaking into pixels** — 04's zero-re-bless gate. The gait
   hysteresis in `battleCrowd.ts` sees every tick instead of rAF batches;
   frozen frames snap, live frames were never pinned.
6. **Campaign envelope losing information** (AI flags, player team, terrain
   source, u64 ids through JS) — 03's hash round-trip test; JS carries the
   JSON opaquely.
7. **Order feel** — one extra tick of latency (≤ 33 ms) is inherent to
   cross-thread; measured in 05, David's call at the checkpoint.
8. **Worker boot per battle** — ~1 MB wasm re-instantiated per battle; if it
   shows, compile once on main and post the `WebAssembly.Module`.

## Firewalls

- `crates/sim` untouched. Rust changes live in `game-wasm` only: `state_hash`
  export, two pick-centre floats and a queued-orders block in `unit_info`,
  the JSON handoff pair.
- No renderer changes, no crowd smoothing retune, no LOD or cull changes —
  the gain must come from the thread split alone or it is not a gain.
- Never weaken a gate to pass a rung; a re-bless is a kill, not a fix.
- No dual modes survive a slice boundary except the in-process adapter
  between 01 and 04, which 04 deletes.

## Drafts and how they diverged

Three independent drafts from the same brief. All three: reject shared wasm
memory; one seam module; measure first; zero re-bless as the determinism
gate; net ≈ +600 production lines. Divergences and the calls made:

- **Transport.** Fewest-slices and risk-first drafts chose transferred
  buffers with recycling (no Atomics reasoning, a transferred buffer cannot
  tear, no production COOP/COEP dependency). Seam-quality chose a seqlock
  SharedArrayBuffer with copy-on-acquire (latest-complete-tick for free,
  zero allocation). Call: transfer by default, 00 measures both, one ships.
- **Seam before worker.** Seam-quality ordered the in-process seam first so
  01–03 are keep-worthy alone; fewest-slices made the cutover the seam (three
  rungs). Call: seam first, for the drop case.
- **Auto-resolve.** Fewest-slices kept a headless main-thread `Game` for it;
  the other two moved it to the worker so no main-thread `Game` survives.
  Call: worker.
- **Kill numbers.** Union of the three; the strictest of each pair.

## Ledger

| after | 15.5k rAF p50 | 30k rAF p50 live | ticks/s @30k | worker ms/tick | cmd latency p95 | net LOC | verdict |
|---|---|---|---|---|---|---|---|
| baseline 2026-09-08 | 18 ms | 36–60 ms | — | 25 (main) | ≈16–33 ms | 0 | — |
