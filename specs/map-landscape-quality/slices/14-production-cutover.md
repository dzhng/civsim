# 14 — Production cutover and owner retirement

Status: pending. Dependencies: [11](11-campaign-geographic-layers.md), [12](12-campaign-entities-labels.md), [13](13-battle-adoption.md).

## Contract and owner

Switch web/src/campaign/renderer.ts to the completed campaignWorld, preserving the application-facing semantics. Retire superseded owners following architecture.md, including lab-only copies.

Slice variable: **Complete production behavior on the new rendering owner.**

## Work

Connect the complete renderer to campaign scene input, graphics settings and lifecycle. Make the landscape preview a thin production-world fixture. Delete raw campaign material/world passes after their final callers migrate, remove campaign mountain-prop placement, and retire the old relief/lighting route. Preserve CPU map data, road geometry, territory calculation and label layout if still useful. Audit other raw renderer consumers before deleting shared infrastructure. Do not retain a runtime backend flag, compatibility wrapper, second terrain store or fallback canvas. Existing save and battle setup formats stay unchanged.

## Runnable checkpoint

The normal campaign entry point now supports pan/zoom, movement, selection, fog/political views, save/load, encounters and return from battle on the shared world.

New routes/scenes named here are planned deliverables. Use the existing scene runner and snapshot primitive; do not claim they already exist.

## Verification and review

Run the full campaign renderer suite, save/load, conquest/reinforcements, handoff and renderer-lifecycle. Audit imports for duplicate surface/material owners and for neutral shared code importing campaign GPU types. Ledger every retired assertion/baseline and the behavior replacing it. Re-run the small composition oracle after the production switch.

Crop/mask: Full production frames and the existing alignment/label/selection crops. This is an integration slice; failed art sends work back to its owner rather than broadening cutover.

Apply [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) to the candidate, prior output and reference as applicable. Record telemetry and the less-wrong/both-wrong verdict. Then run an unprimed [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last visual acceptance check**; resolve in-scope findings before accepting. Repeat intentionally updated snapshots with zero pixel differences. The shared [verification contract](../validation.md) governs controls, evidence and non-blocking review windows.

## Delegated decisions and protected behavior

Deletion grouping and adapter internal structure are delegated. One active production backend, unchanged save/command semantics and the no-compatibility end state are fixed.

Everything outside this slice's variable stays fixed; the relevant existing gameplay, water-color, surface and lifecycle tests stay green. Follow the [ownership contracts](../architecture.md). Record new implementation decisions and measured deviations in this slice before ending a pass.

Feedback that would change the slice: The user has authorized cutover work. Only a newly requested compatibility requirement would change retirement strategy.

Human checkpoints are non-blocking. Show the artifact, allow a short response window while doing independent work, then decide from evidence and proceed. Do not ask permission for the already-authorized implementation or spike choices.
