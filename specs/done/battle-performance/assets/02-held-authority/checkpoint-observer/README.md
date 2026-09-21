# Coherent checkpoint observer — implementation control

The lab observer reads a completed frame at the first animation-frame registration
that sees its new ID. The production frame pump registers its successor after the
presentation promise settles and before the next preparation starts. Nested
callbacks during preparation see the already-observed prior ID and cannot sample.
Snapshots copy nested stats immediately. The actual pump drives the CPU tests.

This closes the observer implementation, not the common-checkpoint browser gate.
The independent review found no actionable regression. Root then reproduced and
fixed a missing-Menu-frame false pass: camera verification now fails when its
matching recorded frame is absent. All68 trial tests and the scoped TypeScript
check pass. Runtime controls against all eight immutable held builds remain next.

[Actual frozen terminal shapes](frozen-stat-shapes.json) confirm15,560 instances
and five tier keys on all four backends at both held ticks. This is field-shape
evidence only, not coherent interior counts. Historical three-tier records do not
describe these8643cf05 builds. The comparator reads available keys and the shared
planner's counts; renderer-wide draw totals and crowd-only totals stay distinct.

Six checkpoints use a predeclared50ms matching window. Achieved camera/elapsed
values and count differences remain explicit; approximate poses do not prove
identical geometry or GPU work. Observed runs are correctness-only and cannot be
used for frame-time ranking. The lab trials README owns the runnable commands.
