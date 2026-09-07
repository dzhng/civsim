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

The timeline now advances walk/run from measured travel and chooses the nearest
authored nominal pace, preserving phase through speed changes and existing
interruption ownership. Its integrated observation now distinguishes motor-capable
travel from disabled transport; protected directional selection remains open. A slowed, threatened
backward step must not run a full-speed cycle merely because the order requested
running. Keep standing
breathing and combat event timing independent of distance-driven gait; neither
should freeze just because the soldier stops translating. Verify speed ramps,
pause/reset, reversals and external displacement explicitly before accepting
runtime locomotion.

Implementation checkpoints, in order:

1. **Integrated:** bind authored stride distance to measured travel and preserve
   interruption ownership. The [distance transport](../assets/evidence/11/measured-distance/review.md)
   passes CPU and full production GPU checks independently on the merged tree.
   Numerical equivalence is proved separately from exact same-input repeatability.
2. Bind the manually reviewed protected backward action through the canonical
   observations. Resolve displayed-root smoothing and externally driven displacement
   explicitly; a frozen centroid film proves neither. Preserve combat event priority
   and leave unsupported lateral motion visibly open, not relabelled backward.
   The [controlled movement observations](../assets/evidence/11/drive-observation/review.md)
   rule out interpreting raw displacement or momentum subtraction as leg drive.
3. Review live starts, stops, reversals and equipment/load response for both first-pair
   units before accepting locomotion. The relaxed medium march is integrated for
   manual review, not a completed runtime binding.

API seam: Authored clips on shared human rig → clip registry and timeline; stride phase follows measured motion, visual root displacement removed to preserve sim positions.

### Integrated observation: movement while motor-capable

[Implementation evidence](../assets/evidence/11/motor-capable-travel/review.md)
records actual native/bulk/production consumer tests and unchanged playback images.
Independent merged CPU, simulation/save and exact-image gates pass; this is not
locomotion-art acceptance.

The engine can skip movement because a body is stunned or bowled, then decrement
that timer to zero before the browser reads it. Final posture cannot classify the
whole interval. Conversely, an enabled body can take a pressure-recovery step;
there is no canonical voluntary-versus-pushed gait state to invent.

Read-only cumulative travel is qualified by the movement branch that
actually ran. Ordinary and routing movement qualify; dead or disabled branches
do not. Count resulting tick-start-to-final displacement, not commanded velocity
or pre-separation drive that a constraint may undo. Preserve cumulative world X/Y
displacement for directional selection and accumulated tick-path length for cadence.
These three values share one per-soldier observation record and the existing bulk
WASM boundary; no force-channel bundle or persistent event log is needed. Use
double-precision accumulation so long battles retain small steps.

The adapter differences readings across its existing observation interval,
projects qualified net displacement against the displayed facing, and uses path
length for speed. This replaces endpoint-position history for gait observations,
not simulation positions. First/new soldier/reset readings establish a zero
baseline; repeated ticks remain exact. Appearance changes retain body measurements
while the timeline independently resets incompatible pose history.

Pin mixed stun-expiry/recovery batches, routing, disabled cavalry momentum,
conscious pressure response, reversals and reset/growth through the actual engine
and adapter. Physics, outcomes, timers and saves must remain unchanged. Enabled
travel includes constrained pressure displacement that may require recovery steps;
it is not proof of voluntary propulsion or planted feet. Net direction can still
cancel within a batch; the scalar path does not reconstruct its sequence.
Likewise, qualified past travel does not choose the pose or prospective gait rate
after a soldier becomes disabled at the interval's end. Verify that distinction
in the subsequent protected/disabled pose-selection pass, not by erasing valid
past travel or broadening the root-placement change.
Keep live root smoothing as the next separate presentation contract—do not add
a trajectory-reconstruction system or quietly claim this observation solves it.

### Rejected candidate: endpoint extrapolation for root and gait

The [bounded implementation](../assets/evidence/11/live-root-phase/review.md)
below passed its numerical contract but failed the
matched live comparison. All256 chronological start/contact panels were reviewed
by root and an independent unprimed critic. Unconditional prediction exaggerated
close-contact corrections, notably frames11–13 and38–40, producing larger
excursions and returns than the existing easing. The critic also preferred the
old start sequence. No production change or baseline is accepted from this pass.
Retain the underlying root/gait and attached-overlay requirements; reslice the
sampling policy before another implementation. Delayed sampling must account for
event history explicitly, not simply ask the latest timeline for an earlier time.

Rejected policy, retained to explain the comparison:

The current crowd advances gait at fractional simulation time while moving its
root only at integer observations through residual-error easing. Thus feet can
cycle over a stationary displayed root, and the root can keep catching up after
the engine stops. Replace that easing in the existing crowd owner after the
motor-capable observation pass lands.

Use the latest authoritative endpoint plus the existing clock fraction times
the last observed endpoint displacement per tick. Cache endpoint and rate,
separately from rendered output; each observation reanchors prediction rather
than integrating the previous prediction. Body translation uses raw engine
positions, including disabled transport; only gait uses qualified travel.
No new clock, delayed state history, simulation write or trajectory solver.

This explicitly chooses sub-tick extrapolation over delayed interpolation.
An unobserved stop or collision can overshoot until the next observation;
batched rates average the interval and cannot reconstruct reversals. There is
no canonical teleport discriminator: large corrections reanchor normally,
without repurposing the old distance threshold as an invented game state.
New bodies, rewind/reset and dead bodies use authoritative endpoints without
prediction. Explicit freeze samples both root and pose at integer time;
ordinary pause retains the clock fraction, and unfreeze restores that fraction.

Standards and readouts already consume displayed centroids. Route displayed
roots explicitly to soldier selection rings and attack-arc origins as well.
Keep destination grids, order paths, queued waypoints and engine diagnostics
authoritative; never replace the shared world-position accessor globally.

Begin with a production crowd/clock test proving that two fractional draws
during steady straight motion move the submitted root by the unwrapped gait
phase advance times stride. A subsequent stationary observation must stop both.
Replace the old residual-easing assertions deliberately, then cover pause,
freeze/unfreeze, batched observations, append, rewind, death and corrections.
The root/stride equality is a constant enabled-motion contract, not a claim
about disabled transport or mixed-direction intervals. Review actual moving
production frames and attached overlays before accepting the presentation change.

### Integrated: stop future gait while disabled

[Evidence](../assets/evidence/11/final-disabled-gait/review.md) includes a matched
old/candidate production proof and independent merged350 CPU tests plus629
checks/42 exact images. This verifies phase transport, not a realistic stunned pose.

Qualified interval travel can precede a final disabled state. In the existing
timeline track owner, count that completed interval before setting prospective
gait rate to zero. Preserve a compatible existing gait pose while incapacitated;
without a gait history, retain the existing canonical standing selection
(at-ease, held pike or ready). Incapacity alone does not turn at-ease into
battle-ready. Do not add
a stun clip, alter observations or change death/hit/release/melee priority.
Standing and combat remain time-driven. Re-entry after recovery uses ordinary
observations; never bank disabled transport or replay it later.

Start with a calibrated gait receiving positive past travel and final incapacity:
its integer-time phase must include the travel, and later fractional samples must
hold. A second disabled observation containing more qualified past travel must
still advance that interval even when its future rate remains zero. Preserve
exact interruption-source ownership, pause/reset and appearance replacement.
This can proceed beside root placement because it owns timeline sampling, not
body positioning. Directional bindings and their missing-clip policy follow as
a separate pass; no detailed appearance is promoted here.

### Following bounded pass: protected directional selection

Retained facing is not itself a threat decision. The engine's safe Disengage
and automatic-evade branches can produce `atEase && guardedFacing` while moving
backward or sideways. Require the existing not-at-ease decision as well as
guarded facing, alive/enabled movement and not routing before selecting a
protected travel role. Safe movement and canonical standing retain their existing
selection. Do not infer threat from the order or change engine states.

Use nullable backward/left/right gait bindings in the existing presentation
contract, not a second action controller. Dominant signed lateral motion selects
left/right; otherwise negative forward selects backward and positive forward
retains ordinary locomotion. Longitudinal wins exact45-degree ties. This is a
nearest-cardinal asset approximation, not a new engine state. Positive path with
zero net direction is unknown. Missing/unknown protected bindings preserve the
existing selection and remain unsupported; never mirror asymmetric equipment or
force a ready pose to conceal missing coverage.

Begin with an actual targetless Disengage through the adapter and timeline:
a safe case must not choose its distinguishable protected binding, while a
matched threatened case must. Cover held-pike displayed-facing ownership,
automatic evade, routing/incapacity, missing bindings, net cancellation and ties.
Preserve final-disabled hold, combat priorities and exact interruption sources.
Authored stride metadata owns distance playback for each new gait.

Normalized gait-phase transport is provisional across these actions: backward
and left currently lead with different feet. Blend continuity alone does not
prove support-foot continuity. Actual multi-phase direction changes and sector
reversals require live root/foot review before promotion. This pass adds no phase
matcher, IK, new gameplay state or incomplete live appearance.

### Candidate authoring versus live admission

The existing presentation contract requires hit/death as well as standing and
travel. The heavy kit currently remains manual-only; assigning incomplete or
mislabelled clips merely to enter a live battle would weaken that contract.
After the current directional study, provisional12/13 authoring may proceed on
the same saved usable rig while11's live checks remain open. Freeze and preserve
unrelated geometry/actions for each pass. This removes an acceptance-order cycle,
not the final quality gate: complete live bindings wait for genuine applicable
clips, and production promotion still waits for the first-pair checkpoint.

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
support contact, speed ramps, phalanx motion and transitions remain open. The
[combined motion source](../assets/evidence/11/composed-motion/review.md) now
includes reviewed animated idle and ready loops; they remain provisional,
not accepted final locomotion.

The [guarded backward integration](../assets/evidence/11/backward-integration/review.md)
adds the reviewed two-cycle retreat film to the existing heavy scene. Its frozen
engine trace preserves a reproducible authoring comparison, while the source recipe
keeps one fitted geometry owner and all unrelated motion. The action is manual-only;
upper-body stiffness and crowded passing steps remain provisional. Its donor full
gate and independent merged-tree repeat both pass; runtime selection remains open.

The [medium walk integration](../assets/evidence/11/medium-walk-integration/review.md)
retains the reviewed lower upright-pike carry on the saved fitted medium source.
The original static sheets and all added motion/context frames pass independently
on the merged tree. The lower left arm is provisionally less rigid; right-arm
bracing, flat footfall, close pike butt and dense-formation clearance remain open.
No runtime selection or final art acceptance follows from this manual film.

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
