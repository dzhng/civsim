# 07 — Measure asset and animated-view budgets

Status: TODO. Depends on [06](./06-gpu-playback.md).

## Contract and ownership

Detailed art receives a measured cost envelope without weakening existing performance gates.

API seam: Production workbench synthetic weighted fixtures and actual battle benchmark; record hardware, viewport, crowd, LOD counts, CPU/GPU frame time, memory and upload/draw costs.

Names of new functions/routes in this plan are proposed, not existing commands. Use the [shared acceptance contract](../README.md#acceptance-contract) and [architecture](../architecture.md) for inherited requirements.

## Runnable artifact

Synthetic crowd sweeps with increasing vertices, bones, textures, crossfades and mounted masked composition; close, mid and vista camera fixtures.

Expose the fixture through the production model workbench and a named scene/probe. Record the exact runnable command in this file when it exists; do not mark completion with screenshots alone.

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
