# 11 — First-pair locomotion

Status: IN PROGRESS, working candidate only. Acceptance depends on [10](./10-pair-surfaces.md).
Candidate clips may be authored on usable provisional rig and equipment contacts;
surface acceptance is not an authoring dependency. Freeze the rig/kit revision
for each comparison and repeat affected checks after refits.

## Contract and ownership

Idle/ready, walk/march and run communicate supported weight and equipment load.

The engine owns posture and movement. At-ease standing carries the shield at
the side; threatened standing raises it forward. Ordinary forward walk/run uses
side carry. Threat-facing backward or lateral travel must retain protection,
including when the player ordered running but the engine actually drifts at
walking pace. Preserve signed measured displacement relative to the displayed
soldier facing; scalar speed and the ordered pace alone cannot select these
poses faithfully. The existing movement rules in `crates/sim/src/movement.rs`
are the authority, not new animation-driven gameplay states.

Verify those distinctions in the observation adapter before wiring the authored
poses. A signed-motion observation alone is not a finished protected-travel
animation: the clip/binding, actual-speed rhythm, interruption blends and live
battle presentation still need their own evidence. Do not reverse simulation
movement or facing to make an authored cycle fit.

API seam: Authored clips on shared human rig → clip registry and timeline; stride phase follows measured motion, visual root displacement removed to preserve sim positions.

Names of new functions/routes in this plan are proposed, not existing commands. Use the [shared acceptance contract](../README.md#acceptance-contract) and [architecture](../architecture.md) for inherited requirements.

## Runnable artifact

Individual looping clips and movement-speed ramp with heavy sword and phalanx carry/rest equipment.

Expose the fixture through the production model workbench and a named scene/probe. Record the exact runnable command in this file when it exists; do not mark completion with screenshots alone.

## Focused verdict

Variable: **Locomotion rhythm**.

Crop/mask: Feet/hips/shoulder frame strips plus whole-body loop; combat and material changes excluded.

Freeze all previously accepted variables. Capture the candidate and prior/reference with the same fixture manifest. Where a family has execution rows, record each row separately; do not change several rows before the first earns a verdict. Reuse is allowed only after that row's verification passes.

## Verification

Check planted foot intervals, no persistent sliding, plausible stride at actual game speed, planted idle, two-hand carry grip. Use deterministic snapCheck frame strips; derive GIFs from accepted frames.

1. Run the applicable deterministic contract tests and `snapCheck` captures; preserve unrelated tests and simulation outcomes.
2. Use **compare-screenshots** for candidate versus prior/reference on the named mask; retain telemetry and a written less-wrong verdict. A Rome II photograph is a visual target, not a pixel-equality baseline.
3. As the **last visual check before acceptance**, use **screenshot-critique** with an unprimed agent. Resolve verified defects in scope; record excluded defects against their owning slice. Do not describe a shot as verified before this check.
4. Archive feature evidence and comparison/critique notes under `assets/evidence/11/`; active regression baselines remain in their harness-owned location.

For a purely numerical probe, archive its output as well as the review surface; do not invent a visual-quality verdict from numerical success.

## Decision budget and feedback

Delegated: Stride amplitude/cadence and upper-body secondary motion within observed speed; no foot IK subsystem.

All other architectural, scope and quality changes are spec gaps: update/reslice the plan before widening the patch. Human feedback on the focused variable can reopen this slice; feedback on a frozen variable belongs to its owner.

When presenting shots, use **preview-shots**, offer approximately five minutes for feedback without a long blocking tool wait, then decide from evidence if the user is silent. Record the decision and rationale, close the opened Preview shots, and continue. Silence is not explicit endorsement, and failing technical/visual gates cannot be waived by silence.

## Completion record

- [ ] Contract and runnable artifact implemented.
- [ ] Execution rows, if any, each have evidence and verdict.
- [ ] Tests and inherited gates pass; changed-test behavior ledger recorded.
- [ ] Comparison and final unprimed critique recorded.
- [ ] Review/cleanup completed; README pickup and decisions updated.

The [equipped-heavy locomotion candidate](../assets/evidence/11/heavy-run/review.md)
contains ready, walk and run on the provisional rig. Its production frame sheets
and offline grounding telemetry permit continued authoring, not slice acceptance.
The earlier walk study used an incorrect class-speed assumption; the linked
review owns the corrected pace and evidence boundaries. Refit and recapture
after concurrent body/equipment changes.

The combined heavy now has deterministic two-cycle world-travel frames and
full-speed GIF derivatives, including its latest garment revision. Next judge
full-loop rhythm and ground-relative contact; the completed sampled garment
review does not establish those. Upper-body stiffness, joint shape,
support contact, speed ramps, phalanx motion and transitions remain open. Ready
is a static planted stance, not an accepted animated idle.

The [prescribed world-travel smoke](../assets/evidence/11/heavy-travel/review.md)
exposed the combined candidate facing opposite production travel. The
[whole-export correction and consecutive sequence](../assets/evidence/11/heavy-travel/forward-export-probe.md)
now supply deterministic moving-world evidence. The rejected smoke accepts no
motion; neither does the corrected sequence alone. Review the full-speed loop,
torso stiffness, recovery and ground contact before accepting locomotion.
Do not reverse fixture travel or add a candidate-only renderer correction to
make the evidence look right.

The [support/recovery revision](../assets/evidence/11/heavy-contact-recovery/review.md)
now accounts for the actual angled rest chain and lifts the recovering run leg.
The complete integrated heavy-kit scene repeats exactly, and its travel frames
match the independently reviewed candidate byte-for-byte. This is a retained
intermediate improvement, not completed locomotion: upper-body rhythm, small
between-key floor penetration, speed ramps, animated idle and phalanx motion
remain open. The linked record owns the runnable command and raw evidence.

The [sword-carriage revision](../assets/evidence/11/run-sword-carriage/review.md)
retains a more compact, readable weapon pose during the existing run. The shield
arm and lower-body motion are unchanged; the full integrated scene again repeats
all150 images exactly. Its focused verdict does not resolve equipment weight,
torso rhythm, angular joints or the other open locomotion requirements.
