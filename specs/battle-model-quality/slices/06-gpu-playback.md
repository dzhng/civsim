# 06 — GPU interpolation and clip blending

Status: IN PROGRESS — analytic bounds integrated; local encoding prepared and GPU palette feasibility under verification. Depends on [05](./05-action-timeline.md), [04](./04-explicit-materials.md).

## Contract and ownership

CPU timeline outputs mean the same pose on GPU, including clip ends and transitions.

API seam: photoreal crowd instance payload and VAT sampler share crowd-runtime playback data; interpolate adjacent samples, crossfade clips and compose one rider-upper-body override over mounted locomotion. Blend local joint transforms before hierarchy evaluation; horse, rider pelvis and legs retain gait. Death overrides the whole composite. This bounded pose-composition seam is not a general animation graph.

Prerequisite in05: promote the existing bake pose math into a shared CPU local-pose evaluator in `soldier-assets`, sampling the already loaded `ImportedRig` tracks with their STEP/LINEAR and shortest-arc quaternion semantics. This does not change the GPU animation encoding. The controller uses that evaluator to capture exact interrupted poses before05 acceptance;06 must transport those results, not repair approximate endpoint substitution.

Bounds prerequisite: the shared producer now derives a hierarchy-envelope sphere over continuous local translations/scales, quaternion rotations and arbitrary joint-mask combinations, rather than treating integer samples as extrema. [Numerical proof and all23 radius measurements](../assets/evidence/06/analytic-bounds.md) distinguish the real-motion envelope from the outward Float32 allowance for today's CPU mat4 and GPU weighted-column skin arithmetic. **06b must revalidate or update that allowance for its actual local-TRS/palette arithmetic before acceptance**; it is not certification of an unimplemented GPU sampler. Preserve authored root translations (including fall and mount bob); world translation/yaw remain the renderer's culling transform. The larger spheres do not accept07 performance or15/28 readability. Review cameras must use source landmarks, not a conservative culling sphere's center.

### Bounded interruption contract

The timeline owns a source that is either a clip sample or one frozen local-TRS pose, with a destination clip sample and blend weight. It may also own one rider-upper-body lane with the same source choices; that lane's destination is either a clip sample or the **evaluated current base pose**. Reuse the shared local-pose type rather than declaring renderer-specific snapshots. These are proposed semantics, not a second declaration of the eventual05 types.

Capture the old evaluated state at the event time before changing tracks. A base interruption freezes the base locals; an overlay interruption freezes the displayed masked locals while the unmasked base keeps advancing. Overlay exit blends toward the advancing, fully evaluated base, including any base crossfade. Full-body hit/death freezes the complete composed pose, clears the overlay and transitions the whole skeleton. At the new weight0 the displayed pose must agree with the old pose within measured floating-point error. Matching angular velocity is not promised.

Keep at most one frozen source per active lane, recycle it after use, and never accumulate nested blend histories. Reset/reload and incompatible appearance changes follow05's explicit identity policy; snapshots cannot silently cross skeletons. GPU packing and slot lifetime belong to the renderer, but cannot mutate controller-owned snapshots still referenced by playback.

### Execution rows

Complete these rows in order; record their actual commands and evidence here as they land. No row is accepted by this planning pass.

| Row | Contract and artifact | Required verdict |
| --- | --- | --- |
| 06a — sampled local data | Canonical GPU local-TRS bake/schema and CPU decoding oracle, using05's shared pose evaluator. Settle representation, sample error, STEP discontinuities and conservative interpolated/composed bounds before GPU transport. | Original-track versus decoded samples at endpoints and fractional times; shortest-arc rotations, bind defaults, STEP boundaries, mounted combinations and long-weapon extrema. A box around integer samples alone is insufficient. |
| 06b — playback transport | Cut over Three and retained raw consumers to resolved local samples, base blend and optional masked override; transport frozen sources and derive joint palettes before weighted skinning. Far's fixed manifest pose uses the shared CPU evaluator; this row does not introduce animated impostors. | CPU/GPU position and normal/tangent agreement, visible/shadow agreement, snapshot slot reuse, allocation failure and atomic reload rollback. Rebuild every internal bundle and remove the old matrix-animation reader in the same coherent cutover; derived skin matrices are not a second animation format. |
| 06c — temporal acceptance | Production workbench fixture and named scene for fractional locomotion, interrupted actions, mounted overlay entry/exit and terminal death. | Repeated interruptions on both sides of blend midpoint preserve the displayed pose; overlay exit converges to the moving base even during its crossfade; full-body death begins continuously and holds its final sample. Deterministic pause/replay and bounded storage remain required. |

06a may prepare producer/CPU changes independently, but do not expose a changed runtime asset format until all06b consumers are ready. Keep04's weighted normal/tangent and fragment normal-map contracts unchanged. Use the authored mounted diagnostic to prove composition; runnable placeholder horses do not establish accepted articulated gait.

The [approved encoding proposal](../assets/evidence/06/local-encoding-proposal.md)
uses authored-time union samples,48-byte local poses and exact CPU interval/STEP
selection. Its prepared implementation is not yet a live asset-format change.
The [palette preparation proposal](../assets/evidence/06/palette-consumer-proposal.md)
owns the coherent consumer cutover plan; [storage lifetime measurements](../assets/evidence/06/compute-buffer-lifetime.md)
show why compute-only attributes need explicit renderer-owned disposal during
replacement. Preserve existing synchronous growth with size/device-limit checks
and coherent bindings, rather than inventing an asynchronous stale-frame policy.
Kernel arithmetic, partial uploads/failures and actual beauty/shadow consumers
remain acceptance gates, not facts established by the proposal.

For the [07 budget experiment](./07-budget-envelope.md), include synchronized interruption bursts, not just steady locomotion: controller snapshot evaluation time, CPU/GPU resident snapshot and palette bytes, upload bytes/time, slot reuse and disposal. Record measured bone/instance counts and packing. Snapshot uploads should follow changed snapshots rather than repeat every live frame; do not treat an illustrative allocation estimate as the accepted budget.

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

The inherited battle gait crop proves on-screen scene motion, not isolated
articulation.06c must hold camera, placement and background fixed and compare the
target's rendered foreground across authored phases. A negative control that
freezes GPU articulation while submitted phases still advance must fail. Extend
the shared production pose fixture rather than building another battle sampler.

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
