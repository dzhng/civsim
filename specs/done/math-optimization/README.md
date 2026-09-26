# Measured camera CPU reuse

Campaign camera queries reuse accepted camera state instead of rebuilding
matrices for each label, marker, city bound, or pick. The upstream
[math skill](../../../.agents/skills/math/SKILL.md) is installed with its
[license and pinned provenance](../../../.agents/skills/math/SOURCE.md).
There is no npm `math` runtime dependency.

## Why reuse existing math

The measured opportunity was repeated work. Real campaign frames issued
6,580–16,436 projections, usually 6,580 or 10,020. The existing statistics
publication path contributed 6,416–12,832 of these calls. Avoiding a matrix rebuild for every query matters more than
replacing multiplication with a library call. These are observed development
workloads, not a promise about every release workload or frame rate.

The published `math@0.1.0` artifact was tested against upstream commit
`983a607676026c5f1b950f876bc688988de824e5`. Its verified kernels did not clear the
incremental CPU gate against equally reusable existing outputs. Adopting them
would also require preserving Float32 rounding explicitly. Its normal-Z
projection is not the engine's reverse-Z projection, its vertical look-at
behavior differs, and `math/three` is absent from the published export map
despite appearing in the skill. The skill is useful guidance; examples are
not proof of compatible exports or faster game code.

## Ownership and invariants

[Camera geometry](../../../packages/renderer-core/src/camera3d.ts) remains the
owner of projection and rays; [matrix primitives](../../../packages/renderer-core/src/mat4.ts)
own homogeneous transforms. Cold and prepared queries share the arithmetic.
The required output-first transform accepts aliased input/output, so prepared
queries need no per-point vector allocation.

Each [campaign world](../../../packages/photoreal-renderer/src/campaign/campaignWorld.ts)
owns its prepared state and scratch. `setFrameCamera` accepts each update before
pre-draw queries; it never waits for drawing or infers changes from object
identity. This matters when the same target tuple is mutated and when cards or
picking ask about a resized camera before the next render. Public returned
results retain independent lifetimes.

Preserve Float32 matrix boundaries, XY ground/+Z up, reverse-Z, finite/infinite
far handling, the vertical-view fallback, singular-inverse identity fallback,
zero clip-w handling and behind-camera rejection. CSS/device-pixel conversion
stays with existing callers. Terrain intersection, label arbitration, quality,
GPU layouts, simulation determinism and save data are unchanged contracts.
Preparing a camera may allocate matrices once per accepted update; eliminating
those few setup allocations was not necessary for admission.

Battle uniforms, shadow fitting, crowd visibility and terrain traversal remain
separate possible optimizations. They need their own workload evidence; this
result does not authorize a broader math rewrite or changes to visual quality.

## Evidence and limits

The maintained [camera workload scene](../../../web/scenes/system/camera-math-performance.mjs)
captures real calls and separates unwrapped timings from CPU/allocation sampling.
It records browser, adapter, source/WASM identity, viewport, DPR and first/warmed
traversals. Raw profiles and experimental comparisons belong in ignored
`throwaway/math-optimization/`, not in the application or this archive.

The admission rule was fixed before comparisons: save at least 0.25 ms and 10%,
exceed the range of baseline-run medians, and win at least four of five paired
windows. Each warmed window lasts at least five seconds. Full-frame p95 may not
regress in two controlled pairs beyond the larger of baseline p95 range, 0.5 ms
or 5%. Conversion and preparation costs count. Correctness, visual, input-latency
or allocation/GC regressions reject a candidate even when isolated CPU improves.

Replays of captured projection batches using shipped camera primitives on
hardware-backed headless Chrome 153 / Apple M5 Pro passed the projection CPU
gate in all 14 view/motion/DPR/resize cases, winning all five pairs and saving
2.55–4.25 ms per observed batch. Each five-second window cycles the same 84
captured batches; results are separated by case afterward. Preparation is
included, but these timings exclude ray queries and whole-frame work.
Numerical comparisons cover 1,569,748 points with zero coordinate/clip-W
residuals, front/behind disagreements or ray residuals, including finite/infinite
far and degenerate poses.

A separate real-campaign comparison swaps the four changed world methods against
frozen original methods. Five paired five-second windows at three held views
and both DPRs pass the fixed whole-frame rule with no regressing pair. Paired pose,
quality, visible membership, draw calls, geometry and resident tiles agree.
Total main-thread task time is lower in all six paired-median summaries; a
cached draw-stage median rises in whole-map DPR2, illustrating why isolated
stage results must not replace whole-frame admission. The final 14-case live
capture passes all probe checks. Separate allocation
sampling falls from 22.3 MB to 13.2 MB per observed frame; GC-attributed CPU
samples fall from 69.5 ms to 60.6 ms across 181 profiled frames in each run.
These are sampled observations, not exact allocation totals or pause timings.

[Camera tests](../../../web/tests/camera3d.test.ts) pin geometry and prepared
lifetimes. The [raised-label scene](../../../web/scenes/campaign/campaign-raised-labels.mjs)
checks real simultaneous worlds, immediate pan/zoom/resize projection and
picking, and retained public results at DPR 1/2. Existing camera/DPR/picking
checks remain unchanged. Full web tests pass (1,096 tests with four workers),
as do typecheck, lint and the web build. Default test concurrency hit a
worker-test timeout; that unchanged test passes in the four-worker rerun. No
timeout or assertion was relaxed.

The frozen Roma production frame and five composition/alignment captures are
pixel-identical to current pre-change captures. Five historical canonical
snapshots already fail and remain unchanged; the remaining checks in the
exercised campaign scenes pass. Those failures are disclosed, not re-blessed or called green. Fresh visual
review also identified existing detached/edge-clipped labels, coastal cards with
unclear anchors, and strong fixture shadows. This CPU change preserves their
current appearance; it does not claim to repair or approve those visual issues.
The nonblocking Preview review proceeded on that preservation evidence, and
its opened images were closed. Canonical references remain in the existing
[campaign snapshot collection](../../../web/shots/campaign/); no images were
re-blessed for this optimization.

Hardware-backed headless results establish relative CPU and animation-callback
cadence, not physical presentation or input-to-display latency. Sampled
allocation includes collected objects and does not measure exact allocation or
GC pauses. The [choices ledger](choices.md) records decisions made beyond the
original plan.
