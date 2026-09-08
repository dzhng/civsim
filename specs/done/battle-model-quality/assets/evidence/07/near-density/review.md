# Fixed-5K near geometry sensitivity

Reducing only near-tier subdivision substantially lowers the measured GPU-queue
elapsed time, but **neither density passes the animated cadence gate**. This is
evidence that near geometry contributes to this workload's cost, not an accepted
triangle limit or permission to simplify the authored soldiers to this fixture.

## Controlled change

The existing production `battle-model-budget` ran A/B/A once at5120×2880:
near-tier9,216 →2,304 →9,216 triangles. Other tiers remain576/144 triangles;
the fixture remains30,000 mounted bodies,67 bones, four influences, doubled
authored-key intervals and three1024px maps. The test uses coplanar subdivision,
not overlapping duplicate faces. No renderer, policy, source asset or gate changed.

[CPU controls](controls.json) prove exact equality of manifest, rig, baked
animation, surface, far mesh and both other tiers. Every retained near vertex
attribute is exact; refinement adds vertices and replaces indices. Animation
storage is947,112 bytes in both cases. These checks isolate fixture construction;
they are not natural-model quality evidence.

All twelve measurement rows have the same physical drawing buffer, camera,
draw-call count, main/shadow tier histograms and reported palette demand.
The main view draws6,113 near meshes;23,887 bodies are shadow-only, not visible
impostors. All30,000 retain coarsest shadow casters and a67-bone palette. The
camera and aspect ratio stay fixed, unlike the preceding
[resolution bracket](../combined-display-bracket/review.md).

## Results

Times below are milliseconds. GPU values are median/p95 GPU-queue elapsed,
including CPU submission gaps; they are not active GPU pass totals. RAF values
are p95 for uninstrumented control / timed rows. CPU values are median/p95 for
the timed rows. Never add overlapping CPU and GPU durations.

| Case | Mode | CPU | GPU queue | RAF control / timed |
| --- | --- | --- | --- | --- |
| A before | steady |14.07 /22.21 |41.12 /43.52 |83.33 /50.00 |
| B | steady |14.46 /23.40 |23.74 /26.14 |50.00 /33.335 |
| A after | steady |14.80 /23.07 |46.41 /48.85 |83.335 /50.00 |
| A before | interruptions |17.12 /27.34 |41.17 /43.76 |83.33 /50.00 |
| B | interruptions |17.76 /30.64 |23.73 /26.05 |49.99 /33.335 |
| A after | interruptions |17.86 /31.33 |47.02 /49.59 |99.995 /50.00 |

The reduction is present against both controls despite their drift. B passes
the GPU-queue median criterion but fails all four cadence checks:33.335ms is
still greater than33ms. A before/after each fail those four checks and both
GPU medians. All three reports therefore exit1; none was discarded or rerun
until green. The orchestrator exits0 only because it successfully collected
all three terminal reports.

Each row has180 sampled frames after60 warmup frames. Each timed row has180
distinct frame-tagged GPU results matching sampled frame IDs. There are no
page errors or renderer warnings. The existing separate allocation phase
passes; it is not a distinct-history timing result. Full samples, allocation
reports and checks remain in [A before](a-before.json), [B](b.json) and
[A after](a-after.json); [summary](summary.json) derives comparable rows without
duplicating the full allocation history.

## Conditions and limits

Run2026-09-07 09:58:06–10:00:43UTC on the AppleM5Pro20-core GPU, installed
Chrome152.0.7977.77, hardware WebGPU, headless browser, root revision`a78a9fc3`.
This matches the external display's physical pixel size but does not measure
presentation on that actual monitor. The standing30k benchmark is unchanged
and was not rerun for this data-only experiment.

[Environment](environment.json) records source hashes, run exits and21 process
samples. Task-owned screenshot jobs were serialized. Machine activity was not
isolated: filesystem events used roughly74–95%CPU in several samples; Blender
used roughly1,550%CPU around the A-before/B boundary; other app and browser work
varied. No unrelated process was stopped. Ten-second samples neither establish
an idle GPU nor capture all intervening activity; sampling itself also adds
small unisolated work. A-after being slower is retained, not explained away.

The production simulation clock advances with elapsed time: timed steady rows
advanced228/134/257 ticks and interruption rows230/133/258. Thus the histories
are not identical pose-by-pose despite identical setup. This and background
activity limit precise causal attribution. The result does not separate vertex
transformation, triangle setup, fragment work or post-processing, and does not
prove that the remaining cost is fill-rate bound.

## Next decision

Near geometry is now an evidenced cost lever. Keep the actual authored model
quality target intact; eventual distance reductions must earn their own visual
review. Before locking an envelope, investigate the remaining cadence and CPU
submission tails at the lower-density controlled workload. Do not repeat the
unchanged resolution sweep, round33.335 down to a pass, or infer that another
triangle reduction alone will solve the remaining gate.

The subsequent [CPU attribution](cpu-review.md) narrows the inspection to LOD
planning and animation observation/sampling, with sampled GC overlap. It is a
separate profiled diagnostic, not another acceptance timing run.

Review: controls and raw measurement rows agree; no production code, test
behavior, dependency or new runtime owner was added. The existing delegated
measurement scope covers this parameter probe, so there is no new architectural
choice to bank. It is numerical evidence only, not visual acceptance.
