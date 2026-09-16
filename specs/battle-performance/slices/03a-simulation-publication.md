# Bounded simulation publication and camera scheduling

## Contract and scope

Can camera rendering stay responsive while the unchanged simulation advances? The live profile separates long synchronous tick batches from renderer work; moving those batches can release the main thread without making individual ticks cheaper. Preserve both targets: 30 simulation ticks per second and the 60 fps contract in [measurement.md](../measurement.md). A smooth camera over a progressively stale battle does not pass.

Investigate scheduling and publication after 02a freezes the shared fixture. A bounded feasibility probe may run alongside the backend candidates; production integration follows 03 and its selected ownership graph. A worker is an option to measure, not a prescribed outcome. Keep one authoritative `Game`, one tick owner and one command authority. Do not duplicate the simulation, change timestep, skip ticks or alter mechanics, AI, stats, orders or saved data.

## Publication seam

Separate the battle frame coordinator's need for the latest coherent presentation state from synchronous WASM ownership. Start with the observations consumed by `BattleActionAdapter` and the existing battle views, including transient actions, projectiles and HUD data; keep their semantic owner rather than inventing a second action timeline. Each published snapshot identifies its completed tick and command acknowledgements. Never combine arrays from different ticks or expose a buffer while its producer rewrites it.

Use explicit command sequence and application-tick rules so direct and scheduled runs can replay the same accepted command log. Preserve current gameplay ordering and command-delay semantics. Publication may coalesce replaceable presentation snapshots, but cannot lose a required transition or command. Bound outstanding buffers, messages and retained history; consumer starvation and overflow need observable failure/recovery behavior rather than silent loss or unlimited queues. Render/input must not wait synchronously for a simulation reply.

## Evidence and gates

- Replay the canonical benchmark initialization/orders in direct and scheduled execution. Match state hashes at the recorded contact-window checkpoints and after a tick-stamped command sequence; also verify command acknowledgements, transient observations and coherent HUD/projectile state.
- Exercise a slow consumer, repeated pan/zoom, cancellation during preparation/run, restart, hidden tab, failure and disposal. Prove one live simulation and bounded retained resources. Do not manufacture snapshot-age success by clamping negative timestamps or assuming clocks share an origin.
- Measure main-thread gaps, actual tick throughput, snapshot age and command-to-application/presentation latency separately. Preserve uninstrumented controls, the physical framebuffer and all visible work. The live benchmark reports slowdown even when camera cadence improves.
- If worker/scheduling isolation alone misses throughput, explicitly investigate **performance of the unchanged simulation kernel** with the exact workload and optimized-build provenance. Attribute combat, separation, steering and export work before proposing another bounded slice. No mechanics edits are authorized; any implementation must preserve state/order determinism and the existing semantics. If this cannot clear the target, carry the live gate as failed rather than declaring the renderer feature complete.

The exit artifact is a feasibility verdict with measured bounds and a concrete integration/deletion graph, or an evidence-backed no-change result. Do not retain an experimental second production path. Backend comparisons must use the same scheduling/presentation version within a round; refresh controls when that common work changes. Replay-only renderer evidence remains distinct from live acceptance.

Apply the root review and motion-verification contract when implementation begins. Keep the three failures reproduced on untouched `c924e5ce` listed separately as known baseline reds; they neither become green nor waive new scheduling, semantic or performance gates. Preserve all existing test tolerances and thresholds.

## Build feasibility evidence

The [paired CPU replay](../assets/03a-build-feasibility/summary.json) matched the canonical tick 9000/9300 hashes in two opposite-order pairs using fresh Node processes. Production averaged 37.79/38.90 ms per tick; the existing profiling build without wasm-opt averaged 31.39/31.74 ms. This establishes a repeatable difference over the measured window, not a stable kernel speedup or a browser throughput pass: one production run contains a transient spike cluster and then approaches the no-opt cost. The optimized profiling and production artifacts differ in executable sections, and both builds use fat LTO, so neither wasm-opt nor tiering nor LTO is isolated as the cause. Preserve the production build. Any follow-up must separate build-stage controls and compilation tracing before a full-browser acceptance run; the 30 Hz/60 fps targets remain unchanged.

## Integrated worker checkpoint

The production battle now owns its Game in a module worker and publishes every
completed tick through a bounded two-buffer pool. The existing action adapter
and timeline consume observations immediately on receipt; render cadence does
not own publication credit. Campaign entry serializes the existing BattleSetup
and AI teams, and exit reports the real BattleResult to the retained campaign.
The obsolete lab producer/reader/runtime have been deleted. The enduring
ownership contract is in [battle authority](../../../docs/battle-authority.md).

The canonical production-authority test at
`apps/battle-perf-lab/tests/canonicalBattleWindow.canonical.ts` compares all 309
completed ticks from 9000 through 9308 against direct execution, including
pinned state hashes, observations and render facings. This is CPU semantic
parity, not browser throughput. Focused combined tests cover worker lifecycle,
campaign handoff, timeline and shared-image behavior. Historical CPU timing
remains [retained evidence](../assets/03a-publication/README.md), never a timing
claim for the integrated runtime.

Hardware Chrome checks cover actual campaign entry/exit, reinforcements and
Menu preparation/cancellation/export. Full moving-camera frame cadence,
publication age, command-to-visible latency and sustained simulation throughput
remain acceptance gates. A responsive camera over an increasingly stale battle
still fails this slice.
