# Rejected reusable LOD result candidate

The candidate preserved exact rendering but did not earn integration. Both
bracketing baseline runs were faster than the candidate, and the candidate's
interruption cadence p95 worsened to 50 ms. Its production/test changes have
been removed. The [rejected patch](lod-storage-rejected.patch) is retained for
reproducibility, not as shipped code or a recommended optimization. No threshold,
image, controller, projection or quality budget was changed.

## Experiment and complete outcomes

A1 and A2 use `b8c7ea35`; B uses that revision plus the archived four-file patch.
Hardware Chrome uses `apple / metal-3`, 1280×800 and exclusive GPU ownership.
The existing harness/configuration is unchanged: mounted 30,000 bodies, close
gameplay camera, 67 joints, four influences, 1024 maps, 60 warmup and 180 measured
frames per row. Only result storage changed. No trig/live-roll simplification
was mixed in. The command is:

```sh
BUDGET_FIXTURE=mounted BUDGET_SOLDIERS=30000 BUDGET_FRAMES=180 BUDGET_WIDTH=1280 BUDGET_HEIGHT=800 BUDGET_CAMERA=gameplay BUDGET_STOPS=close BUDGET_DETAIL='{"subdivisions":[3,1,0],"jointCopies":8,"influences":4,"keySubdivisions":2}' BUDGET_TEXTURE_SIZE=1024 VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome VERIFY_URL=http://127.0.0.1:5176 SCENARIO_REPORT_JSON=specs/battle-model-quality/assets/evidence/07/lod-storage-before.json node web/scene.mjs battle-model-budget
```

A runs used owned port 5176; B used 5177 and a different report path.
The [A1 report](lod-storage-before.json), [B report](lod-storage-after.json) and
[A2 report](lod-storage-before-repeat.json) all exit 1 and fail exactly the four
live-cadence checks: steady/control, steady/timed, interruptions/control and
interruptions/timed. No run was discarded. Each reports no renderer warnings or
page errors, all 30,000 bodies submitted, and exact 60,000-source storage
admission. Configuration, asset sizes, surface maps and tier histograms match.
An unchanged SwiftShader temporal run occurred between B and A2; no concurrent
GPU workload ran during any hardware measurement.

Milliseconds, median/p95; quantiles use the unchanged harness's sorted
`floor(n * fraction)` index. CPU stages and GPU-queue durations are not additive.

| Row | A1 CPU | B CPU | A2 CPU | A1 upload | B upload | A2 upload |
| --- | --- | --- | --- | --- | --- | --- |
| Steady/control | 16.050/26.545 | 21.040/33.580 | 12.380/19.720 | 8.265/12.015 | 10.435/15.195 | 6.455/9.735 |
| Steady/timed | 16.095/28.370 | 17.940/27.935 | 12.065/20.710 | 8.365/13.570 | 8.940/11.985 | 6.225/10.505 |
| Interruptions/control | 17.820/31.485 | 27.605/46.210 | 14.520/28.370 | 9.265/14.000 | 12.045/18.630 | 7.430/11.395 |
| Interruptions/timed | 18.815/33.485 | 26.090/42.510 | 14.520/27.225 | 9.615/14.380 | 11.675/18.100 | 7.180/11.040 |

A1 interruption RAF p95 is 33.335 ms for both rows; B is 50.000 ms for both;
A2 is 33.330 ms for both. Steady RAF p95 remains about 33.33 ms throughout.
The large A1→A2 movement also demonstrates environmental/run variation. One B
run cannot identify whether allocation lifetime, JIT/GC, thermal effects or
another mechanism caused the difference. Rejecting this candidate avoids
shipping an unproven performance change; it is not proof that reuse is always
slower. All original cadence gates remain open.

## Exactness and review, not acceptance

The candidate made the shared assignment helper write explicit caller output and
gave the production crowd one retained LOD result, with an active count distinct
from capacity. Every projection, corpse-roll calculation, visibility decision
and independent main/shadow history update stayed in place. The rejected patch
contains the exact implementation and tests, without a second planner.

The first reuse test failed on fresh-result baseline behavior, then passed.
42 focused tests and typecheck passed with the candidate. The unchanged
`b909f671d1ae98a8c6ecf58cf91898f9a1808750370c4cb9f6be6e655de7a78a`
hash pins the same multiview/off-axis/corpse/near-plane/elevated/mounted/foot
sequence through shrink and regrowth. Two added tests verify identity reuse,
overwritten values and retained capacity. The hash test copies active results
before retaining them; its expected value was not re-pinned. Other existing
tests only supply explicit output storage and keep their assertions.

[Temporal report](lod-storage-temporal.json):
`VERIFY_GPU=1 VERIFY_URL=http://127.0.0.1:5177 node web/scene.mjs battle-model-action-replay`
passes 545 checks, including all 39 temporal images and the controller image at
0 differing pixels. The unchanged controller image was inspected; this proves
regression equivalence, not model-art acceptance. No baseline was created or
re-blessed.

Shape/diff review found one scratch histogram-alias hazard; candidate publication
copies preserved the previous published histogram if a later plan rejected.
That failure/stat property was source-reviewed only, not independently exercised
through the production consumer. The integrating agent independently reviewed
the four-file diff as sound. CLI review could not start because its configured
`gpt-6-astra` requires a newer installed CLI; no upgrade or override was made.

The candidate's storage decision was to retain objects to the largest submitted
count, overwrite active values, and keep histories separate. This trades
retained CPU memory for fewer allocations. It was reasonable to test but remains
rejected, so it creates no shipped ownership contract or choices-ledger entry.
Production and tests are restored to baseline; the next step needs a separately
measured hypothesis, not further changes piled onto this failed candidate.
