# 02 — Blender export reference fixtures

Status: TODO. Depends on [01](./01-production-workbench.md).

## Contract and ownership

An authored asymmetric bend fixture survives standard Blender→GLB→three.js before translation to crowd baking.

API seam: packages/soldier-assets authoring sources and reproducible Blender export script; standard GLTFLoader + SkinnedMesh is a test oracle only.

Names of new functions/routes in this plan are proposed, not existing commands. Use the [shared acceptance contract](../README.md#acceptance-contract) and [architecture](../architecture.md) for inherited requirements.

## Runnable artifact

Author elbow/knee bend, off-center shield grip, UV checker and forward marker; also a minimal horse/rider composite with one exported deform skeleton. Bake control rigs into deform-bone tracks. Include gait plus a rider-upper-body action mask in the mounted fixture; prove simultaneous motion in the standard-loader oracle before06 ports composition. Save .blend, GLB and expected pose evidence.

Expose the fixture through a clearly labeled standard-loader export oracle and a named scene/probe in the existing renderer lab. This isolated test is the explicit exception to production-path review: slice03 ports and compares the same fixture through the production workbench, and slice04 proves its materials. Do not build a second product renderer or claim production asset acceptance here. Record the exact runnable command in this file when it exists; do not mark completion with screenshots alone.

## Focused verdict

Variable: **Export geometry and transforms**.

Crop/mask: Neutral material silhouette/joint landmarks, rest and deep bend, front/side; material styling and realistic anatomy excluded.

Freeze all previously accepted variables. Capture the candidate and prior/reference with the same fixture manifest. Where a family has execution rows, record each row separately; do not change several rows before the first earns a verdict. Reuse is allowed only after that row's verification passes.

## Verification

Compare Blender geometry landmarks to standard loader; test units/facing, parent transforms, inverse binds, 4 weights, equipment attachment and horse/rider placement. Reject unsupported glTF constructs with actionable errors.

1. Run the applicable deterministic contract tests and `snapCheck` captures; preserve unrelated tests and simulation outcomes.
2. Use **compare-screenshots** for candidate versus prior/reference on the named mask; retain telemetry and a written less-wrong verdict. A Rome II photograph is a visual target, not a pixel-equality baseline.
3. As the **last visual check before acceptance**, use **screenshot-critique** with an unprimed agent. Resolve verified defects in scope; record excluded defects against their owning slice. Do not describe a shot as verified before this check.
4. Archive feature evidence and comparison/critique notes under `assets/evidence/02/`; active regression baselines remain in their harness-owned location.

For a purely numerical probe, archive its output as well as the review surface; do not invent a visual-quality verdict from numerical success.

## Decision budget and feedback

Delegated: Control rig construction; joint count only where fixture deformation justifies it. Runtime asset uses a single composite deform skeleton; no physics constraints exported.

All other architectural, scope and quality changes are spec gaps: update/reslice the plan before widening the patch. Human feedback on the focused variable can reopen this slice; feedback on a frozen variable belongs to its owner.

When presenting shots, use **preview-shots**, offer approximately five minutes for feedback without a long blocking tool wait, then decide from evidence if the user is silent. Record the decision and rationale, close the opened Preview shots, and continue. Silence is not explicit endorsement, and failing technical/visual gates cannot be waived by silence.

## Completion record

- [ ] Contract and runnable artifact implemented.
- [ ] Execution rows, if any, each have evidence and verdict.
- [ ] Tests and inherited gates pass; changed-test behavior ledger recorded.
- [ ] Comparison and final unprimed critique recorded.
- [ ] Review/cleanup completed; README pickup and decisions updated.

Record actual commands, evidence links, measured results, decisions and unresolved defects here during implementation. No implementation or visual acceptance has occurred yet.
