# Sim Tick 30k Investigation

Investigation date: 2026-07-02

Scope: additive benchmark/profiling only. Default `crates/**` behavior is unchanged; timing code is behind `--features perf_timing`, and the benchmark binary is gated by that feature.

## Repro

Primary scale sweep:

```bash
cargo run --release -p sim --features perf_timing --bin sim_tick_30k -- \
  --soldiers 5000,15000,30000,60000 \
  --scenario both \
  --ticks 300 \
  --warmup 60 \
  --repeats 2
```

Combat sub-stage rerun:

```bash
cargo run --release -p sim --features perf_timing --bin sim_tick_30k -- \
  --soldiers 5000,15000,30000,60000 \
  --scenario fighting \
  --ticks 300 \
  --warmup 60 \
  --repeats 2
```

Build check:

```bash
cargo check -p sim --features perf_timing --bin sim_tick_30k
```

Full verification:

```bash
cargo test --workspace
```

Environment captured:

```text
rustc 1.94.1 (e408947bf 2026-03-25)
cargo 1.94.1 (29ea6fb6a 2026-03-24)
Darwin Davids-MacBook-Pro.local 25.4.0 arm64
```

The macOS sandbox rejected `sysctl` CPU/memory queries, so the exact CPU model is not recorded here.

## Harness Shape

The benchmark mirrors the native equivalent of the browser quick-battle path:

- `Sim::new(Tunables::default(), 0x5eed_c0de)`
- `sim.terrain = build_map(MapId::RiverAndCrags)`
- repeated quick-battle Balanced Host class picks
- `spawn_class_with_files(anchor, facing, soldiers, files, class, team)`
- establishment sizes from `contract::unit_size`, matching `web/src/main.ts`
- `files = round(sqrt(soldiers * 1.6)).max(6)`, matching `web/src/main.ts`
- `Battle::from_sim(sim)` with AI off

Scenarios:

- `idle`: same two armies, deployed at y = -260 / +260 with no orders.
- `fighting`: same two armies, front lines initially engaged at y = -12 / +12 with no AI. This intentionally stresses melee, collision, and target scans without commander cost.

The requested soldier counts are targets. Actual counts follow whole quick-battle unit establishments.

## Scale Results

Primary sweep, 300 measured ticks after 60 warmup ticks, two repeats.

| scenario | requested | actual soldiers | units | mean ms/tick r1 | mean ms/tick r2 | avg ms/tick | repeat delta |
|---|---:|---:|---:|---:|---:|---:|---:|
| idle | 5,000 | 5,000 | 10 | 2.545 | 2.591 | 2.568 | 1.8% |
| idle | 15,000 | 15,300 | 36 | 11.243 | 11.392 | 11.318 | 1.3% |
| idle | 30,000 | 30,600 | 72 | 24.584 | 24.477 | 24.531 | 0.4% |
| idle | 60,000 | 60,200 | 142 | 57.167 | 57.425 | 57.296 | 0.5% |
| fighting | 5,000 | 5,000 | 10 | 5.674 | 5.619 | 5.647 | 1.0% |
| fighting | 15,000 | 15,300 | 36 | 24.795 | 24.805 | 24.800 | 0.0% |
| fighting | 30,000 | 30,600 | 72 | 50.275 | 50.286 | 50.281 | 0.0% |
| fighting | 60,000 | 60,200 | 142 | 138.558 | 137.745 | 138.152 | 0.6% |

The combat-instrumented rerun was close but slightly faster:

| scenario | requested | actual soldiers | units | mean ms/tick r1 | mean ms/tick r2 | avg ms/tick |
|---|---:|---:|---:|---:|---:|---:|
| fighting | 5,000 | 5,000 | 10 | 5.536 | 5.415 | 5.476 |
| fighting | 15,000 | 15,300 | 36 | 24.205 | 24.279 | 24.242 |
| fighting | 30,000 | 30,600 | 72 | 49.207 | 49.671 | 49.439 |
| fighting | 60,000 | 60,200 | 142 | 136.411 | 135.804 | 136.108 |

Scaling is superlinear, especially at high density:

- Idle 30.6k to 60.2k: 1.97x soldiers, 2.34x time.
- Fighting 30.6k to 60.2k: 1.97x soldiers, 2.71x time in the combat-instrumented run.
- This is not a clean whole-tick O(n^2) curve, but the high-density fighting case exposes a non-linear collision projection cost.

## Hotspots

Percentages are percent of wall-clock tick time for the measured run. Nested collision/combat sub-stages are shown under their parent and should not be summed with the parent.

### 30.6k Idle

Average wall time: 24.53 ms/tick.

| stage | mean ms/tick | % wall | note |
|---|---:|---:|---|
| `tick.separation` | 17.99 | 73.3% | top-level collision/separation pass |
| `collision.weapon_repel` | 14.70 | 59.9% | nested in separation; scans weapon reach even while armies are idle/far |
| `tick.steer_soldiers` | 6.31 | 25.7% | per-soldier formation/cohesion steering |
| `collision.body_scan` | 2.94 | 12.0% | nested in separation; body grid overlap scan |
| `tick.combat` | 0.12 | 0.5% | negligible while idle |

### 30.6k Fighting

Average wall time from combat-instrumented rerun: 49.44 ms/tick.

| stage | mean ms/tick | % wall | note |
|---|---:|---:|---|
| `tick.combat` | 23.57 | 47.7% | top-level melee pass |
| `combat.attacker_grid_strikes` | 23.48 | 47.5% | nested in combat; per-attacker bucket scan, target choice, strike resolve |
| `tick.separation` | 20.42 | 41.3% | top-level collision/separation pass |
| `collision.weapon_repel` | 14.79 | 29.9% | nested in separation |
| `tick.steer_soldiers` | 5.37 | 10.8% | per-soldier steering/cohesion |
| `collision.body_scan` | 3.04 | 6.2% | nested in separation |
| `collision.projection` | 2.28 | 4.6% | nested in separation; extra Jacobi body projection |

### 60.2k Fighting

Average wall time from combat-instrumented rerun: 136.11 ms/tick.

| stage | mean ms/tick | % wall | note |
|---|---:|---:|---|
| `tick.separation` | 63.84 | 46.9% | top-level collision/separation pass |
| `tick.combat` | 55.51 | 40.8% | top-level melee pass |
| `combat.attacker_grid_strikes` | 55.31 | 40.6% | nested in combat; almost all combat time |
| `collision.weapon_repel` | 30.75 | 22.6% | nested in separation |
| `collision.projection` | 25.72 | 18.9% | nested in separation; grows sharply from 30k |
| `tick.steer_soldiers` | 16.46 | 12.1% | per-soldier steering/cohesion |
| `collision.body_scan` | 6.75 | 5.0% | nested in separation |

## Diagnosis

The renderer perf gate's 30k-soldier main-thread saturation is reproducible natively. At 30.6k soldiers with AI off:

- idle tick is ~24.5 ms/tick
- engaged fighting tick is ~49-50 ms/tick

That already exceeds the whole 30fps frame budget before renderer or UI work. At 60k, fighting reaches ~136-138 ms/tick, consistent with the reported frame catch-up spiral.

The dominant costs are not AI, pathing, morale, missiles, order delivery, or terrain navigation. Those are all effectively zero in these runs.

The idle cost is mostly separation, specifically `collision.weapon_repel`. That pass scans bodies through reach-sized grid windows for every bearer even when formations are far apart and no repel can apply. This is the largest low-risk optimization target because it is expensive in the idle case where it should often be skipped.

The fighting cost is split between:

- `combat.attacker_grid_strikes`: per-attacker nearby body scans, friendly obstruction sampling, target selection, weapon choice, and strike resolution.
- `collision.weapon_repel`: reach scan for weapon standoff/hedge repel.
- `collision.projection`: iterative body projection, small at 30k but very large at 60k engaged density.
- `tick.steer_soldiers`: formation/cohesion steering, roughly linear but non-trivial.

The scaling curve is superlinear under the current quick-battle packing. The battlefield spread caps at 1700m like the browser quick battle, so adding soldiers increases local density as well as total soldier count. That makes per-soldier grid scans see more candidates and makes projection activate harder. The result is not a pure quadratic whole tick, but the high-density collision path has non-linear behavior.

## Recommendations

1. Gate `collision.weapon_repel` by unit/enemy proximity before scanning bodies.

Estimated impact: up to ~14-15 ms/tick at 30k idle, ~30-31 ms/tick at 60k idle, and a meaningful slice of fighting time. This is the clearest first target.

Risk: medium. It must preserve the exact cases where a weapon repel can affect an enemy. Use a conservative unit extent + max reach + safety pad and keep iteration order unchanged inside the active set.

Determinism: can preserve determinism if the active set is computed from deterministic positions and stable unit order.

2. Replace duplicated reach/grid scans with a shared per-tick contact neighborhood.

Estimated impact: high in fighting. `combat.attacker_grid_strikes` is ~23.5 ms/tick at 30k and ~55.3 ms/tick at 60k; `collision.weapon_repel` separately scans overlapping spatial neighborhoods.

Risk: high. Target choice, obstruction, weapon repel, and combat are sensitive to candidate ordering and deduping, especially mounted two-body soldiers. This should be built behind strict golden/state-hash and scenario checks.

Determinism: can preserve determinism, but only with stable candidate ordering and no hash iteration order feeding decisions.

3. Attack the 60k projection spike.

Estimated impact: small at 30k (~2.3 ms/tick fighting), large at 60k (~25.7 ms/tick fighting). Options: make projection activation narrower, early-exit by unresolved-overlap count, reuse body/grid work between projection passes, or reduce projection to dirty contact regions.

Risk: high for battle feel. Projection is enforcing physical non-overlap in dense fighting; weakening it can reintroduce interpenetration or line pass-through.

Determinism: can preserve determinism if it remains Jacobi-staged with fixed pass order.

4. Add deterministic sleeping/dirty regions for at-ease units.

Estimated impact: medium. `tick.steer_soldiers` is ~6.3 ms/tick at 30k idle and ~18.4 ms/tick at 60k idle. Sleeping fully settled, far-from-threat units could remove most idle steering cost.

Risk: medium-high. Idle fidget, cohesion recovery, terrain escape, and wake-up thresholds are behavior. This should be treated as a sim behavior change, not a pure perf refactor.

Determinism: can preserve determinism with deterministic wake rules, but it will change tick-by-tick state unless carefully constrained.

5. Move per-tick temporary buffers into reusable scratch storage.

Estimated impact: low-medium. The measured `prepare_bodies_grid` and accumulator setup are small, but the hot passes allocate or clone several large vectors (`mom0_x/y`, wall arrays, repel arrays, combat accumulators, `gang_rank`, `near_enemy`). Reusing buffers should reduce allocator pressure and memory bandwidth variance.

Risk: low if carefully scoped to storage reuse.

Determinism: preserved.

6. Parallelize only after reducing duplicated work.

Estimated impact: potentially high on native and wasm threads, especially for steering, body scans, and combat target scans. But current hot loops write staged shared buffers, use deterministic RNG, and rely on stable ordering.

Risk: high. Parallel reductions can break deterministic tests through ordering, floating-point accumulation, RNG consumption, or staged write conflicts.

Determinism: at risk unless work is partitioned into fixed chunks with deterministic local buffers and a stable merge order. The wasm SharedArrayBuffer path can help delivery, but it does not remove this determinism problem.

7. Consider tick-rate/frame decoupling as a product fallback, not the primary fix.

Estimated impact: avoids catch-up spirals and can protect renderer frame time, but it does not make one sim tick cheaper. A lower sim Hz changes battle dynamics unless retuned.

Risk: medium-high product/sim behavior risk.

Determinism: can preserve seed stability if fixed-step scheduling remains deterministic, but outcomes will differ if the effective sim timestep changes.

## Bottom Line

For 30k live battles at 30fps, the current 30.6k fighting tick needs roughly a 2x reduction just to fit a 33 ms frame alone, and more realistically a 3x reduction to leave renderer/UI headroom. The first practical target is `collision.weapon_repel` because it is extremely expensive even in idle. The second target is the combat per-attacker grid/target/strike scan. At 60k density, projection becomes a third major blocker.
