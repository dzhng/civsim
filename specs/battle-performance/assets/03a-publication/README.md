# CPU publication feasibility

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

Byte parity is not consumer parity, so three checks in
`apps/battle-perf-lab/simulation/publicationConsumer.test.ts` run the existing
`BattleActionAdapter` over published buffers, with the same adapter reading the live
`Game` as the oracle. A lab-only `snapshotReader.ts` presents one held snapshot in the
adapter's current `Game`/`Memory` pointer shape; every `*_ptr` resolves through the
published layout, and it is deleted with these runners when the real observation seam
lands. The immutable metadata the adapter needs at construction (class specs, loosing
duration) now comes from one owner, `presentationMetadata`, which the direct and worker
identities already reported.

The canonical battle prepares 88 ticks with the unchanged 30-tick calls, then publishes
ticks 88–95 one tick at a time. At every tick the adapter over the published buffer
returned observations and facings identical to the adapter over the live `Game`, with
matching tick, state hash, soldier count, `unit_info` and projectile records; real
`guardedFacing` transitions occur inside that window. Two small spawned fixture battles
cover what an approach window cannot reach: real archer releases drive the real
`ActionTimeline` to its `bow_release` clip through published observations, and a pike
soldier's hedge→sidearm weapon switch, posture change, fighting flag and release TTL
decode identically through the publication, including the `sidearm` appearance switch.
Repeated reads and a republished identical tick return the same observations instance;
a rewound tick re-derives. Returning the credit leaves the reader holding nothing, its
next read fails explicitly, the returned buffer transfers and detaches, and the
consumer's last presentation survives it — today's adapter already copies out and
retains no view into the publication buffer. The producer then reuses the credited
buffer and the consumer recovers. Flipping one posture bit in a published buffer fails
all three checks.

Run from the repository root with the lab config:

```sh
web/node_modules/.bin/vitest run --config apps/battle-perf-lab/vitest.config.mts simulation/
```

The full lab suite is 116 tests in about 1.5 s. (Sparse worktrees need the placeholder
soldier fixtures and the soldier card manifest checked out; the adapter imports both.)

These are still lab checks of the publication layout. They deliberately avoid the
9000-tick preparation, so contact-only branches are pinned here by fixture battles and
controlled WASM boundary samples, the idiom the existing adapter tests already use; the
canonical window and the real transport belong to the heavy run below. No worker,
browser, renderer, HUD widget, camera, timing or throughput claim is made here, and
`BattleCrowd`, its interpolation endpoints and the HUD bridge remain unverified.
The reader is not the production seam: integration still has to separate raw observation
reading from WASM pointer ownership inside the adapter itself.

## Canonical window through the worker

`publicationConsumer.canonical.ts` carries that same existing `BattleActionAdapter`
across the canonical contact window, ticks 9000–9308, through the unchanged
single-credit worker protocol in `worker.mjs`. Two arms run serially, one authoritative
`Game` each. The worker arm owns its `Game` in the worker thread; the consumer thread
owns no `Game` at all and builds its adapter from the worker's own identity metadata,
reading every completed tick only through the disposable reader. The direct arm then
owns one `Game` here, replays the same seed, map, initialization, generated orders and
the same tick-stamped command through the same `CommandGate`, and its adapter reads that
live `Game` as the oracle.

Each completed tick is compared as one record: state hash, soldier/unit/projectile
counts, victor, acknowledgement, the raw published bytes, the `unit_info` digest, the
projectile record digest, and the adapter's own observations and render facings. The
direct arm digests `unit_info` and the projectile records from the live `Game` rather
than from its own copy, so equality states something about the publication instead of
comparing a copy with itself. Every tick also records how many soldiers are alive,
fighting, guarding, pike-ready, incapacitated, routing, at ease, releasing and moving,
and the report summarises how often each count moved: parity over a frozen window would
prove nothing.

The run asserts the pinned hashes at 9000 and 9300, the 9308 endstate hash recorded in
[the comparison](parity.json), exactly one acknowledgement (seq 1 at tick 9301) in each
arm, and identical worker/direct identity metadata — wasm digest, generated orders,
class specs and loosing duration. Resource and cleanup evidence is machine-readable in
the same report: at most one snapshot outstanding, nothing queued while the consumer
withholds its credit for 200 ms, the held buffer unchanged during that hold, every
credit detached on transfer, the reader holding nothing after the final release with the
adapter then failing explicitly, and the worker reporting zero live Games and zero
retained buffers before exiting 0.

Run from the repository root with an absolute report path:

```sh
PUBLICATION_CANONICAL_REPORT=/absolute/scratch/canonical-consumer.json \
  web/node_modules/.bin/vitest run --config apps/battle-perf-lab/vitest.canonical.config.mts
```

It prepares 9000 ticks twice and runs for minutes, so it stays out of the fast suite:
the default lab config includes `simulation/**/*.test.ts` only, and this dedicated entry
is the only thing that runs `*.canonical.ts`. The report is written even when a check
fails, with `complete: false` and the first mismatching ticks retained. It carries no
timing field, and host elapsed time for this run is not performance evidence.

The limitations do not move. The ordered command still repeats unit 0's existing attack
order, so it stays an idempotent delivery and acknowledgement check rather than a changed
gameplay outcome. Nothing browser-side is touched: no renderer, HUD widget, camera, input
path, `BattleCrowd` or interpolation endpoint, and no `ActionTimeline` playback over this
window — the short checks remain the only timeline evidence. Bounds are on
application-held buffers and messages, not WASM allocator reservation or process RSS, and
single-credit backpressure still stops the producer under a slow consumer, so no 30 Hz or
60 fps conclusion follows.

One full run of this command passed end to end while the entry was being written, but a
concurrent lab process overwrote its report, so no artifact from it is retained; the
recorded evidence has to come from a clean rerun.

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
