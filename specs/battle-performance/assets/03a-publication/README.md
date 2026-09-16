# Simulation publication evidence

## Current implementation

The production worker and campaign boundary are integrated in `fea12281` and
`c7a88be1`. The two-buffer production authority replaces the original single-credit
lab runtime; that runtime and its duplicate reader have been deleted. Use
`apps/battle-perf-lab/tests/canonicalBattleWindow.canonical.ts` for the current
canonical correctness comparison. The original experiments below describe the
commits that produced their saved artifacts, not runnable paths in the current
tree. Their timing is not evidence of an integrated speedup.

## Historical feasibility experiment

This lab-only experiment tests transfer of completed-tick observations from one
worker-owned production `Game`. It does not integrate a worker into the game.
The existing `BattleActionAdapter` and `ActionTimeline` remain the semantic
owners; matching their raw inputs is not proof of their production integration.

The producer copies all raw adapter inputs, positions, unit/HUD records and live
projectile records at every observed tick. It transfers a single 4 MiB buffer;
the consumer owns that buffer until it returns a credit. No producer can rewrite
the transferred storage. One pending command is accepted in sequence, for a
future tick at most 32 ticks ahead, and applied immediately before that tick's
`advance_ticks(1)`. The acknowledgement rides the resulting snapshot. Commands
still enter the unchanged `set_attack_order`, including its gameplay delay.
The runner repeats one opening attack order in its replay window; this is an
idempotent delivery/acknowledgement check, not proof of a changed gameplay outcome.
Ordering and invalid input
are separately exercised by the tests.

A slow or hidden consumer withholds credit: simulation stops, no observation is
coalesced and no required transition is silently dropped. This deliberately
sacrifices throughput under starvation. It cannot satisfy the live 30 Hz gate
if the consumer cannot keep up. The worker holds no snapshot queue; the supplied
client has one message/credit in flight and no command queue. The fixed fixture
owns one Game; `free` occurs on dispose/failure, and the worker then exits. This
bounds application-held buffers, not WASM allocator reservation or process RSS.
The harness has a 20-minute worker watchdog, a 10-minute preparation gate and a
2 MiB report limit; no indefinite wait is an accepted run.

Preparation uses unchanged 30-tick calls to tick 9000. Direct and worker contact
arms both advance one tick at a time and capture raw observations each tick.
The optional `control.mjs` retains the prior four-tick, uninstrumented CPU
window. All runners consume the existing production WASM without rebuilding.

`probe.mjs` reports CPU time inside each tick call separately from copy/hash
work, whole-run elapsed time, snapshot age and command application/observation
latency. Age starts immediately after tick completion, before copying, using
Node's process-wide monotonic `hrtime` clock. Node dispatch gaps are not browser
frame times: the direct arm deliberately runs one uninterrupted loop, and no
production main-thread scheduling comparison is implied. The worker arm holds
one snapshot for 200 ms to test starvation, included in whole-run elapsed time.

Run from the repository root with Node 24:

```sh
node --test apps/battle-perf-lab/simulation/publication.test.mjs
PUBLICATION_GATE=/absolute/scratch/direct-go node apps/battle-perf-lab/simulation/probe.mjs direct web/src/wasm /absolute/scratch/direct.json
PUBLICATION_GATE=/absolute/scratch/worker-go node apps/battle-perf-lab/simulation/probe.mjs worker web/src/wasm /absolute/scratch/worker.json
node apps/battle-perf-lab/simulation/compare.mjs /absolute/scratch/direct.json /absolute/scratch/worker.json /absolute/scratch/parity.json
PUBLICATION_GATE=/absolute/scratch/control-go node apps/battle-perf-lab/simulation/control.mjs web/src/wasm /absolute/scratch/control.json
```

Each arm prepares and prints `ready`; create its distinct gate file only after
an explicit quiet timing grant. Run the arms serially, disposing each authority
before the next begins. Use new gate paths for each experiment.

## Integration and deletion graph

Any production integration must first separate raw observation reading from
WASM pointer ownership in the existing adapter, then feed the existing action
timeline and HUD/projectile consumers from coherent records. It must replay
required transient observations even when camera frames are skipped, prove
command ordering under real input, and define starvation recovery without
hiding slowdown. Production frame coordination, browser clocks, pan/zoom,
hidden-tab recovery, preparation cancellation and actual resource lifetimes
must then pass browser checks at the unchanged framebuffer and visible workload.
No alternate action timeline or second Game is introduced by this experiment.

At an approved cutover, remove synchronous Game ownership from that same frame
coordinator; do not retain a permanent direct/worker switch. Delete these lab
runners after their evidence has been superseded. If the unchanged kernel
cannot sustain 30 Hz, retain the failed live gate and investigate kernel/build
cost separately; worker isolation alone is not a tick-throughput optimization.

## Checks and remaining gates

Two tests exercise ordered-command rejection/application, no queued snapshots
under starvation, transfer detachment, preparation cancellation, restart and
invalid-credit failure with zero live Games/retained producer buffers. A short
nine-snapshot direct/worker smoke replay also agrees byte-for-byte. These are
new transport tests; no existing test behavior or tolerance changed.

Browser action/HUD/projectile execution, `ActionTimeline` playback across a long
window, pan/zoom, hidden-tab restart, browser failure recovery, steady throughput
and 60 fps remain open. The three known untouched-baseline
reds (frozen pixel identity, impostor tier, screen-to-ground smoke assumption)
remain separate and unwaived.

## Consumer verification

`BattleActionAdapter` accepts the typed observation source owned by `battleViews.ts`.
The live producer reads current WASM views; the lab's `publishedObservations.ts` reads
one held publication through the shared layout reader. Metadata parsing/validation has
one owner. The former Game/Memory-shaped proxy is deleted; no compatibility overload
or alternate action timeline remains.

The source exposes a cheap completed-tick count separately from raw view construction.
The adapter can therefore reuse an unchanged tick without constructing discarded typed
arrays. Growth, shrink, rewind and release still invalidate or reject the appropriate
read. Retained presentation owns its copies; no typed view may survive return of the
publication buffer.

Focused tests exercise the actual adapter on both sources, real release transitions
through `ActionTimeline`, posture/weapon changes and storage ownership. The canonical
entry below proves transport and consumer parity together. Production worker scheduling,
HUD/input, interpolation and long-window playback remain later integration gates.

## Canonical window through the worker

[The typed-source root verification](canonical-observation-seam.json) passes all 309 completed ticks
from 9000 through 9308 with zero mismatches. It exercises the actual single-credit
worker and existing `BattleActionAdapter`, with a direct `Game` as the oracle in a
separate serial arm. Worker identity metadata, raw observations, render facings,
unit/projectile records, checkpoint hashes, command acknowledgement and endstate
agree. Fighting, guarding, release and movement observations change within the window.

The consumer holds at most one 4 MiB publication buffer; the largest used snapshot is
878,710 bytes. Withholding credit queues no extra snapshot, every returned buffer
detaches, and disposal leaves zero producer Games or retained buffers. These are
application ownership bounds, not physical memory measurements.

The heavy entry is `apps/battle-perf-lab/simulation/publicationConsumer.canonical.ts`,
run through `vitest.canonical.config.mts` with an absolute
`PUBLICATION_CANONICAL_REPORT` output path. It stays outside the fast default suite.
The earlier implementation run had a report collision and was discarded; the earlier clean
artifact remains retained as `canonical-consumer.json`. The typed-source rerun at
`235886dc` matches its worker rows, direct rows, identity and resource results exactly;
[the comparison](canonical-seam-comparison.json) records that cross-version check.

This proves CPU publication consumer correctness. The command remains idempotent;
browser input/HUD/rendering, long-window `ActionTimeline` playback, interpolation and
camera scheduling remain unverified. The unchanged kernel, producer backpressure and
unmeasured browser frame cadence still prevent any 30 Hz or 60 fps conclusion.

## Measured CPU pair

[Direct](direct.json) and [worker](worker.json) agree on every completed-tick
state and raw-observation digest in [the comparison](parity.json), including
the canonical checkpoints and the post-command endpoint. Both use the same
production WASM digest recorded in [provenance](provenance.json). No mechanics,
AI, timestep, orders or assets changed. The pair had explicit, separate quiet
contact slots after serial unmeasured preparation.

Direct tick calls totalled 8648.44 ms; worker tick calls totalled 8700.91 ms
for the same contact window. This is effectively the same kernel throughput,
not a worker speedup. One short pair cannot establish steady 30 Hz or browser
acceptance. Copy plus state-hash overhead was about 43 ms per arm; the consumer's
raw-byte digest cost is additional, outside that copy metric. The largest
receipt-age values were 0.83/0.66 ms, before any real renderer/HUD work. The
starvation hold starts after receipt, so it is deliberately not included in
that age metric. Presentation age and command-to-visible-frame latency remain
unmeasured.

The largest coherent payload was 878,710 bytes and included up to 70 live
projectiles. The single command reached application in 0.106/0.122 ms and its
resulting observation in 31.70/30.78 ms (direct/worker). Those timestamps end at
CPU receipt, not presentation. They establish neither real player input latency
nor a second non-idempotent order's gameplay effect.

The [uninstrumented control](control.json) took 9420.51 ms (31.85 ticks/s)
for the same contact window using the existing four-tick batches. It ran after
the direct and worker arms, in its own quiet slot. Its slower result means this
ordered, single-run set cannot isolate publication overhead from runtime/tiering
or host-state variation. Do not subtract those runs or infer a throughput
improvement. Sustained and repeated browser acceptance remains unmeasured.

The measured runtime is preserved in commit `4f134597`. A subsequent robustness
pass copies accepted command fields (so a direct caller cannot mutate its queued
intent) and clears timers on worker failure while preserving the original error.
The final tree passes three focused tests and the short direct/worker parity
replay; the canonical timing pair was not rerun after those changes. The ordering
test now also verifies caller mutation cannot alter an accepted order; the new
CLI failure test verifies missing WASM exits promptly with the original cause.
No existing production test changed behavior or tolerance.

## Browser candidate checkpoint

[Candidate e71f4ac8](browser-worker-candidate.json) boots a real module worker, advances a standalone battle with matching soldier counts, and passes all seven existing hardware Chrome Menu preparation/cancel/export checks. Preparation holds the rendered battle frame while ticks advance. This was the standalone checkpoint before the now-integrated campaign follow-up. No live frame-rate, campaign, full five-minute or final integrated acceptance is implied. Earlier software-adapter timeouts and a local WASM serving denial are invalid hardware controls, retained separately in scratch logs.

[Campaign worker hardware follow-up](campaign-worker-browser.json) passes existing campaign entry/exit and reinforcement scenes after a separate rebuilt WASM boundary. The campaign retains its authority and receives the worker battle outcome; generated terrain identity comes from the constructed Game. Seven Rust handoff tests and 28 focused worker tests pass. The follow-up is now integrated after review, campaign worker lifetime repair and the 309-tick canonical comparison. Full live performance remains open.

## Integrated full-window verification

The first full worker run exposed preparation drift: identity was captured at
tick 9000 but timing began at 9011. The [rejected report](integrated-full-drift-summary.json)
is retained. Holding the authority through contact-frame settling and releasing
it when recording starts fixes the boundary; overshot preparation is now rejected.
The [corrected full run](integrated-full-canonical-summary.json) passes the exact
start tick, complete five-minute window, camera phases, new-frame identity and
export checks. [The test ledger](benchmark-start-change-ledger.md) records the
strengthened gates. Neither run is eligible for performance ranking on the busy
host, and neither establishes the required simulation or rendering cadence.
