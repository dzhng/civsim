# Held-authority renderer comparison

A lab build can run the actual Menu benchmark with the simulation held at a
canonical contact tick, so backends are compared on identical scene state rather
than on however far each run's simulation got. It is a renderer-only measurement
and can never stand in for the live benchmark.

Set `BATTLE_BENCHMARK_HELD_TICK=9000|12000` when building either the
[source](../source/vite.config.mts) or the [native live](../live/vite.config.mts)
configuration. Unset keeps the live benchmark. The value substitutes only the battle
loop's `benchmarkAuthority` import, and a build that never reaches that import fails;
there is no menu setting, and ordinary builds keep their original import.

## Contract

- Preparation is the Menu benchmark's own: the same seed, opening orders and scripted
  advance, ending at the held tick, which becomes the run's start tick.
- The authority is never released. `BenchmarkRun` fails the run as soon as a recorded
  frame sees a different tick or state hash from the one timing started with.
- The report is a separate kind, `battle-benchmark-renderer-only`, with a `scope`
  naming the held tick and the initial and final state hashes. The live scorecard
  rejects any report carrying a scope, and a trial record names its `measurement`.
  The completion scene applies held checks in place of "simulation remained live" and
  still requires a pinned contact-state hash; both contact ticks are pinned from independent canonical execution.
- Camera tour, crowd poses and environment time all read the run's elapsed clock. The
  source renderer uses the packet's time only under this clock; live builds keep its
  per-hook wall-clock sampling.
- Bodies, life, weapons and attack arcs stay on the held tick; they are never
  extrapolated. Actions keep playing from that tick. One-shot clips clamp at their end
  and no new tick restarts them, so the held interval replays each time the catalog's
  longest one-shot action could finish: shorter one-shots rest on their last pose for
  the remainder of the period, and every pose jumps once per period.

Cancellation, failures and disposal follow the Menu benchmark unchanged, and a
cancelled or failed held run leaves the authority held. The final hash is the one the
latest recorded frame saw; a terminal call does not resample it.

## Build and run

From the repository root, one build per backend and tick, into a fresh directory:

```sh
BATTLE_BENCHMARK_HELD_TICK=9000 web/node_modules/.bin/vite build \
  --config apps/battle-perf-lab/src/source/vite.config.mts --outDir <out>/source-held-9000
BATTLE_BENCHMARK_HELD_TICK=9000 BATTLE_NATIVE_BACKEND=raw \
  BATTLE_NATIVE_ATLAS_CATALOG=<catalog-url> web/node_modules/.bin/vite build \
  --config apps/battle-perf-lab/src/live/vite.config.mts --outDir <out>/raw-held-9000
```

Serve and run them exactly like live fixed builds, through the
[trial runner](../../trials/README.md) or the `battle-benchmark-complete` scene.

## Limits

No simulation CPU is exercised during the window, so results describe rendering and
presentation only. CPU tests cover the run, report, crowd presentation, source clock,
build substitution and scorecard rejection. Whether the whole loop holds in a
browser, the rendered motion remain unverified.
