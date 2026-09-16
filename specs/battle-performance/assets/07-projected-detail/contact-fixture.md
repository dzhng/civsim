# Reusing the canonical contact state for renderer diagnostics

Use an ordinary generated battle rather than canceling the Menu benchmark:
benchmark cancellation intentionally stops its rendering loop. The ordinary
`/?map=gen&seed=7&ai=on` route already uses the same simulation seed, default armies
and enemy AI; it only lacks the benchmark's player opening orders.

Reuse the early `__game` installation interception in the existing arrow or camera
reprojection scene. Pause through the installed `p` key handler **before** calling
`freeze(true)`, so unfreezing later restores paused rendering. Require tick zero.
Read every unit-info row before issuing any order; use the exported
`benchmarkOpeningOrders` helper on the concatenated rows and their actual stride.
Issue its returned orders through `attackOrder`, then await `advance` with the
scenario owner's `startTick`. The client flushes queued orders before advancing.

Require tick 9000 and state hash **9928381812590497427**. Call `freeze(false)` and
confirm paused=true, frozen=false, advancing actual submission IDs and no skipped
frozen frames. A hash mismatch invalidates this fixture; do not work around it by
comparing a different battle. Scripted advance is preparation, not live throughput.

For a dev-page probe, import the already-loaded benchmark scenario module URL,
including its query. For a fixed production build, evaluate that same helper in
the runner's source environment and pass its resulting order list into the page;
do not assume development module URLs are served by a production build and do not
reimplement the nearest-enemy algorithm. Replay the existing camera path separately.

This recipe is grounded in the current boot, control and authority code but has
not yet been executed as a new contact-state feature control. Its assertions must
pass before it can replace the tick-30 grass fixture for attribution.
