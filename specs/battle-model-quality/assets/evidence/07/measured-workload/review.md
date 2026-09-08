# Current-contract animated workload

The timed synthetic workload supplies measured forward travel, not an exertion
hint. Its walk/run paces come from the selected fixture's authored stride and
duration; the mounted diagnostic uses 1/2 m/s. This is synthetic observation
input, not proof of individual propulsion or a simulation change. Fixed crowd
positions, the actual capped wall-time clock, release schedule, production
renderer, timing ownership and 33 ms thresholds remain unchanged.

This is a **new workload baseline**, not a speedup comparison with the earlier
constant-1-m/s measurements. Those historical measurements genuinely exercised
walk and release overlays but their obsolete running hint did not select run.
The distinct-history allocation workload is unchanged and remains outside timed
cadence measurements. No art envelope is accepted.

## CPU and review

The synchronized schedule now lives in the existing typed synthetic-fixture
owner, consumed by both the browser benchmark and a real ActionTimeline test.
The red tracer used constant speed and failed specifically because only
`fixture-walk` was selected. After measured pace selection, both roles are
observed, release overlays occur only in the interrupted row, and fractional
samples advance base phase throughout the cycle. All 355 web tests and the full
TypeScript check pass. Seven pre-existing synthetic-fixture tests stay unchanged.

Independent bundled Codex review 7448, session
`01a07f73-0674-7033-870e-aa0dbd5f784e`, completed terminal 0 with no actionable
defects. It independently passed all eight fixture tests with the runner config
loader after its default loader was blocked from writing linked dependencies.
It performed no GPU validation.

Shape review keeps one fixture schedule owner and deletes the obsolete inline
schedule, with no new benchmark, renderer or clock. Diff review leaves runtime
and simulation untouched. Representative clip and phase telemetry is recorded
outside CPU submission timing; all bodies share the synchronized history.
Root owns the slice pickup, README and checkpoint updates.

## Change ledger

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| `timed mounted workload exercises measured walk/run and release interruptions`, `web/tests/syntheticBudgetFixture.test.ts` | New regression on constant speed observed only `fixture-walk`, failing the expected two-role set | Steady selects only walk; interrupted selects walk and run with release overlays; every half-tick sample advances base phase | Current timeline selects gait from measured speed, so the obsolete hint was ineffective. **moved** |

No existing assertion, performance threshold, screenshot baseline or unit stat
was re-pinned.

## One hardware measurement

Frozen source `fdb6a12a`, run 77370, started 2026-09-08 05:28:15 UTC and reported
at 05:29:10.118 UTC. It completed terminal 1 with seven performance failures,
no page errors and no renderer warnings. Browser processes were closed and the
GPU released at 05:29:13 UTC. Exactly one run was performed; no retry or budget
change followed. [Raw report](hardware.json) preserves every frame and check;
[summary](hardware-summary.json) preserves phase percentiles, sampled tick
intervals, observed gait counts, LOD/palette demand and allocation details.

Chrome 152.0.7977.77 ran headless on Apple M5 Pro (20 GPU cores). Every row
reported the actual `apple / metal-3` device, not SwiftShader. The viewport was
5120×2880 at DPR1, matching the available external physical display. The other
available physical display is 3024×1964; neither it nor the required 1280×800
baseline was remeasured in this bounded pass.

| Row | CPU median / p95 ms | RAF p95 ms | GPU-queue median ms |
| --- | ---: | ---: | ---: |
| Steady control | 21.580 / 33.940 | 99.995 | — |
| Steady timed | 26.560 / 41.315 | 50.000 | 32.824583 |
| Interrupted control | 34.505 / 52.125 | 50.000 | — |
| Interrupted timed | 38.190 / 55.280 | 66.660 | 38.850740 |

All four cadence rows fail 33 ms; both interrupted CPU medians and the
interrupted GPU-queue median also fail. Each timed row has 180/180 measured,
unique frame-correlated GPU results with no timestamp errors. GPU-queue elapsed
includes submission gaps; it is not active GPU pass time and must not be added
to overlapping CPU durations.

Both steady rows sampled only walk. Interrupted control sampled 22 walk / 158
run frames with 55 overlay frames; interrupted timed sampled 16 walk / 164 run
with 46 overlay frames. The actual capped clock advances different intervals
under different frame cost; these are measured frame proportions, not battle
frequencies or matched per-tick comparisons. Fractional sample ticks are in the
raw report. The requested 30k bodies remain submitted: 6,113 main-view near
meshes and 23,887 shadow-only, with all 30k receiving far-tier shadows and
67-joint palettes. It is not 30k near meshes. Geometry is 2304/576/144 triangles,
four influences, doubled authored intervals and three uploaded 1024 maps.

After timing, the independent allocation phase measured 355,307,060 final
tracked live bytes and 582,827,076 peak bytes. This covers fresh crowd resource
generations and replacement overlap, not full-world storage or opaque driver
VRAM. Its 60k distinct-history admission is not a timed cadence result.

Machine-wide contention remains a limitation. The initial snapshot showed this
lane's Vite doing cold transforms (~546% CPU), a separate VM (~111%) and Codex
processes (~35/32%). A later snapshot showed an unrelated simulation test
process (~99%) and Codex (~44/35%) alongside the measured Chrome renderer.
These are spot observations, not a continuous profile or proof of causation;
no unrelated processes were stopped. Historical timings therefore cannot
identify a slowdown caused by this workload repair. The result establishes
that this current workload does not meet the envelope in this run, not why.

Reproduce from this frozen source with its dedicated Vite on port 5457:

```sh
BUDGET_FIXTURE=mounted BUDGET_SOLDIERS=30000 BUDGET_FRAMES=180 \
BUDGET_WIDTH=5120 BUDGET_HEIGHT=2880 BUDGET_CAMERA=gameplay BUDGET_STOPS=close \
BUDGET_DETAIL='{"subdivisions":[2,1,0],"jointCopies":8,"influences":4,"keySubdivisions":2}' \
BUDGET_TEXTURE_SIZE=1024 VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware \
VERIFY_BROWSER_CHANNEL=chrome VERIFY_URL=http://127.0.0.1:5457 \
SCENARIO_REPORT_JSON=../throwaway/budget/current.json \
node web/scene.mjs battle-model-budget
```

Budget07 stays open. Observation and upload/preparation dominate the recorded
CPU phase medians, but profiling would be required to attribute those phases to
specific allocations or algorithms. This pass neither optimizes them nor
introduces another renderer/timer. Real simulation, WASM extraction and battle
UI are still excluded; the separate standing30k/foliage gate is unchanged.
