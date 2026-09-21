# Animation publication and pose blending

The actual Menu TypeGPU battle was CPU-profiled from 230–280 seconds of its
five-minute contact window at 1440×900, DPR2, default single shadows. The build
was ad8c218a. All completion/state/error checks passed. The profiler changes
cadence; this is attribution evidence, never an FPS acceptance sample.

Of 50.25 seconds sampled, publication consumption through the action timeline
accounts for 33.61 seconds inclusive (67%). Frozen-pose capture accounts for
22.41 seconds inclusive; garbage collection has 5.72 seconds self time (11%).
Inclusive values overlap and must not be added. Function-entry source maps do
not identify the precise expensive expression. These callbacks run between
awaited presentation continuations and were missing from render-only CPU timers.
The long render await therefore cannot be interpreted entirely as GPU waiting.

The first optimization writes blended translations, rotations and scales into
the final Float64 pose. Each joint previously allocated six typed-array views
and three ordinary arrays. Quaternion interpolation retains one arithmetic owner
shared with channel sampling. Published frozen poses retain their existing
immutable ownership; no cache, pooling, sampling or phase policy changes.

Independent former-arithmetic tests cover all pairs of five quaternion cases,
eight blend weights, scalar extremes, result mutation and 512 interruption
steps. The existing timeline/mounted/playback suites remain unchanged: 81 tests
pass together, and web TypeScript passes. Independent review identified a missing
distinct near-parallel pair; coverage was expanded before acceptance. A separate
Codex diff review found no correctness issues.

The isolated Node24/V8 primitive probe runs 100,000 blends of 64 joints per arm,
after warming both implementations. Before/after/after/before times were
1301/230/227/1283ms. This is about 5.6× primitive throughput, **not live battle
speedup**. The old CPU profile and full diagnostic report are retained losslessly
here; fixed builds and runners remain in the main worktree's ignored scratch.
Actual contact-window comparison and animation motion acceptance remain open.

No existing test expectation, threshold, simulation statistic or gameplay value
changed. Two independent pose-value/ownership regression tests were added.

## Actual late-window follow-up

A fixed ad8c218a build with only this blend patch completed the same Menu route,
full 300-second window, initial tick/hash, framebuffer and default shadows with
no page errors. Sampling covered 50.12seconds at the same 230–280second camera
phase. All owned builds/tests/reviews were stopped during the run. Both raw
profiles, mapped analysis and full diagnostic reports are retained losslessly.

| Sampled cost | Before | After |
| --- | ---: | ---: |
| Publication receive inclusive | 33.61s | 30.31s |
| Timeline update inclusive | 31.74s | 28.44s |
| Frozen capture inclusive | 22.41s | 19.01s |
| Blend primitive inclusive | 7.35s | 2.60s |
| Garbage collection self | 5.72s | 5.91s |

These overlapping rows must not be added. The runs advanced13785→15091 and
13964→15422ticks respectively, so they are not a matched-state speedup estimate.
The changed primitive is a substantially smaller observed hotspot, consistent
with the controlled primitive probe. GC has **not** demonstrated an improvement.
The remaining publication cost is still dominant. Preserve the live60FPS gate;
next examine direct channel sampling and frozen capture against a retained
identical observation trace before considering broader timeline/storage changes.
