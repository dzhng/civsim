# 13 — First-pair hit and death

Status: provisional heavy hit integrated; heavy fall revision open, no acceptance. Depends on [12](./12-pair-combat.md).

Final acceptance follows12. Provisional reaction authoring can use its current
usable saved rig/kit without waiting for locomotion's complete live binding,
which itself requires real hit/death clips. Preserve all existing combat and
travel actions in each isolated pass; no incomplete appearance is promoted or
filled with mislabelled stand-in clips to evade admission.

## Contract and ownership

Observed reactions play once and death settles then holds.

API seam: Hit/death authored clips through action timeline; attachment behavior remains deterministic.

Names of new functions/routes in this plan are proposed, not existing commands. Use the [shared acceptance contract](../README.md#acceptance-contract) and [architecture](../architecture.md) for inherited requirements.

## Runnable artifact

Hit interruption and lethal/nonlethal replays at several observation times; hold corpse for five seconds.

Expose the fixture through the production model workbench and a named scene/probe. Record the exact runnable command in this file when it exists; do not mark completion with screenshots alone.

## Focused verdict

Variable: **Reaction and settling motion**.

Crop/mask: Whole body/ground contact sequence; locomotion and combat clips frozen.

Freeze all previously accepted variables. Capture the candidate and prior/reference with the same fixture manifest. Where a family has execution rows, record each row separately; do not change several rows before the first earns a verdict. Reuse is allowed only after that row's verification passes.

## Verification

Hit tied to validated observation; no hit loop for generic fighting. Death never wraps or resurrects; no hovering body, ground penetration beyond documented tolerance, or animated bounds disappearance.

1. Run the applicable deterministic contract tests and `snapCheck` captures; preserve unrelated tests and simulation outcomes.
2. Use **compare-screenshots** for candidate versus prior/reference on the named mask; retain telemetry and a written less-wrong verdict. A Rome II photograph is a visual target, not a pixel-equality baseline.
3. As the **last visual check before acceptance**, use **screenshot-critique** with an unprimed agent. Resolve verified defects in scope; record excluded defects against their owning slice. Do not describe a shot as verified before this check.
4. Archive feature evidence and comparison/critique notes under `assets/evidence/13/`; active regression baselines remain in their harness-owned location.

For a purely numerical probe, archive its output as well as the review surface; do not invent a visual-quality verdict from numerical success.

## Decision budget and feedback

Delegated: Authored collapse and small equipment settling, without ragdoll/physics or new outcome rules.

All other architectural, scope and quality changes are spec gaps: update/reslice the plan before widening the patch. Human feedback on the focused variable can reopen this slice; feedback on a frozen variable belongs to its owner.

When presenting shots, use **preview-shots**, offer approximately five minutes for feedback without a long blocking tool wait, then decide from evidence if the user is silent. Record the decision and rationale, close the opened Preview shots, and continue. Silence is not explicit endorsement, and failing technical/visual gates cannot be waived by silence.

## Completion record

- [ ] Contract and runnable artifact implemented.
- [ ] Execution rows, if any, each have evidence and verdict.
- [ ] Tests and inherited gates pass; changed-test behavior ledger recorded.
- [ ] Comparison and final unprimed critique recorded.
- [ ] Review/cleanup completed; README pickup and decisions updated.

The isolated heavy hit study uses the fitted kit without altering its existing
actions. The revised candidate adds connected knee, pelvis and torso compression;
full-motion review must distinguish an involuntary reaction from a voluntary
crouch. It is not a new stun state or an impact-direction claim. The engine's
observed health loss remains authoritative, and detailed live binding is still
unbuilt. Death authoring and this slice's acceptance remain open.

The [rejected fall](../assets/evidence/13/rejected-death-g/review.md) owns the
unsupported finish and clearance findings. Revise whole-body support on the
current fitted source without changing existing actions. The integrated
[corpse-pose correction](../assets/evidence/13/corpse-pose/review.md) makes
authored poses own body geometry in both renderers and visibility bounds,
while corpse shading remains independent. This is a renderer contract correction,
not acceptance of the rejected fall or the placeholder corpses. Do not compensate
for unclear grounding by lifting or contorting the source asset.
