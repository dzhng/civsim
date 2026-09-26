# 1. Establish whether camera math is worth changing

## Contract and seam

Produce an attributable browser CPU comparison before changing production math.
Use the existing scene harness, with a new individually runnable
`camera-math-performance` probe under `web/scenes/system/`. Its inputs are
captured camera poses and point/ray batches from the real campaign; its output
is a timing, allocation, correctness, and API-compatibility report. Keep fixture
generation and experimental kernels in the probe's test support, never behind
production feature flags. No new app or benchmark framework is needed.

The first useful checkpoint is the baseline report, even if it rejects every
optimization. Count projection/ray calls separately for labels, markers,
anchors, city bounds, and shadow fitting. Distinguish actual per-frame callers
from occasional debug/stat queries before prioritizing them.

## Reproduce the reference

Use the pinned sources in the [research record](../README.md#research).
In an isolated directory under `throwaway/`, inspect the published `math@0.1.0`
artifact, record its integrity/version and exports, and reproduce the upstream
matrix benchmark with consumed outputs. Then run the representative camera
workload in Chrome. Upstream operations/second alone do not justify adoption.

Check multiply, inverse, vector transform, output/input aliasing, singular
inverse behavior, matrix ordering, and import/type/bundle resolution. Compare
the artifact with the pinned source; document any disagreement. `math/three`
is excluded: its examples in the skill are not evidence of a shipped export.
Do not substitute the upstream normal-Z `perspectiveZO` for our reverse-Z
projection. No dependency enters the production manifest in this slice.

Compare three variants on identical inputs:

1. Current production camera functions.
2. Prepared matrices and reusable outputs using the existing math and Float32
   rounding. This isolates avoiding repeated work.
3. The same prepared-state design using only verified `math` primitives,
   including all tuple/buffer conversion and precision-preservation costs.

Use actual observed call counts. Exercise whole-map, regional, and close views,
held and moving cameras, resize, DPR 1 and 2, finite and infinite far planes.
Keep setup time separate from steady query cost; include preparation in total
camera workload cost. Consume results so the engine cannot discard the work.
Record coordinate residuals and discrete visibility/pick mismatches separately.
Do not cast typed arrays to library tuples or hide conversion outside the timer.

## Measurement and verdict

Follow the [shared admission policy](../README.md#performance-admission).
Capture the existing battle CPU profile as a control, and campaign CPU profile
and whole-frame metrics alongside the isolated workload. Sampling must establish
whether the candidate runs often enough to matter; a high synthetic percentage
on negligible work is a rejection.

The report must select one outcome: stop; prepared existing math only; or
prepared math plus a named, provisional library candidate. A library win still
needs the production comparison in slice 3. If inputs, instrumentation, or
hardware are unreliable, record inconclusive rather than claiming success.
After one controlled repeat fails to reduce noise, defer rather than looping.

## Verification and review surface

The human can run `bun run --cwd web scene camera-math-performance` with the
hardware settings specified in the README. Print a concise verdict and write
raw results to `throwaway/math-optimization/`; record durable conclusions here.
The probe must report actual browser/GPU identity and fail or mark inconclusive
when required measurement inputs are absent. Software-GPU runs prove liveness.

Use existing camera geometry tests as correctness oracles, plus explicit
singular, aliasing, zero-w, near-vertical, and infinite-far cases for the
experimental kernels. Preserve all existing tolerances. No production behavior,
package lock, screenshot baseline, or test expectation should change.

This slice does not require a new visual artifact. If it captures a rendered
shot, run `compare-screenshots` against its matched baseline, then run an
unprimed `screenshot-critique` as the last acceptance check. Follow the README's
non-blocking review protocol for any shots shown to the user.

## Decision budget

Delegated: probe internals, fixture serialization, instrumentation placement,
and isolated package-install tooling. Capture fixture counts from production;
do not invent larger workloads or tune thresholds after observing candidates.
Changing precision, rendering policy, projection ownership, or the workload
scope requires reslicing. Human feedback about which campaign view matters most
can change the fixture mix before the comparison is frozen.

## Result

Package compatibility verified against the published 0.1.0 artifact. Root
matrix/vector imports and TypeScript/Vite resolution pass; `math/three` is
absent. Published runtime algorithms match the pinned source (type annotations
differ). Seeded upstream batches reproduce consumed outputs. Matrix aliasing,
singular handling, and 1,000 dense matrix comparisons pass with explicit
Float32 rounding at each matrix result; unrounded library results differ.
Keep the local projection and vertical-camera fallback. A selective minified
multiply/inverse/vector bundle measured 2,697 bytes in the isolated build.

Evidence: `throwaway/math-optimization/package-spike/` contains artifact
integrity, reproduction, precision, typing, bundle, and browser import results.
This is compatibility evidence, not a performance verdict. The real campaign
probe and three-way timing comparison are still in progress.

The initial unchanged `battle-cpu-profile` control timed out at its readiness
predicate after 90 seconds without page errors. Generated bindings lack
`generated_vista_band_shore_distance_ptr`, which current battle startup calls.
Rebuilt WASM from current source; the unchanged control then passed live and
paused with no page errors. No gate was weakened.
Campaign captures and exploratory timings from that artifact are preliminary,
not admission evidence. Six focused test files (34 tests) pass on current source.

The experimental library comparison also exposed a fairness issue: the
prepared control still allocated two matrix outputs while the library reused
outputs. The definitive comparison includes a matched reusable-output control;
allocation reduction must not be misattributed to faster arithmetic.


Independent Codex review found unbounded frame waits and a cold moving path
mislabeled warmed. The probe now rejects non-finite durations, closes its owned
page on measurement timeout, traverses the same bounded keyboard path before
warm timing, and settles after resetting the camera. JSON-string fixture
transport avoids expensive nested Playwright serialization. The corrected
moving-DPR2 smoke and the full 14-case capture pass with no page errors on
HeadlessChrome 153 / Apple M5 Pro / Metal. The report records source commit
`8abd2153` and WASM SHA256
`19e2cf0786cd764ef82d8c45d86c37506c65ce694c433c9a76f7b6e40c63c53e`.
The 84 observed frames have 6,580 whole-map or 10,020 regional/close projections;
6,416 come from the two per-frame stats calls. Each frame has two camera
preparations and no anchors calls. Separate clamp/shadow rays are not folded
into the projection timing workload. Final kernel and full-frame comparisons
are next; captured workload counts alone do not authorize the cutover.


### Admission verdict

Accepted prepared existing math; rejected library adoption. On the fresh-WASM
84-frame workload, five interleaved pairs per variant ran for at least five
seconds each. All 14 cases clear 0.25 ms, 10%, and baseline-range noise gates,
winning all five pairs. Paired median savings are 1.98–3.11 ms per observed
projection workload. Library kernels are typically 0.005–0.015 ms slower than
the matched reusable-output control and fail the absolute gate. The allocating
prepared implementation is the intended slice-2 control; `prepared-reuse` is
an extra fairness control for library attribution, not a production requirement.
The numerical oracle reports 1,569,748 points and zero point, visibility, or ray
residuals, including finite/infinite far, degenerate, and near-vertical cases.

The temporary campaign-world substitution was also compared over five paired
five-second windows at whole/regional/close views and DPR 1/2. All six pass the
fixed p95 regression rule. One regional-DPR2 candidate window reached 50 ms
against 33.335 ms baseline, but the increase did not recur in a second pair.
No physical presentation, input latency, or release-FPS claim is made.

Authoritative raw evidence: `kernel-results.json`, `kernel-verdict.json`,
`frame-comparison.json`, and `frame-verdict.json` under ignored
`throwaway/math-optimization/`. Independent package/kernel audit confirms the
CPU-stage conclusion; final production-code gates still belong to slice 2.
