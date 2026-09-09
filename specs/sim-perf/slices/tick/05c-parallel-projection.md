# tick/05c — Exact parallel projection trial

**Closed without integration, 2026-09-09:** David accepts 35 ms and limits
further work to simple changes. This experiment is outside the retained
scope. The design below is historical, not queued implementation.


## Contract and status

Reduce the wall solver's measured cost without changing a single pair's
geometry, correction or accumulation order. Weapon-repel's qualified
developed comparison saves roughly 3–4 ms but still exceeds the 25 ms
budget. Its idle/small controls and steering's comparison are still running.
This is an isolated experiment, not a retained production change.

## One owner and exact ordering

The wall solver owns the projection pass and its scratch storage. Extract
one pair-search kernel that both serial and parallel execution use; do not
copy the physics into a second implementation. Within a pass, body geometry,
effective masses and grid traversal are immutable. Keep all three existing
pass/rebuild boundaries and the existing early exit when no pair overlaps.

Calculate individual corrections concurrently in fixed contiguous ranges
of body indices. Store both owners and the four already-rounded operands;
replay the original `+=` and `-=` operations in the original
`bi → bucket → bj` order. Do not sum per-thread soldier totals, sort pairs,
deduplicate differently, consume RNG or publish partial position changes.

Bound scratch storage independently of dense pair count. A full range
buffer must fall back to the same serial kernel for that range, discarding
its partial buffered prefix before replay, so every correction is applied
exactly once. Never truncate pairs or allocate an unbounded per-pair list.
Reuse storage across ticks. No unsafe code, atomics feeding physics or new
simulation state. Keep the default and wasm paths serial during the trial.

## Evidence and acceptance

Use the existing three identity oracles at native 1/2/8 threads, including
both developed-fight repeats. Exercise a deliberately tiny buffer to prove
overflow produces the same state and trace as serial execution. Compare
full trace order/values on a bounded multi-unit fixture; no large trace
artifact needs to ship. The integration owner runs the final workspace and
rebuilt-wasm visual checks, preserving all existing expectations.

Record pair volume and peak buffer use on developed 30k and 60k before
selecting the retained capacity. A provisional bounded capacity may be used
to build the experiment; keep sizing evidence and distinguish it from a
behavior constant. Reject the trial if serial replay, repeated work or
storage overhead erases its benefit.

Build and run only in an assigned CPU lane. Compare the same prebuilt
serial and candidate code with original controls on both sides, under
David's load-under-10 precondition. Report developed, idle and small-battle
cost; the unchanged full scaled sweep and standing budget gate belong to
the combined integration. Commit only a reviewed, measured gain.

Internal kernel naming and the bounded batching layout are delegated to
the implementer. Report their production-line cost and capacity rationale.
Changing the exact-order contract, physics, target budget or browser thread
toolchain is outside this experiment.
