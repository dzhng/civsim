# Simulation cost and deterministic native execution

Historical run artifacts have been removed. References to experiments below
record past findings; they are not links to retained reports or captures.

This work reduces repeated allocation and redundant geometry work while
preserving the simulation's original state and visible battle timeline.
David accepts a native 30k fighting tick of 35 ms and explicitly limits
further work to simple changes. With retained weapon-repel parallelism, the whole developed tick measures
34.896 ms in its qualified comparison. That acceptance is a stopping point
for optimization, not an invitation to trade more complexity for headroom.

## What must remain true

Scratch capacity may survive between ticks; computed values must be reset
before their next use. Projection can reuse body owners and radii because
those cannot change before deferred casualties apply. Only body positions
need rebuilding between its existing passes. The owners are the existing
`Scratch` types in `combat`, `separation` and `steer`.

A foot soldier contributes one body and each targeting/friend search visits a hash bucket
once. Friend recording can therefore omit duplicate lookup for foot while
retaining the existing mounted-body replacement rules. Changes to body
representation must preserve that distinction.

With native parallelism enabled, weapon-repel searches read fixed geometry and write one result slot
per body. Forces still accumulate in original body order, preserving exact
floating-point operations and traces. Serial and parallel execution call
one search closure in `separation/weapon_repel.rs`. Coarse task sizing avoids
spending more on scheduling than small battles spend on useful work.

The native `parallel` feature is optional. Rayon owns its ordinary reusable
global pool; the performance command explicitly selects eight workers,
matching the accepted comparison. Ordinary and wasm builds remain serial.
This result does not establish a browser simulation speedup.

## Honest measurement

`profile_tick` uses the same expanded deployment for commanders-on and
commanders-off measurements. It prints living fighters because army size
and disabled commanders alone do not establish combat participation.
The standing gate checks both opening contact and developed combat; the developed window also
requires at least 30k living soldiers. Sixty-thousand-soldier results are
telemetry, not another optimization target. Samples require the user's
load-average-under-10 precondition.

The optional `perf_timing` instrumentation attributes nested stage time
without counting it twice. The standing budget uses an uninstrumented
release build; diagnostic timing does not establish acceptance.

## Alternatives deliberately not retained

Shared-neighborhood caches lacked a reliable developed-combat gain.
Whole-unit steering and bounded parallel projection were explored but
closed without integration after the user accepted 35 ms and prioritized
simplicity. Sleeping and changed simulation rates do not ship.

The worker branch stopped at an early feasibility decision. Its empty-page
frame cadence was 16.7 ms against an unchanged final rejection threshold
above 14 ms, so building the production seam could not satisfy that
contract on this harness. Transport measurements also produced invalid
negative snapshot ages, which were never treated as latency evidence.
Only the existing simulation hash was exposed through `Game::state_hash`;
no worker lifecycle, asynchronous command seam or snapshot transport ships.

## Verification and visual provenance

The final integrated workspace suite passes 363 tests with zero failures
and the same 12 ignored tests. The full scaled sweep preserves original
hashes at every size; absolute tick costs fall at all measured sizes.
The strict final gate measured 35.017 ms in developed combat and exited 1:
0.017 ms above its 35 ms threshold. This boundary result is reported alongside
the qualified 34.896 ms result David accepted; it does not justify further
optimization under his explicit simplicity constraint. The actual standing
command subsequently passes at 34.279 ms developed and 20.212 ms opening,
with no code or threshold change between runs; both results are preserved
in the measurement record. Existing serial tests,
1/2/8-thread identity oracles, independent review and the rebuilt-wasm
comparison are recorded in the evidence assets. No simulation assertion,
unit statistic or visual baseline was changed.

The original heavy-infantry timeline,
captured from the production heavy-both fixture on pre-task commit
`2bef8193`, is the visual reference; see provenance
and comparison. The rebuilt
final timeline and saved full-resolution frames match it byte for byte.
The same older reference comparisons fail; those failures were preserved,
not re-blessed. A force-trace smoke fixture also lacks CorridorClamp on the
original pre-task commit; its assertion
remains unchanged.


## Review and evidence

The [final choices ledger](choices.md) records retained decisions in plain
language. Combined checks,
weapon-repel identity,
qualified retained comparison,
worker verdict and
acceptance changes distinguish measured
outcomes from the requirements they establish. Independent whole-feature
code review found no actionable correctness or complexity defects.

Code entry points are [simulation](../../../crates/sim/src/sim.rs),
[weapon repel](../../../crates/sim/src/separation/weapon_repel.rs),
[measurement harness](../../../crates/sim/src/bin/profile_tick.rs),
[standing gate](../../../scripts/test-perf), and
[wasm hash export](../../../crates/game-wasm/src/lib.rs).

## Remaining model-rendering work

The accepted [authored-model rendering follow-up](model-rendering-follow-up.md)
remains separate from the completed simulation work. The model delivery does
not establish that its 30k animation workload meets the existing frame-time gate.
