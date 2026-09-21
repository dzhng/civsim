# Defer friendly-body bearings until consumed

The targeting scan retains each body's original relative vector while selection
can still discard it. After the no-target early return, retained friends resolve
the same atan2 expression on the same bits. Consumer records carry only bearing,
distance and fighting state; selection identity and priority stay in the scan.
There is no cross-search cache or change to visit order, ties, cap, mounted-body
replacement, mutable-state reads, mechanics or timesteps.

Four fresh Node processes ran serially after all browser controls ended. No GPU,
builds or tests overlapped. Both candidate runs beat both controls in each window:

| Run | Initial contact ms/tick | Later combat ms/tick |
| --- | ---: | ---: |
| Control0 |24.022|47.469|
| Candidate1 |23.368|45.785|
| Candidate2 |23.326|45.928|
| Control3 |23.932|47.172|

All five independent checkpoint hashes match in every arm. The control build
matches production e9f4f080… byte-for-byte. Candidate is fd2fef9d…. This modest,
repeatable reduction supports adoption, not a stable percentage or browser-FPS
claim. Later combat still exceeds33.3ms. Prior counters describe source-level
bearing call opportunities; they are not a count of optimized machine atan2
instructions, so predicted saved calls must not substitute for these timings.

Claude's focused and broader mechanics tests pass, including the unmoved golden
hash. Independent source review found no actionable defect. Root integration is
33eb9205; root17 library tests and targeting/golden tests pass. The integrated worker/direct
comparison passes all309 ticks, including observation/render-facing records. Its
rebuilt WASM matches the measured candidate byte-for-byte. Logs are retained here.

## Test behavior ledger

The three existing friend-selection tests retain their selection assertions but
now compare scan records containing raw offsets instead of resolved bearings;
the consumed angle is separately checked bit-for-bit against eager evaluation.
No gameplay expectation, unit stat, golden hash or threshold was repinned. New
coverage includes all quadrants, crowded caps, mounted duplicates, tied priorities
and targetless formation behavior. These are added proofs of existing semantics,
not altered outcomes. The agent record lists its mutation and mechanics checks.
