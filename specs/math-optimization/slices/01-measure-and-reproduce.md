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

Not run. Update this section with evidence paths, candidate ranking, and the
next-slice verdict; do not convert source inspection into a measured speedup.
