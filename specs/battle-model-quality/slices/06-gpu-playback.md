# 06 — GPU interpolation and clip blending

Status: TODO. Depends on [05](./05-action-timeline.md), [04](./04-explicit-materials.md).

## Contract and ownership

CPU timeline outputs mean the same pose on GPU, including clip ends and transitions.

API seam: photoreal crowd instance payload and VAT sampler share crowd-runtime playback data; interpolate adjacent samples, crossfade clips and compose one rider-upper-body override over mounted locomotion. Blend local joint transforms before hierarchy evaluation; horse, rider pelvis and legs retain gait. Death overrides the whole composite. This bounded pose-composition seam is not a general animation graph.

Names of new functions/routes in this plan are proposed, not existing commands. Use the [shared acceptance contract](../README.md#acceptance-contract) and [architecture](../architecture.md) for inherited requirements.

## Runnable artifact

Production fixture displays slow walk and run blends, interrupted attack and held death at quarter-frame offsets.

Expose the fixture through the production model workbench and a named scene/probe. Record the exact runnable command in this file when it exists; do not mark completion with screenshots alone.

## Focused verdict

Variable: **Temporal continuity**.

Crop/mask: Same joint crops/frame strip at fixed phases; art and action-selection policy frozen.

Freeze all previously accepted variables. Capture the candidate and prior/reference with the same fixture manifest. Where a family has execution rows, record each row separately; do not change several rows before the first earns a verdict. Reuse is allowed only after that row's verification passes.

## Verification

CPU reference versus GPU fixture samples at start, fractional frames, final frame and transition endpoints, including mounted gait with concurrent rider action; no modulo wrap for nonloops; shadow and visible pose agree. Existing gait tests stay meaningful.

1. Run the applicable deterministic contract tests and `snapCheck` captures; preserve unrelated tests and simulation outcomes.
2. Use **compare-screenshots** for candidate versus prior/reference on the named mask; retain telemetry and a written less-wrong verdict. A Rome II photograph is a visual target, not a pixel-equality baseline.
3. As the **last visual check before acceptance**, use **screenshot-critique** with an unprimed agent. Resolve verified defects in scope; record excluded defects against their owning slice. Do not describe a shot as verified before this check.
4. Archive feature evidence and comparison/critique notes under `assets/evidence/06/`; active regression baselines remain in their harness-owned location.

For a purely numerical probe, archive its output as well as the review surface; do not invent a visual-quality verdict from numerical success.

## Decision budget and feedback

Delegated: Sample rate and matrix/quaternion bake representation selected by error and cost evidence, not inherited 12fps.

All other architectural, scope and quality changes are spec gaps: update/reslice the plan before widening the patch. Human feedback on the focused variable can reopen this slice; feedback on a frozen variable belongs to its owner.

When presenting shots, use **preview-shots**, offer approximately five minutes for feedback without a long blocking tool wait, then decide from evidence if the user is silent. Record the decision and rationale, close the opened Preview shots, and continue. Silence is not explicit endorsement, and failing technical/visual gates cannot be waived by silence.

## Completion record

- [ ] Contract and runnable artifact implemented.
- [ ] Execution rows, if any, each have evidence and verdict.
- [ ] Tests and inherited gates pass; changed-test behavior ledger recorded.
- [ ] Comparison and final unprimed critique recorded.
- [ ] Review/cleanup completed; README pickup and decisions updated.

Record actual commands, evidence links, measured results, decisions and unresolved defects here during implementation. No implementation or visual acceptance has occurred yet.
