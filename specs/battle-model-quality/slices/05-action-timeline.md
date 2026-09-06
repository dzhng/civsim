# 05 — Action observations and timeline

Status: COMPLETE. Depends on [03](./03-weighted-asset-contract.md).

## Contract and ownership

One render-owned controller turns observed battle state into deterministic clip progress without changing combat.

API seam: crowd-runtime action state per soldier: update(observation, tick) → base clip IDs/phases/blend and optional mounted rider-upper-body action samples/mask. battleCrowd adapts actual movement/alive/weapon/firing/injury observations. Current embedded equipment switches through canonical appearance IDs;14 owns real attachment transitions when separate authored gear exists. No unused attachment-state container is introduced here. This is bounded composition, not arbitrary animation layering.

Names of new functions/routes in this plan are proposed, not existing commands. Use the [shared acceptance contract](../README.md#acceptance-contract) and [architecture](../architecture.md) for inherited requirements.

### Execution rows

| Row                                  | Seam and focused proof                                                                                                                                                                                                                                                              |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 05a — Injury observations — COMPLETE | Existing soldier/mount health is exposed through read-only WASM pointers and the production battle-view owner. [Merged verification](../assets/evidence/05/injury-merged-verification.md) pins values and view refresh without changing combat.                                     |
| 05b — Applicability and timeline — COMPLETE | Canonical role/state matrix, shared local-transform sampler and independently reviewed deterministic histories with exact bounded interruption poses, resets, count growth and terminal death. |
| 05c — Production replay — COMPLETE | Actual battle observations feed the controller; synthetic workbench sequences exercise the same controller and submission owner. Reset/pause/events, reloads, real battle cadence and the unchanged standing hardware gate pass. |

The bounded [battle adapter implementation evidence](../assets/evidence/05/battle-adapter.md)
records the caller cutover and numerical checks. [Merged validation](../assets/evidence/05/merged-validation.md)
records workbench/cache, replay, deterministic gait and hardware results. The
[replay review](../assets/evidence/05/workbench-replay/review.md) scopes UI acceptance
separately from the unaccepted placeholder art and future GPU blending.

`hit_ttl` is contact/facing memory, not an injury event: melee sets it before
evade/block, missiles can set it before dodge, and its decay depends on facing
logic. Do not expose it as a successful-hit signal. A decrease in existing health
or mount health is a genuine observed injury, although batched observations can
combine several injuries and supply no exact strike/contact timestamp. 05a adds no
new simulation counter, copy of health, or gameplay authority. The controller must
not invent events that were not observed.

Firing TTL starts after projectile emission; fighting means engagement effort,
not a successful strike. Existing soldier indices stay stable through death and
append during reinforcement. Count growth must preserve earlier histories; a
new battle or explicit same-count identity reset clears them. The complete
availability table and per-appearance applicability matrix belong to05b before
controller acceptance.

### Interrupted-pose prerequisite

A source/destination clip pair cannot describe the exact pose produced by an
interrupted crossfade. Choosing one endpoint causes a snap; keeping nested blend
expressions grows without bound. Before accepting the timeline, freeze the actual
evaluated local transforms at interruption into one source snapshot per active
lane. The shared soldier-assets CPU sampler owns pose math; the controller owns
snapshot lifetime. A full-body interruption freezes the composed mounted pose and
clears the rider override. An upper-body exit converges to the currently evaluated
base blend, not just its destination clip. Position/orientation continuity is the
contract; matching angular velocity is not a new requirement.

This promotes the already-used source sampler before06's GPU/data cutover, rather
than accepting an approximation for the renderer to repair later. Preserve source
STEP semantics and existing matrix-bake bytes during this promotion. Snapshot
storage stays bounded and releases after transition completion.06 proves GPU
equivalence;07 measures synchronized interruption bursts, snapshot allocation and
upload cost alongside ordinary playback. No general animation graph is introduced.

## Runnable artifact

Workbench timeline replay with fresh action entry, repeated action, interruption, terminal death, paused tick and reset. Show an event availability table and a catalog-derived role/state-to-clip matrix before accepting clips. Account for every current appearance, identify shared versus role-specific clips, and explicitly mark non-applicable actions; do not satisfy coverage with no-op clips.

Run `VERIFY_GPU=1 VERIFY_URL=http://localhost:5174 node web/scene.mjs battle-model-action-replay`
against the development server. The linked replay review provides the interactive
route. The ordinary workbench remains unchanged without its replay query.

## Focused verdict

Variable: **Action timing**.

Crop/mask: Timeline and pose-state overlay only; existing fixture motion frozen.

Freeze all previously accepted variables. Capture the candidate and prior/reference with the same fixture manifest. Where a family has execution rows, record each row separately; do not change several rows before the first earns a verdict. Reuse is allowed only after that row's verification passes.

## Verification

Pin animationState tests for time-zero entry, nonloop clamp/hold, reset/ID reuse/count growth, backwards time, hysteresis and event ordering. Inspect actual hit_ttl and loosing_ttl semantics; expose minimal read-only presentation state through WASM only if needed. No fabricated damage events.

1. Run the applicable deterministic contract tests and `snapCheck` captures; preserve unrelated tests and simulation outcomes.
2. Use **compare-screenshots** for candidate versus prior/reference on the named mask; retain telemetry and a written less-wrong verdict. A Rome II photograph is a visual target, not a pixel-equality baseline.
3. As the **last visual check before acceptance**, use **screenshot-critique** with an unprimed agent. Resolve verified defects in scope; record excluded defects against their owning slice. Do not describe a shot as verified before this check.
4. Archive feature evidence and comparison/critique notes under `assets/evidence/05/`; active regression baselines remain in their harness-owned location.

For a purely numerical probe, archive its output as well as the review surface; do not invent a visual-quality verdict from numerical success.

## Decision budget and feedback

Delegated: Blend durations and priority between non-death actions may be tuned with recorded tests. Death is terminal until reset; attack visuals cannot claim paired contact. A firing observation starts a release-compatible clip phase, never delays projectiles to accommodate a windup.

All other architectural, scope and quality changes are spec gaps: update/reslice the plan before widening the patch. Human feedback on the focused variable can reopen this slice; feedback on a frozen variable belongs to its owner.

When presenting shots, use **preview-shots**, offer approximately five minutes for feedback without a long blocking tool wait, then decide from evidence if the user is silent. Record the decision and rationale, close the opened Preview shots, and continue. Silence is not explicit endorsement, and failing technical/visual gates cannot be waived by silence.

## Completion record

- [x] Contract and runnable artifact implemented.
- [x] Execution rows, if any, each have evidence and verdict.
- [x] Tests and inherited gates pass; changed-test behavior ledger recorded.
- [x] Comparison and final unprimed critique recorded.
- [x] Review/cleanup completed; README pickup and decisions updated.

05a landed in `f36211df`; its [observation limits and changed-test ledger](../assets/evidence/05/injury-observations.md) remain the controller's input contract. The merged WASM was rebuilt and independently verified. Continue the infrastructure trunk through07 before detailed anatomy08.

05b's [source applicability report](../assets/evidence/05/catalog-presentation.md)
records canonical descriptors, clip-owned release markers, explicit manual-only
candidates and the generated review matrix. Geometry, material bytes and all eight
old clips remain unchanged; three distinct diagnostic release motions exercise
selection without claiming final motion quality. The controller's interruption
source uses the local-pose prerequisite above rather than selecting a previous
blend endpoint.

The [shared local-pose sampler](../assets/evidence/05/local-pose.md) is now integrated,
with all generated assets byte-identical. The [controller evidence](../assets/evidence/05/action-timeline.md)
records deterministic timing and exact bounded interruptions. Controller source
passed independent review and22 focused tests. The production adapter is now
integrated; merged replay, gait, strict screenshots and hardware checks pass as
recorded above. The non-blocking Preview checkpoint ran08:32:19–08:37:31UTC on
2026-09-06 without user feedback. Proceed on the recorded evidence, not assumed
user approval; Preview was closed. No finished-art or GPU continuity claim follows.
