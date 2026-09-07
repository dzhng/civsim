# 07 — Measure asset and animated-view budgets

Status: IN PROGRESS. Depends on [06](./06-gpu-playback.md), now complete.

Current pickup: investigate remaining cadence and submission tails at the
controlled lower near density. The [fixed-5K A/B/A](../assets/evidence/07/near-density/review.md)
shows sensitivity to near geometry with matched camera, tiers and palette demand,
but the lower density still fails cadence. No art limit is accepted.
The [frozen-source retirement cleanup](../assets/evidence/07/frozen-retirement/review.md)
preserves exact playback and lowers steady CPU work in the matched comparison;
interruption timing is mixed and all cadence rows remain red.
The [upper-wrapper cleanup](../assets/evidence/07/upper-wrapper/review.md)
removes one redundant private allocation with exact-output coverage. CPU medians
are mixed; this is not a cadence improvement and does not justify another hardware
run by itself.
The [available-display bracket](../assets/evidence/07/combined-display-bracket/review.md)
records1280×800,3024×1964 and5120×2880 with the unchanged combined workload;
all fail cadence and5K also fails GPU-queue medians. Background activity limits
attribution. The older passing preparation-cleanup result below is historical,
not current acceptance. Preserve red results; no repeat-until-green loop.

## Contract and ownership

Detailed exported art receives a measured cost envelope before acceptance,
without weakening existing performance gates. Editable08 anatomy and09 gear may be authored
in parallel as candidate-only content;07 remains open until every requirement
below is satisfied. This is not permission to infer limits from passing isolated
bone or geometry brackets.

API seam: Production workbench synthetic weighted fixtures and actual battle benchmark; record hardware, viewport, crowd, LOD counts, CPU/GPU frame time, memory and upload/draw costs.

Names of new functions/routes in this plan are proposed, not existing commands. Use the [shared acceptance contract](../README.md#acceptance-contract) and [architecture](../architecture.md) for inherited requirements.

## Runnable artifact

The [projected-detail correction](../assets/evidence/07/projected-lod.md) records
the integrated policy, visual review, strict temporal repeat and standing
hardware checks. The matched close workload passes; broader budgets remain open,
so this does not freeze an art
envelope.

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
foot assets and synchronized interruption bursts; it is not a budget acceptance.
Actual allocation tracking and controlled mounted detail sweeps are implemented.
Next resolve measured interruption-frame preparation cost, complete combined
camera/display brackets, then freeze the measured envelope and bake checks
before08 acceptance. The standing benchmark remains
unchanged and separate.

### Current execution checkpoints

The [measurement foundation](../assets/evidence/07/measurement-foundation.md)
owns current commands and review evidence. Exact immutable pose sharing now
passes the foot transition workload and strict temporal regression. Mounted
baseline, detail brackets and display-resolution acceptance remain open.
No budget limit may be assigned from the median alone.

The [reusable control packing candidate](../assets/evidence/07/control-storage.md)
removes repeated CPU backing-array allocation with exact transport tests;
hardware and browser acceptance remain required before crediting a speedup.

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

### Integrated prerequisite: projected-size correction

The [geometry bracket](../assets/evidence/07/mounted-geometry-red.json) fails
cadence with2,304/576/144 triangles per tier, whereas the
[35-bone bracket](../assets/evidence/07/mounted-bones.json) passes. The current
former shared LOD estimate used zoom and radial distance, not perspective projection.
At the recorded close camera, a mounted body150m ahead is estimated21.31px
(L0), but the canonical camera projects its upright span to15.84px (L1, beyond
hysteresis). The estimate also understates near bodies. Budgeting from it would
confuse misallocated detail with the cost of a well-framed model.

The integrated correction uses actual projected reference-body size for
production LOD, preserving thresholds, hysteresis, camera settings and simulation.
Use a camera-facing span so overhead views do not collapse its height. Cover
elevation, framebuffer scaling, near-plane intersections and shadow-only bodies;
shadow contributions use their actual cameras and retain a mesh caster. Make
the existing coarsest mesh tier a caster as well: retaining that tier must not
quietly retain geometry that cannot cast. The planner and mesh construction
share this policy. Keep main-view and shadow representation demands separate:
the first combined-tier implementation replaced intentionally readable far
impostors with tiny meshes and failed independent visual review. Use Three's
existing shadow-only object layers and the existing bucket/skin upload machinery
to retain both the main impostor and its reduced caster, sharing each source
instance's palette slot. No new shadow renderer, shader or light tuning is added.
Record and visually inspect this intentional shadow change.
Keep one shared policy owner, not a budget-only override. Prove the old estimate
wrong with projection tests, then run affected visual/LOD and standing30k gates
before repeating budget brackets. These prerequisite checks now pass; recorded
visual changes are not final-art approval. This moves the policy prerequisite forward;
15 still owns authored mesh reductions, far appearance and visual continuity.
Do not reduce final art quality to fit an uncorrected ruler.

### Current checkpoint: broader combined budgets after preparation cleanup

The matched combined high-detail workload still fails both interruption cadence
checks after the lazy prior-playback change; see
[comparison](../assets/evidence/07/observation-only.md). Its median observation
cost improved, but tails did not. A bounded CPU sampling
[diagnostic](../assets/evidence/07/interruption-window-summary.json) attributes
substantial preparation work to projected LOD and palette packing, with GC
overlap. The profiler's startup delay makes it diagnostic, not acceptance timing.

The two owner-local passes are integrated through1d6014d2: retained control
scratch and less repeated LOD work. The [matched repeat](../assets/evidence/07/combined-control-lod.json)
passes all30 checks with unchanged assets, camera, tier histograms and GPU upload
volume. Interruption control/timed RAFp95 both fall to16.67ms from roughly33.33ms;
CPU p95 is23.28/23.30ms. This is evidence for the combined changes, not separate
attribution or proof of GC causation. Merged strict temporal/palette checks,
camera and display-resolution brackets and executable asset limits remain
required. The merged temporal/palette repeat now passes, as recorded in the
projected-detail evidence. Do not infer a universal budget from one configuration.

Distinct interruption histories require a separate storage bracket: synchronized
soldiers share exact sources and cannot establish worst-case memory capacity.
The [staggered allocation evidence](../assets/evidence/07/staggered-allocation.md)
uses real controller observations, reproduces the hardware failure and owns the
CPU fixture proof. Do not cap, approximate or discard exact frozen poses to fit
the synchronized result.

### Required correction: exact frozen storage across binding limits

The staggered hardware diagnostic reproduces the calculated failure at67 joints:
60,000 sources require192,960,000 snapshot bytes and exceed the device's
134,217,728-byte binding limit. The existing failure path suppresses the crowd
until source retirement permits admission again. The output palette itself fits:
its matrices use64 bytes per joint, while frozen local samples use48.

Two lazily grown frozen-source banks are integrated under the existing palette owner.
Stripe existing logical slots by parity, so mapping is stable through growth,
holes and shrinking crowds. With retained admitted output capacity C, each bank
needs at most C poses because each submitted body has at most two frozen sources.
Preserve exact values, cross-layer identity sharing and existing controller/packer
semantics; do not cap sources or rely on synchronized histories. Update the shared
kernel and both production/raw consumers together, retaining one compute/output
and skin path. Count both banks and replacement overlap in telemetry.

This correction requires parity-branch weighted-pose tests,
retained-high-slot/shrink/reuse tests, atomic failure/recovery and disposal tests,
then the actual staggered hardware workload and unchanged temporal/standing
gates. Device binding-count and total allocation failures remain real errors;
two smaller bindings are not proof of unlimited total memory. Broader measured
art/display limits still follow; this sub-pass does not close07 by itself.

[Merged bank verification](../assets/evidence/07/snapshot-banks.md) records
passing focused CPU/type checks and actual30k/67-joint storage admission. Both
synchronized interruption cadence rows remain red; the staggered allocation
phase is not a timing measurement. Preserve that distinction when diagnosing
the next pass. Merged temporal/standing repeats pass as recorded in that evidence;
broader envelope gates remain open.

## Focused verdict

The [caller-owned LOD storage experiment](../assets/evidence/07/lod-storage.md)
preserved exact output but was rejected after worse matched hardware timing.
Its patch and all reports are retained; production keeps the prior planner.

The [same-lane packing diagnostic](../assets/evidence/07/same-lane-packing.md)
finds duplicate clip resolution primarily in settled lanes, not transitions.
Its exact-output CPU probe is positive at the median but mixed at the tail;
the [base-only implementation checkpoint](../assets/evidence/07/settled-base-packing.md)
has focused CPU proofs and exact canonical browser regression. Its matched
hardware A/B/A shows modest steady upload savings but mixed interruption costs;
all cadence rows still fail. No browser frame-rate improvement or budget
acceptance is inferred.

The [synchronized capture dismissal](../assets/evidence/07/synchronized-capture-dismissal.md)
rules out per-body full pose evaluation as the synchronized interruption cause:
existing exact sharing evaluates one pose per transition. Distinct histories
remain separate; this does not establish their timing or the remaining envelope.

Future hardware comparisons must check machine-wide background activity, not
only serialize this task's agents. On2026-09-07 a read-only process check found an
unrelated Chrome152 GPU/renderer process active after this task's capture jobs
ended; earlier reports used Chrome151, while the later display brackets use152.
This does not establish what
ran during earlier measurements or explain their failures; it does mean that
task-local GPU ownership alone cannot prove an idle device. Preserve prior red
reports and do not stop unrelated user applications to manufacture a quiet run.

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

Implementation and diagnostic checks are in progress; no budget envelope has
been accepted.
