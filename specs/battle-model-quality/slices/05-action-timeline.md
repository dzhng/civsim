# 05 — Action observations and timeline

Status: TODO. Depends on [03](./03-weighted-asset-contract.md).

## Contract and ownership

One render-owned controller turns observed battle state into deterministic clip progress without changing combat.

API seam: crowd-runtime action state per soldier: update(observation, dt/tick) → base clip IDs/phases/blend, optional mounted rider-upper-body action samples/mask, and attachment state. battleCrowd adapts actual movement/alive/weapon/firing/hit observations. This is the bounded composition contract in architecture.md, not arbitrary animation layering.

Names of new functions/routes in this plan are proposed, not existing commands. Use the [shared acceptance contract](../README.md#acceptance-contract) and [architecture](../architecture.md) for inherited requirements.

## Runnable artifact

Workbench timeline replay with fresh action entry, repeated action, interruption, terminal death, paused tick and reset. Show an event availability table and a catalog-derived role/state-to-clip matrix before accepting clips. Account for every current appearance, identify shared versus role-specific clips, and explicitly mark non-applicable actions; do not satisfy coverage with no-op clips.

Expose the fixture through the production model workbench and a named scene/probe. Record the exact runnable command in this file when it exists; do not mark completion with screenshots alone.

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

- [ ] Contract and runnable artifact implemented.
- [ ] Execution rows, if any, each have evidence and verdict.
- [ ] Tests and inherited gates pass; changed-test behavior ledger recorded.
- [ ] Comparison and final unprimed critique recorded.
- [ ] Review/cleanup completed; README pickup and decisions updated.

Record actual commands, evidence links, measured results, decisions and unresolved defects here during implementation. No implementation or visual acceptance has occurred yet.
