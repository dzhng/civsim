# Measurement and acceptance protocol

## Workload identity before timing

Acquire actual Mac model, GPU/adapter label and features, OS, browser/version, refresh cadence, power mode, CSS viewport, DPR and physical drawing-buffer dimensions. Use a production build with no hot reload. Record commit, dependencies, graphics settings, seed/map, full army setup, environment, asset hashes, camera snapshot/path, live/paused mode and all exclusions. The supplied image is 1440×900 image pixels; it does **not** establish CSS size or DPR. Use a 1440×900 CSS reference fixture with explicit recorded DPR as a reproducible companion, plus David's normal window at its actual backing resolution for acceptance. No claim that either reconstructs an unknown original framebuffer.

Use current generated seed 7/default armies as the reproducible normal workload; capture a second fixture matching the supplied formation composition and projected soldier size. Persist both teams and actual total/visible counts. Add the existing >=30k-soldier/>=500-scenery stress workload unchanged. Record starting counts and live casualties; never compare live runs with different trajectories as matched samples. Use recorded observations for exact render-only comparisons and deterministic seeded live runs with matching state checkpoints for product comparisons.

The canonical user-facing run is the 300-second live contact-window benchmark specified by 01a–01c, launched from the actual menu. Run it end to end in every paired round and report its FPS lows/highs and spike chart. The following shorter traces are additional attribution cases, not a replacement.

For each normal fixture: 10-second static tactical hold; 60-second sustained pan across focus boundaries with reversals; 60-second near↔tactical↔overview wheel sweep; 60-second horizon-facing yaw/pitch sweep; 60-second combined pan+zoom; five-minute travel/return soak. Pose replays derive from production camera inputs/matrices, not duplicate orbit math. Real keyboard/pointer/wheel events must exercise input at least once per motion type. Verify achieved physical poses and displacement, because prior authored zoom requests have clamped to the same settled zoom.

Run paused-sim but animated rendering to isolate rendering; separately run live simulation, HUD/minimap/audio enabled, including engaged combat. Freeze is a separate correctness tool: identical-frame caching can skip rendering and must never masquerade as a performance result. Record first entry, first full traversal, and warm repeat separately. Do not settle grass or discard boundary crossings during a motion sample. Only loading before control becomes available is outside interactive timing.

## Telemetry

A single frame id/camera revision accompanies CPU measurements and, where supported, GPU queries. Fields: input receipt, camera applied, observation build, crowd planning/packing, palette upload/compute, grass sample/copy/hash/upload/route, shadow draw, world draw, post, submit, rAF intervals, resource creation/disposal, upload bytes, allocated/retained memory, source/view/shadow-only population, per-LOD draws/triangles, grass starts/cancels/completions and pending age. Preserve raw samples, not only averages.

Current `PhotorealWorld.gpuTimeMs` is **render-pass time only**. Do not relabel it total: add separately named render/compute metrics and a correlated total only if measurement really covers the same frame. CPU and GPU overlap; never sum their medians into frame time. Async readbacks use a bounded ring, never await `onSubmittedWorkDone` or mapped results in the frame hot path. Mark missing/late/dropped timing samples explicitly; zero or reused stale values cannot pass a gate. Validate instrumentation overhead against a control run. A missing GPU timer permits CPU/cadence evidence but leaves GPU attribution unavailable.

Input-to-next-camera-submit is a useful proxy, not physical input-to-display latency. Use browser trace/presentation data when available, report proxy status otherwise. Check that every normal gesture updates the next eligible rendered camera; coalescing may keep the newest input but cannot defer motion behind grass completion.

## Repetitions and limits

Perform three paired rounds in balanced baseline/candidate order on the same quiet hardware, with no other benchmark or build running. Keep first-traversal samples rather than warming away resource churn. Repeat only when a declared contamination signal invalidates a run; retain invalid samples and reasons. Report per-phase/per-run p50, p95, p99, max, >25 ms, >33.33 ms and >50 ms frame gaps, and sample counts. Avoid averaging percentiles across different workloads.

Proposed normal-workload 60 fps gate (freeze in 01 after checking any user reply): CPU render critical-path p95 and correlated GPU frame p95 each <=16.67 ms, assessed separately; average delivered cadence >=59 fps; gaps >25 ms <=1% and no unexplained interactive gap >50 ms in each 60-second warm trace. Report first-traversal hitches under the same limits; pipeline work must be prepared before interaction or bounded. At higher display refresh, judge delivery against the 60 fps target rather than requiring 120 fps. rAF is a scheduling proxy, so retain browser presentation evidence where available. A strict rAF p95 <=16.67 assertion is inappropriate because refresh quantization/jitter can exceed that by fractions of a millisecond.

The five-minute soak must return to a stable retained-resource plateau after travel and battle re-entry, with no growing stale-job queue or memory trend unexplained by new content. Per-frame grass/crowd work budgets and memory ceilings are fixed from measured baseline/device limits in 01–03 before implementation, then carried as test inputs. Apply the same cadence and work thresholds to the complete 300-second menu benchmark AND each labeled phase, including 30-second phases: >=59 fps average, >25ms gaps <=1%, no unexplained >50ms gap, and CPU/correlated-GPU p95 <=16.67ms independently. This prevents quiet sections from hiding combat hitches. First-traversal behavior is included. The stress workload must keep the existing authored 33 ms gates and improve or stay within measurement noise; it is not silently assigned the normal-load 60 fps promise.

## Prove shadows paid for themselves

Keep three comparable builds/configurations:

- A: original renderer with original default shadows.
- B: optimized renderer with equivalent original shadow quality/coverage.
- C: optimized renderer with the required new default shadows.

For each matched workload and metric, savings S = A − B; incremental shadow cost H = C − B; net gain N = A − C = S − H. Require N > measured run-to-run variability and S > H for GPU work and CPU work where shadows add cost. If a stage already lies at noise floor, demand no regression there and positive net gain in the limiting stage. For frame cadence, which may be capped by vsync, require non-regression and the absolute cadence gate. Report p95 and p99 deltas as distribution comparisons, not per-frame causal subtraction. Final C must also meet the absolute normal-load target above. Do not use CPU+GPU sums or compare unmatched feature sets to manufacture a win.

Diagnostic feature ablations (grass off, shadows off, frozen animation, lower diagnostic resolution) can identify a cost, but cannot pass final acceptance. If simulation alone breaks live cadence, preserve and report that failure; renderer-only improvement is still useful evidence, not completion.

## In-game reporting

The exact FPS formulas and spike-preserving chart contract live in [01c](slices/01c-benchmark-results.md). Use those same formulas in exported reports and backend comparisons. Freeze scenario/tour version, start tick, seed, rosters and orders before timing candidates. Menu preparation pre-roll stays outside the timed window; the actual five minutes execute live simulation at normal speed. Compare both overall and labeled per-phase results.

Native comparison instrumentation observes standard WebGPU encoding and submission
without replacing each library's drawing. A presentation's identity is its final
actual scene submission; the later timestamp resolve/copy submission is counted as
measurement overhead and excluded from measured pass time. Complete timing requires
both readable queries and successful validation of the originating commands. Work
encoded outside the measurement, unavailable queries, and ring saturation make the
sample incomplete. Query storage referenced by unsubmitted commands is quarantined
until disposal. The implementation lives in
[the native observer](../../apps/battle-perf-lab/src/nativeGpuTelemetry.ts); hardware
correlation and instrumentation-overhead controls remain required before ranking.
