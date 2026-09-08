# Isolated CPU phase profile

One CPU-only profile on source `c530452a` separates the major callable owners.
It prioritizes further investigation; it does not establish browser performance,
a hardware speedup or an accepted budget. No production code, telemetry, clock,
threshold, cache or atomicity behavior changed in this pass.

The scratch runner uses Bun 1.3.14/JavaScriptCore, not Chrome/V8. It calls the
actual timeline, instance builder, terrain sampler, world seating method, LOD
planner and playback packer. GPU construction is omitted: the seating method
receives only its terrain resource dependency; the shadow configuration receives
the renderer capability fields used by the existing CPU shadow tests. No device,
renderer submission, browser, grass update or GPU queue is created or timed.
Preparation here is the packer alone, not the entire browser `uploadMs` phase.

Inputs are the current 30k mounted synthetic fixture (67 joints, four influences,
2304/576/144 triangles, doubled authored intervals), recorded hardware camera,
flat 1024m terrain and production single-shadow configuration. Actual LOD output
matches the hardware population: 6113 main near and 23887 shadow-only; all30k
shadowL2. Seating checks all30k bodies, reports matches=true and span=0.

There are 144 deterministic integer observations sampled at half ticks: 24
warmup and 120 measured interrupted frames. This is intentionally not the live
capped wall-time distribution. A 1ms sampling profiler covers the entire process,
including setup/warmup; the per-phase timers below cover only the 120 measured
frames. Timings include profiler overhead and ambient CPU scheduling.

| CPU phase | Median ms | p95 ms |
| --- | ---: | ---: |
| Fixture observation preparation | 0.102 | 0.167 |
| Timeline observation | 11.553 | 20.433 |
| Timeline sampling | 3.629 | 5.925 |
| Instance build | 1.542 | 2.609 |
| Seating diagnostic | 0.387 | 0.589 |
| LOD planning | 2.266 | 3.310 |
| Playback packing | 2.213 | 5.309 |

[Every measured row](cpu-profile-summary.json) and the [raw sampled profile](current.cpuprofile)
are retained. Across the full sampled process, timeline update has 1890.817ms
inclusive samples. Its clip resolution has 638.990ms inclusive samples across
nominal-speed and track paths, approximately34% of that update stack. Object
cloning directly under the observation callback has336.754ms (~18%). These
inclusive stacks are nested: do not add nominal-speed, actionClip, find and
predicate totals as though they were separate costs. LOD has451.069ms inclusive,
packing440.961ms, and seating69.839ms over the same full-process profile.

## Disposition

1. **Clip metadata resolution is the strongest next optimization candidate.**
   The earlier work-count audit showed at least90k searches per30k ordinary
   moving observation; this profile now locates significant time there despite
   the six-clip bound. Before implementing, settle its lifetime explicitly:
   avoid a persistent mutable-appearance cache. A within-observation-batch
   resolution table could be investigated against exact output, absent-role
   errors, rejected-batch atomicity, reset and appearance replacement. This is
   a proposed direction, not an authorized or implemented cache.
2. **History cloning is second, with higher semantic risk.** It helps preserve
   atomic batches and the previous pose used by interrupted reactions. A
   copy-reduction change needs retained-public-output and failing-later-soldier
   controls, not merely equivalent final samples.
3. **Do not prioritize seating based on repeated30k counts alone.** Its measured
   median is only0.387ms in this flat fixture. Retain diagnostic freshness; it
   does not explain the broad upload/preparation red. LOD and packing are larger
   but contain required work and existing capacity/identity reuse.

No additional micro-optimization or hardware run follows this profile. Browser
profiling would be needed before treating JavaScriptCore attribution as V8
attribution, but it need not block the independently unresolved live root/phase
policy. The hardware envelope remains red.

## Reproduction and review

Scratch entry point, preserved locally:
`/Users/david/dev/game-current-animated-budget/throwaway/budget/profile-cpu.ts`.
Run from this worktree with:

```sh
bun --cpu-prof --cpu-prof-dir throwaway/budget --cpu-prof-name current.cpuprofile \
  throwaway/budget/profile-cpu.ts
```

Terminal96046 exited0. An initial `--tsconfig-override web/tsconfig.json` setup
attempt failed before work because Bun followed Three's type-declaration alias;
ordinary module resolution ran the unchanged source successfully. No production
workaround was introduced. The profile is diagnostic evidence, not a new test
gate or baseline; no tests or unit-stat expectations moved. Main read the raw
stack relationships and reconciled these totals against the phase report.
