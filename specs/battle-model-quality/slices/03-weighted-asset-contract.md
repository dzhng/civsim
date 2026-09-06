# 03 — Weighted mesh and skeleton cutover

Status: TODO. Depends on [02](./02-blender-reference-fixtures.md).

## Contract and ownership

One versioned baked appearance format preserves weighted deformation end to end.

API seam: soldier-assets schema/baker/loader → renderer-core VAT layout → photoreal crowd skinning; positions, normals, UVs, tangents, JOINTS_0/WEIGHTS_0, explicit indices and shared skeleton identifiers.

Names of new functions/routes in this plan are proposed, not existing commands. Use the [shared acceptance contract](../README.md#acceptance-contract) and [architecture](../architecture.md) for inherited requirements.

## Runnable artifact

Production workbench bends the same fixture beside the reference evidence. Establish the complete tier/bounds/far schema and loader using converted placeholder bundles while detailed content is authored. Detailed art remains a workbench candidate until its full distance-ready bundle passes15 or28, then replaces production atomically. Add local GLB replacement through this same bake contract and reload the resulting bundle; surface unsupported-export errors in the workbench. No parallel preview-only importer.

Expose the fixture through the production model workbench and a named scene/probe. Record the exact runnable command in this file when it exists; do not mark completion with screenshots alone.

## Focused verdict

Variable: **Skin deformation parity**.

Crop/mask: Fixture bend silhouette and landmark mask; checker/material fidelity is slice 04, motion interpolation slice 06.

Freeze all previously accepted variables. Capture the candidate and prior/reference with the same fixture manifest. Where a family has execution rows, record each row separately; do not change several rows before the first earns a verdict. Reuse is allowed only after that row's verification passes.

## Verification

Extend gltf.test.mjs and vat.test.mjs with analytic blended-joint positions; verify normal transforms and shadow deformation. Update or retire raw renderer consumers in this same cutover; no v1 runtime reader or optional import override remains.

1. Run the applicable deterministic contract tests and `snapCheck` captures; preserve unrelated tests and simulation outcomes.
2. Use **compare-screenshots** for candidate versus prior/reference on the named mask; retain telemetry and a written less-wrong verdict. A Rome II photograph is a visual target, not a pixel-equality baseline.
3. As the **last visual check before acceptance**, use **screenshot-critique** with an unprimed agent. Resolve verified defects in scope; record excluded defects against their owning slice. Do not describe a shot as verified before this check.
4. Archive feature evidence and comparison/critique notes under `assets/evidence/03/`; active regression baselines remain in their harness-owned location.

For a purely numerical probe, archive its output as well as the review surface; do not invent a visual-quality verdict from numerical success.

## Decision budget and feedback

Delegated: Internal buffer packing and 16/32-bit index choice based on asset size; normalized maximum four influences per vertex, report weight-reduction error instead of silently choosing one joint.

All other architectural, scope and quality changes are spec gaps: update/reslice the plan before widening the patch. Human feedback on the focused variable can reopen this slice; feedback on a frozen variable belongs to its owner.

When presenting shots, use **preview-shots**, offer approximately five minutes for feedback without a long blocking tool wait, then decide from evidence if the user is silent. Record the decision and rationale, close the opened Preview shots, and continue. Silence is not explicit endorsement, and failing technical/visual gates cannot be waived by silence.

## Completion record

- [ ] Contract and runnable artifact implemented.
- [ ] Execution rows, if any, each have evidence and verdict.
- [ ] Tests and inherited gates pass; changed-test behavior ledger recorded.
- [ ] Comparison and final unprimed critique recorded.
- [ ] Review/cleanup completed; README pickup and decisions updated.

Record actual commands, evidence links, measured results, decisions and unresolved defects here during implementation. No implementation or visual acceptance has occurred yet.
