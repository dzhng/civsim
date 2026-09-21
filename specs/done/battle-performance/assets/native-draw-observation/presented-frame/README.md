# Count the frame that actually presented

Worker7f721d7c is integratedb31b730b. The observation is retained beside the
presented frame's camera and seating identity after its existing validation
barrier. Readiness renders, later frames and failed/cancelled presentations cannot
relabel that count. Unknown or unsubmitted work leaves a null count and reason.
After disposal it describes the last presented frame, like its retained camera;
it is never evidence that a disposed world remains ready.

Root61 facade tests and the web TypeScript check pass. Independent review found no
actionable regressions. The compiled worker source and integrated main source
match across apps/packages/web source; intervening root changes are evidence only.

An independent pre-construction GPU wrapper counts actual render-pass commands,
command-buffer batches and bundle executions. It adds no timing queries and is
scratch-only. At three zooms each operation advances exactly one rendered frame;
all batches between those frames are counted, including zero-draw compute/copy
batches. This tests the frame total rather than the last queue batch alone.
The unchanged baseline reports null where the probe measures56/59/51 commands,
so the new gate is red before this wiring. The updated fixed TypeGPU game matches
all18 command tallies across single/High/off and timing-enabled/disabled builds:

| Shadow mode | Three tested zooms, both timing modes |
| --- | --- |
| Single |56,59,51|
| High |76,75,69|
| Off |40,43,37|

Both builds have no page errors and dispose all tracked resources. Disabled mode
reports disabled-by-lab-control and allocates zero query slots; enabled uses two.
These are command-observation correctness checks, not FPS or GPU execution-cost
measurements. Startup readiness and failed validation are additionally covered by
CPU tests, not separate injected hardware faults in this pass.

Changed-test ledger: the empty-scene fixture now reports measured zero draw calls
instead of unavailable; installed-content obligations drop drawCalls only when
that frame owns a count. Existing disposal assertions now also reject the pending
frame's count. New tests cover replacement by a later frame, readiness isolation,
validation failure, dropped buffers and unknown command buffers. No existing
visual, performance or population threshold was changed.

Full per-frame observations are retained losslessly as compressed JSON beside the
compact checks and mode comparison. Reproduction scripts remain in
`throwaway/presented-draw-hardware/` with the fixed-build identities.
