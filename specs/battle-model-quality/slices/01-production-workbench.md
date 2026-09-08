# 01 — Production model workbench

Status: COMPLETE. Harness accepted; current model art is not accepted.

## Contract and ownership

Review inputs feed PhotorealBattleWorld and its existing environment/crowd, never a second soldier shader.

Manual clip selection and life state are independent: an authored clip name cannot
tell the renderer whether to apply corpse presentation. The workbench exposes that
state explicitly; canonical replay still gets it from engine observations.
[Manual-state verification](../assets/evidence/01/manual-life/review.md) also records
the causal repair of stale shadow-LOD baselines, without changing production lighting.

API seam: apps/renderer-lab: /renderer/battle-models; typed review scene {appearance, pose/time, camera, formation}; production world accepts explicit instances alongside its battle adapter.

Names of new functions/routes in this plan are proposed, not existing commands. Use the [shared acceptance contract](../README.md#acceptance-contract) and [architecture](../architecture.md) for inherited requirements.

## Runnable artifact

Use current assets to show a selectable soldier, frozen frame, turntable, and 4×4 formation. Provide local bundle reload and visible load errors through the existing loader. Weighted GLB replacement is added in03 after its bake contract exists; do not build an independent upload/import pipeline here.

Expose the fixture through the production model workbench and a named scene/probe. Record the exact runnable command in this file when it exists; do not mark completion with screenshots alone.

## Focused verdict

Variable: **Harness/production parity**.

Crop/mask: Same current appearance, camera and time in battle and workbench; compare full soldier mask. Geometry defects and old animations are frozen inputs.

Freeze all previously accepted variables. Capture the candidate and prior/reference with the same fixture manifest. Where a family has execution rows, record each row separately; do not change several rows before the first earns a verdict. Reuse is allowed only after that row's verification passes.

## Verification

Named scene battle-model-workbench through web/scene.mjs; asset-workbench and production smoke stay green; record baseline shots.

1. Run the applicable deterministic contract tests and `snapCheck` captures; preserve unrelated tests and simulation outcomes.
2. Use **compare-screenshots** for candidate versus prior/reference on the named mask; retain telemetry and a written less-wrong verdict. A Rome II photograph is a visual target, not a pixel-equality baseline.
3. As the **last visual check before acceptance**, use **screenshot-critique** with an unprimed agent. Resolve verified defects in scope; record excluded defects against their owning slice. Do not describe a shot as verified before this check.
4. Archive feature evidence and comparison/critique notes under `assets/evidence/01/`; active regression baselines remain in their harness-owned location.

For a purely numerical probe, archive its output as well as the review surface; do not invent a visual-quality verdict from numerical success.

## Decision budget and feedback

Delegated: Control layout and route module naming; retain existing production lighting values.

All other architectural, scope and quality changes are spec gaps: update/reslice the plan before widening the patch. Human feedback on the focused variable can reopen this slice; feedback on a frozen variable belongs to its owner.

When presenting shots, use **preview-shots**, offer approximately five minutes for feedback without a long blocking tool wait, then decide from evidence if the user is silent. Record the decision and rationale, close the opened Preview shots, and continue. Silence is not explicit endorsement, and failing technical/visual gates cannot be waived by silence.

## Completion record

- [x] Contract and runnable artifact implemented.
- [x] Execution rows, if any, each have evidence and verdict.
- [x] Tests and inherited gates pass; no existing test behavior changed.
- [x] Comparison and final unprimed critique recorded.
- [x] Review/cleanup completed; README pickup and decisions updated.

Run `/renderer/battle-models` through the feature worktree's Vite server. Verify with `cd web && VERIFY_GPU=1 VERIFY_URL=http://localhost:5174 node scene.mjs battle-model-workbench`. [Evidence and review](../assets/evidence/01/review.md) records comparison, failure cases, exact parity and production/performance gates. The parity probe submits on distinct browser frames because three.js caches its post-processing scene per frame.
