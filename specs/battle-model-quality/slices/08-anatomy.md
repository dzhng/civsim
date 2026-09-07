# 08 — Shared human anatomy

Status: IN PROGRESS, candidate only. Candidate authoring depends on completed06; acceptance depends on [07](./07-budget-envelope.md).

Editable Blender anatomy may proceed alongside the open budget measurements.
Keep it in the workbench candidate path, with provisional mesh/rig counts; do not
promote it to the production catalog or mark this slice complete before its
exported topology fits the measured envelope. This separates reversible source
authoring from runtime acceptance without dropping any07 requirement.

Unclothed anatomy remains independently reviewed while09 fits provisional gear.
Armor cannot conceal or satisfy unresolved anatomy defects. Adult silhouette,
joint deformation and credible grip surfaces remain priorities; supplemental
facial refinement does not block independent equipment source work.

## Contract and ownership

A reusable articulated human base has natural adult proportions and believable joints.

API seam: Blender human source mesh and deform rig → existing appearance bundle, initially classes 0 and 14 with equipment hidden.

Names of new functions/routes in this plan are proposed, not existing commands. Use the [shared acceptance contract](../README.md#acceptance-contract) and [architecture](../architecture.md) for inherited requirements.

## Runnable artifact

Front/side/rear/three-quarter neutral and deep-bend contact sheet at close and game pitch.

Original source authoring has begun in
`packages/soldier-assets/bake/blender-human-anatomy.py`, producing an isolated
editable Blender scene described by the [source ownership note](../../../packages/soldier-assets/assets/source/human-anatomy/README.md).
Cross-section anatomy is joined into a watertight sculpt, with a separate
provisional reduced mesh and deform rig. The first bend study requires normalized
weights, at most four influences, and no unweighted vertices. The existing baker
accepts its selected-scene GLB; `bake/human-anatomy.mjs --check` verifies generated
candidate bundles. These are structural checks, not anatomy acceptance.

The manual-only candidate catalog uses shared anatomy for0/14 and identical
inspection tiers. Production catalog is unchanged. The addressable scene runs as
`VERIFY_GPU=1 VERIFY_URL=http://127.0.0.1:5174 node web/scene.mjs human-anatomy`.
Its neutral/deep-bend sheets capture four bearings at close and gameplay pitch.
A supplemental native head-detail sheet uses the same production environment
to judge facial form that the whole-body framing cannot resolve. It does not
replace the gameplay-scale gate or authorize a separate beauty-render path.
[Current review](../assets/evidence/08/anatomy-review.md) records the rejected
shape findings and focused iteration. Provisional counts are not measured
performance limits.

Expose the fixture through the production model workbench and a named scene/probe. Record the exact runnable command in this file when it exists; do not mark completion with screenshots alone.

## Focused verdict

Variable: **Anatomical silhouette**.

Crop/mask: Untextured body mask and joint closeups; no armor, lighting restyle, facial animation or skin microdetail.

Freeze all previously accepted variables. Capture the candidate and prior/reference with the same fixture manifest. Where a family has execution rows, record each row separately; do not change several rows before the first earns a verdict. Reuse is allowed only after that row's verification passes.

## Verification

No box limbs, disconnected joints, pinched elbows/knees or oversized head/hands. Compare reference body proportions where visible, plus prior placeholder; deformation tests and skin export stay green.

1. Run the applicable deterministic contract tests and `snapCheck` captures; preserve unrelated tests and simulation outcomes.
2. Use **compare-screenshots** for candidate versus prior/reference on the named mask; retain telemetry and a written less-wrong verdict. A Rome II photograph is a visual target, not a pixel-equality baseline.
3. As the **last visual check before acceptance**, use **screenshot-critique** with an unprimed agent. Resolve verified defects in scope; record excluded defects against their owning slice. Do not describe a shot as verified before this check.
4. Archive feature evidence and comparison/critique notes under `assets/evidence/08/`; active regression baselines remain in their harness-owned location.

For a purely numerical probe, archive its output as well as the review surface; do not invent a visual-quality verdict from numerical success.

## Decision budget and feedback

Delegated: Topology and sculpting choices; facial form and grip-capable hands included, facial animation and individually articulated finger animation not required.

All other architectural, scope and quality changes are spec gaps: update/reslice the plan before widening the patch. Human feedback on the focused variable can reopen this slice; feedback on a frozen variable belongs to its owner.

When presenting shots, use **preview-shots**, offer approximately five minutes for feedback without a long blocking tool wait, then decide from evidence if the user is silent. Record the decision and rationale, close the opened Preview shots, and continue. Silence is not explicit endorsement, and failing technical/visual gates cannot be waived by silence.

## Completion record

- [ ] Contract and runnable artifact implemented.
- [ ] Execution rows, if any, each have evidence and verdict.
- [ ] Tests and inherited gates pass; changed-test behavior ledger recorded.
- [ ] Comparison and final unprimed critique recorded.
- [ ] Review/cleanup completed; README pickup and decisions updated.

Implementation is in progress; no anatomy acceptance has occurred yet.

The [cylindrical hand-curl candidate](../assets/evidence/08/grip-curl-review.md)
replaces the splayed-digit direction with fingers curled toward a nominal handle
axis and opposing thumb. Fresh review retains the direction, not hand acceptance:
tip shape and palm/finger separation still fail. Native hand inspection now
supplements the original sheets. Inspect sculpt-to-reduced-mesh detail loss next;
do not treat the provisional9k target as permission to erase fingers. Equipment
must be refitted and re-baked with any retained anatomy change before contact is
judged.

The [detail-preservation follow-up](../assets/evidence/08/hand-detail-preservation.md)
isolates sculpt versus reduction loss and retains local hand preservation as a
modest improvement. Its 20,504-triangle inspection export is provisional, not an
admitted budget. Fingers still need direct anatomical form work; more retained
triangles do not make the remaining U-prong shape correct.

The [whole-body mass study](../assets/evidence/08/wholebody-study.md) retains a
modest calf/thigh/forearm refinement after rejecting an enlarged-shoulder trial.
Fresh review still finds unresolved shoulder seams and simplified bent joints.
This is a working-source checkpoint, not anatomy acceptance; equipment must be
refitted to the changed surface before contact and dressed motion are judged.

The [facial-form checkpoint](../assets/evidence/08/facial-form/review.md) retains
local facial refinement as a readable but incomplete improvement. Original body
and hand positions, weights and normals are controlled. Eyes, muzzle, jaw and
ears still need integrated anatomical form; final anatomy and07 remain open.

The [head-volume checkpoint](../assets/evidence/08/head-volumes/review.md) retains
a shorter cranial vault and more connected facial volume after rejecting raised
eye rims and isolated cheek/muzzle relief. Whole-body geometry below the head,
all original weights, rig and inspection motion remain controlled. The final
fresh critique prefers the candidate moderately, but lids, nose, jaw, ears and
the rear neck junction remain unaccepted. Refit the helmet to this source before
judging dressed clearance; its provisional topology does not settle 07.

The [pronation study](../assets/evidence/08/pronation/review.md) retains forearm
roll as marginally less wrong than isolated wrist roll, without adding bones or
changing weights. Original bend and static sheet coverage remain intact; two
supplemental named-clip timelines expose straight and bent pronation. Rigid grip
tracking passes, but wrist pinch, angular elbow deformation and hooklike fingers
remain unaccepted. Nominal handle clearance is still a separate failed contract.

The [local hand reconstruction](../assets/evidence/08/power-grip/review.md) is an
intermediate authoring checkpoint, not natural-hand acceptance. It preserves
the original wrist/body field while testing actual equipment contact. Fresh
review still rejects its slab palm, repeated rounded finger bands, bulbous thumb
and pinched wrist. Continue a coherent hand-form revision; do not close this
slice because contact and topology checks pass.

The [power-grip closure study](../assets/evidence/08/power-grip-closure/review.md)
adds a substantially more enclosing grasp while retaining the untouched body
and rig. It remains intermediate: tubular digits, swollen dorsum and crowded
thumb/palm transitions still fail natural-hand completion.

The [rejected hand-mass study](../assets/evidence/08/rejected-hand-masses/review.md)
records why further loft-mass tweaks were not retained; the settled closure
source remains unchanged.

The [connected-cage rejection](../assets/evidence/08/rejected-connected-hand/review.md)
shows why shared topology alone is insufficient. The next hand pass must fit
the cupped palm and held-equipment grasp frame together; the inherited handle
placement is not an anatomical constraint.
