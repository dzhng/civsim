# Same-lane packing diagnostic

**Not integrated.** Copying an already resolved clip sample's four control words
when the destination is the identical sample object reduced Node median packing
time, but does not directly remove work from transitioning lanes. Tail timing is
mixed and machine contention was uncontrolled. This is a possible settled-frame
optimization, not an interruption-tail fix or accepted performance envelope.

The bounded probe starts at `bc5486cf` and changes only an in-memory copy of
`PlaybackPacker.prepare`. No cache, LOD, asset, clock or GPU changes were made.
Source/candidate hashes and all samples are in the [raw results](same-lane-packing.jsonl).
It uses the real action controller and existing synchronized/staggered budget
observations with the mounted synthetic fixture. Node is v24.14.0. Concurrent
SwiftShader captures and default-thread Blender builds were active; none were
stopped to manufacture a quiet machine.

Exactness checks compare every control word, upload slot/payload, resident count,
required slot and submitted count: 122 small-controller frames, 152 lifecycle
comparisons and 320 paired 30k frames. Discard/retry, pending supersession, stale
commit rejection and committed repeats are covered. Staggered histories retain
18 distinct frozen identities for nine bodies.

Zero of 408 transitioning lanes have duplicate sample identity; 951 of 960
settled lanes do. A settled lane resolves the same sample at both blend endpoints;
upper lanes targeting the base pose still follow the original composition path.
Other settled lanes may benefit during an interruption frame, but this does not
establish lower interruption latency.

Four alternating-order pairs used 20 warmup and 60 measured frames each. Timing
includes packing and commit only, not controller, projection, GPU or frame cadence.

| Pair/order | Original median/p95 (ms) | Candidate median/p95 (ms) |
| --- | --- | --- |
| 0 AB | 2.336 / 7.382 | 2.017 / 5.783 |
| 1 BA | 2.195 / 4.439 | 1.403 / 4.966 |
| 2 AB | 2.268 / 7.720 | 1.553 / 4.465 |
| 3 BA | 2.231 / 6.211 | 1.545 / 5.548 |

No repeat was discarded. The source review found resolution/error checks remain
on the shared source, with weight, mask and frozen-source lifecycle validation
unchanged. Differential correctness is not a red/green bug regression: both
implementations are expected to produce the same result. Keep this below the
unresolved interruption contract until representative browser evidence supports
promotion; do not credit these Node medians toward the 33ms gate.
