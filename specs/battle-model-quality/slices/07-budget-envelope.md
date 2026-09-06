# 07 — Measure asset and animated-view budgets

Status: IN PROGRESS. Depends on [06](./06-gpu-playback.md), now complete.

## Contract and ownership

Detailed art receives a measured cost envelope without weakening existing performance gates.

API seam: Production workbench synthetic weighted fixtures and actual battle benchmark; record hardware, viewport, crowd, LOD counts, CPU/GPU frame time, memory and upload/draw costs.

Names of new functions/routes in this plan are proposed, not existing commands. Use the [shared acceptance contract](../README.md#acceptance-contract) and [architecture](../architecture.md) for inherited requirements.

## Runnable artifact

Synthetic crowd sweeps with increasing vertices, bones, textures, crossfades and mounted masked composition; close, mid and vista camera fixtures.

Expose the fixture through the production model workbench and a named scene/probe. Record the exact runnable command in this file when it exists; do not mark completion with screenshots alone.

The first measurement is `battle-model-budget`, a numerical scene using the
production workbench crowd, controller, culling, shadows and post-processing.
It compares matched uninstrumented frames with independently frame-tagged GPU
timestamp brackets. The bracket measures **GPU-queue elapsed**, including CPU
submission gaps, not a sum of active GPU passes. CPU observation, sampling,
instance construction, upload and render submission are reported separately;
overlapping CPU/GPU durations must not be added. Pending readbacks never block
the sampled frame loop or become a newer frame's result.

Run from the feature worktree with `VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware
VERIFY_BROWSER_CHANNEL=chrome VERIFY_URL=http://127.0.0.1:5174
node web/scene.mjs battle-model-budget`. The initial baseline uses existing
foot assets and synchronized interruption bursts; it is not yet the synthetic
detail sweep or a budget acceptance. Next integrate actual allocation tracking,
measure mounted composition and one-variable detail sweeps, then freeze the
measured envelope and bake checks before08. The standing benchmark remains
unchanged and separate.

### Current execution checkpoints

The [measurement foundation](../assets/evidence/07/measurement-foundation.md)
owns current commands and review evidence. Exact immutable pose sharing now
passes the foot transition workload and strict temporal regression. Mounted
baseline, detail brackets and display-resolution acceptance remain open.
No budget limit may be assigned from the median alone.

1. Frame probe and allocation observer: unit-tested lifecycle, then actual
   hardware coverage. The [first smoke](../assets/evidence/07/timestamp-smoke-red.json)
   rejected every empty-pass timestamp. A one-invocation no-op dispatch prevents
   Metal from skipping the marker; the [corrected smoke](../assets/evidence/07/timestamp-smoke-fixed.json)
   has valid frame-correlated times. Keep the rejected result as evidence.
2. Live foot and mounted baseline, synchronized interruptions, uninstrumented
   comparison and both render resolutions. Use production's `SimClock` and shared
   cap, then observe the latest state once when its tick changes, matching
   `BattleCrowd`. The [uncapped catch-up experiment](../assets/evidence/07/uncapped-observations-red.json)
   instead replayed every missed observation and amplified stalls; it is not
   evidence of production CPU cost. Report advanced ticks and wall-time cadence,
   since capped catch-up deliberately drops excess simulation backlog.
3. Controlled detail sweeps, then measured limits and executable asset checks.
   Subdivision changes real coplanar triangles, not overlapping duplicate faces;
   transform-equivalent weighted joint clones isolate bone/storage cost from
   visual shape. The [synthetic fixture proof](../assets/evidence/07/synthetic-fixture.md)
   covers these controlled mutations. Such fixtures establish cost, not anatomy.

### Measured blocker: projected-size correction before final limits

The [geometry bracket](../assets/evidence/07/mounted-geometry-red.json) fails
cadence with2,304/576/144 triangles per tier, whereas the
[35-bone bracket](../assets/evidence/07/mounted-bones.json) passes. The current
shared LOD estimate uses zoom and radial distance, not perspective projection.
At the recorded close camera, a mounted body150m ahead is estimated21.31px
(L0), but the canonical camera projects its upright span to15.84px (L1, beyond
hysteresis). The estimate also understates near bodies. Budgeting from it would
confuse misallocated detail with the cost of a well-framed model.

Insert a focused correction here: use actual projected reference-body size for
production LOD, preserving thresholds, hysteresis, camera settings and simulation.
Use a camera-facing span so overhead views do not collapse its height. Cover
elevation, framebuffer scaling, near-plane intersections and shadow-only bodies;
shadow contributions use their actual cameras and retain a mesh caster. Make
the existing coarsest mesh tier a caster as well: retaining that tier must not
quietly retain geometry that cannot cast. The planner and mesh construction
share this policy. No separate shadow mesh pipeline or light tuning is added;
record and visually inspect this intentional shadow change.
Keep one shared policy owner, not a budget-only override. Prove the old estimate
wrong with projection tests, then run affected visual/LOD and standing30k gates
before repeating budget brackets. This moves the policy prerequisite forward;
15 still owns authored mesh reductions, far appearance and visual continuity.
Do not reduce final art quality to fit an uncorrected ruler.

## Focused verdict

Variable: **Cost versus visible detail**.

Crop/mask: Fixed camera framing and synthetic geometry; no aesthetic acceptance here.

Freeze all previously accepted variables. Capture the candidate and prior/reference with the same fixture manifest. Where a family has execution rows, record each row separately; do not change several rows before the first earns a verdict. Reuse is allowed only after that row's verification passes.

## Verification

Preserve battle-perf-30k 30k+soldiers/foliage and 33ms criteria. Establish live animated baseline at 1280×800 on hardware Chrome plus user's available display resolution; lock close-view threshold before art (target 33ms; if baseline already exceeds it, report and reslice optimization, do not silently raise). Record bounded mesh, texture, authored-key sample, palette and frozen-pose storage budgets.06 chose authored-time samples rather than a fixed-rate bake; measure that representation rather than introducing an unrelated sample-rate knob.

The standing renderer benchmark's render-only GPU time is not a compute-inclusive
animated-frame measurement. Correlate render and palette-compute work to actual
frame identifiers, reject repeated/delayed readbacks as fresh samples, and report
full CPU frame time separately. Allocation-time initialization and replacement
peaks count alongside steady-state changed-control/snapshot uploads. Draining
Three's compute timing pool prevents exhaustion; it does not itself establish
this measurement contract.

1. Run the applicable deterministic contract tests and `snapCheck` captures; preserve unrelated tests and simulation outcomes.
2. Use **compare-screenshots** for candidate versus prior/reference on the named mask; retain telemetry and a written less-wrong verdict. A Rome II photograph is a visual target, not a pixel-equality baseline.
3. As the **last visual check before acceptance**, use **screenshot-critique** with an unprimed agent. Resolve verified defects in scope; record excluded defects against their owning slice. Do not describe a shot as verified before this check.
4. Archive feature evidence and comparison/critique notes under `assets/evidence/07/`; active regression baselines remain in their harness-owned location.

For a purely numerical probe, archive its output as well as the review surface; do not invent a visual-quality verdict from numerical success.

## Decision budget and feedback

Delegated: Allocation among LODs within measured budget; no arbitrary promised bone/triangle counts. Full simulation cost reported separately from renderer timing.

All other architectural, scope and quality changes are spec gaps: update/reslice the plan before widening the patch. Human feedback on the focused variable can reopen this slice; feedback on a frozen variable belongs to its owner.

When presenting shots, use **preview-shots**, offer approximately five minutes for feedback without a long blocking tool wait, then decide from evidence if the user is silent. Record the decision and rationale, close the opened Preview shots, and continue. Silence is not explicit endorsement, and failing technical/visual gates cannot be waived by silence.

## Completion record

- [ ] Contract and runnable artifact implemented.
- [ ] Execution rows, if any, each have evidence and verdict.
- [ ] Tests and inherited gates pass; changed-test behavior ledger recorded.
- [ ] Comparison and final unprimed critique recorded.
- [ ] Review/cleanup completed; README pickup and decisions updated.

Record actual commands, evidence links, measured results, decisions and unresolved defects here during implementation. No implementation or visual acceptance has occurred yet.
