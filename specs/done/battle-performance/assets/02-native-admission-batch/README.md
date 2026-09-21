# Overlap native preparation validation

Routine uploads and preparation close their own error scopes immediately, then
allow those validations to overlap later work. Every presentation waits for the
complete batch before submitting. Submission retains its own validation; actual
terrain and resize mutations retain immediate admission. CPU-only reconciliation
creates no empty GPU check. Failures drain all checks before lifecycle cleanup and
preserve the original operation/cancellation error. No GPU drawing, pose policy,
quality setting or simulation behavior changed.

## Paired diagnostic

The raw game entry ran baseline → candidate → candidate → baseline. Each run
prepared generated seed 7 at paused tick 30, warmed 30 presentations and measured
120 camera-sweep presentations at 1440×900 CSS and DPR 2. The probe supplied
`timeSeconds = frameIndex / 60` while retaining ordinary non-frozen presentation.
All four runs have identical captured camera packets and the same crowd count,
observation tick and position/facing/alive byte fingerprint. Every run completed
its rendering and browser checks. The baseline is runtime commit 54161817; the
compressed patch pins the candidate runtime changes against it.

| Run | Median renderer wall ms | p95 renderer wall ms |
| --- | ---: | ---: |
| Baseline 0 | 14.64 | 21.99 |
| Candidate 1 | 10.39 | 14.11 |
| Candidate 2 | 11.16 | 15.20 |
| Baseline 3 | 15.76 | 20.54 |

These are short instrumented renderer wall-time controls, not live FPS, CPU time,
GPU execution time, a backend ranking or final shadow-cost acceptance. Per-run
host observations are retained; the shared host was not certified quiet. The
observer records overlapping steps without introducing renderer awaits. Nested
submission durations must not be summed with parent work.

The first batching-only candidate left an empty reconciliation admission and
showed mixed tails. Moving validation to actual resource mutations removes that
remaining wait. An intermediate comparison with inconsistent initial ticks is
excluded; only the pinned runs above support the comparison.

## Correctness

The scheduling regression fails on the old implementation because preparation
stalls on validation. It passes after batching. A strengthened version defers all
ordinary scopes and exposes the empty reconciliation wait, then passes after its
removal. All 21 live-renderer tests and both live TypeScript configurations pass.
Existing assertions and thresholds were not relaxed. Added failure coverage pins
startup submission, final GPU validation, cancellation, original-error preservation,
failed resize dimensions and resource lifetime while other checks remain pending.
Independent code review found no actionable regressions.

Later CPU preparation and pose commands may occur before an earlier validation
failure is known; successful presentation cannot. This change does not promise
rollback. Full production comparison builds must be refreshed before ranking.


TypeGPU and vgpu also complete all 120 paused camera presentations and browser
checks with the candidate. Their recordings are functional controls only. An
initial TypeGPU run completed rendering checks but its Node runner remained in
browser-close after the browser child exited; the remaining owned runner was
interrupted. The subsequent pinned TypeGPU run exited successfully. The initial
attempt supplies no completion or performance claim.


The unchanged production `battle-perf-30k` hardware gate also passes all 18 checks,
including the 33 ms threshold, content floors, actual pan and complete zoom sweep.
Its report and log are retained. This is a paused-renderer floor, not live combat
acceptance. No default threshold or screenshot baseline was changed.
