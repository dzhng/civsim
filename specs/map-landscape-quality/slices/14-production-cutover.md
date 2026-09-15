# 14 — Production cutover and owner retirement

Status: adapter adopted; broader journey/lifecycle and hardware acceptance in progress. Dependencies: [11](11-campaign-geographic-layers.md), [12](12-campaign-entities-labels.md), [13](13-battle-adoption.md).

## Contract and owner

Switch web/src/campaign/renderer.ts to the completed campaignWorld, preserving the application-facing semantics. Retire superseded owners following architecture.md, including lab-only copies.

Slice variable: **Complete production behavior on the new rendering owner.**

## Work

Connect the complete renderer to campaign scene input, graphics settings and lifecycle. Make the landscape preview a thin production-world fixture. Delete raw campaign material/world passes after their final callers migrate, remove campaign mountain-prop placement, and retire the old relief/lighting route. Preserve CPU map data, road geometry, territory calculation and label layout if still useful. Audit other raw renderer consumers before deleting shared infrastructure. Do not retain a runtime backend flag, compatibility wrapper, second terrain store or fallback canvas. Existing save and battle setup formats stay unchanged.

## Adapter boundary

Preserve the application-facing draw and camera semantics of
[the campaign renderer](../../../web/src/campaign/renderer.ts). The scene prepares
the camera before placing cards; projection must therefore describe the pose that
the next draw will use. Continue consuming the existing entity frame, scenery,
cart and label policy owners. Move the proven terrain scheduling out of the lab
route into this production composition, then make the route consume it.

Delete each old GPU owner after its last real or lab consumer migrates. Audit raw
model/standard and battle consumers before deleting shared raw infrastructure;
campaign cutover alone does not authorize breaking their active routes. No copied
renderer adapter or permanent backend selector survives the cutover.

## Runnable checkpoint

The normal campaign entry uses the shared world. Controlled pan/zoom, selection, fog/political views and save/load verification pass. Encounter handoff and return from battle remain required acceptance checks; current handoff diagnosis reaches full soldier upload but has not completed presented-frame settlement within the existing guard.

Use the existing scene runner and snapshot primitive to verify the remaining journeys.

## Verification and review

Run the full campaign renderer suite, save/load, conquest/reinforcements, handoff and renderer-lifecycle. Audit imports for duplicate surface/material owners and for neutral shared code importing campaign GPU types. Ledger every retired assertion/baseline and the behavior replacing it. Re-run the small composition oracle after the production switch.

Crop/mask: Full production frames and the existing alignment/label/selection crops. This is an integration slice; failed art sends work back to its owner rather than broadening cutover.

Apply [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) to the candidate, prior output and reference as applicable. Record telemetry and the less-wrong/both-wrong verdict. Then run an unprimed [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last visual acceptance check**; resolve in-scope findings before accepting. Repeat intentionally updated snapshots with zero pixel differences. The shared [verification contract](../validation.md) governs controls, evidence and non-blocking review windows.

## Delegated decisions and protected behavior

Deletion grouping and adapter internal structure are delegated. One active production backend, unchanged save/command semantics and the no-compatibility end state are fixed.

Everything outside this slice's variable stays fixed; the relevant existing gameplay, water-color, surface and lifecycle tests stay green. Follow the [ownership contracts](../architecture.md). Record new implementation decisions and measured deviations in this slice before ending a pass.

Feedback that would change the slice: The user has authorized cutover work. Only a newly requested compatibility requirement would change retirement strategy.

Human checkpoints are non-blocking. Show the artifact, allow a short response window while doing independent work, then decide from evidence and proceed. Do not ask permission for the already-authorized implementation or spike choices.

## Production adapter checkpoint

The normal campaign entry consumes the shared world, with terrain and live entity
preparation before card layout. The traversal route shares its residency owner;
production raw passes and mountain-prop placement are retired where unconsumed.
[Adapter evidence and assertion ledger](../assets/slice-14-production/README.md)
record the functional checkpoint, exact repeats and remaining visual defects.
This does not complete full campaign-suite, lifecycle, geographic atmosphere or
hardware acceptance, and active independent raw lab/model consumers remain.

The shared atmosphere ray must use one normalized direction for its intersection
and integration samples; [aerial-ray evidence](../assets/slice-14-production/aerial-ray/README.md)
records the below-camera rectangle diagnosis and focused regression contract.

[Controlled acceptance evidence](../assets/slice-14-production/remaining-acceptance/README.md)
records the synthetic bitmap class correction and the reference-grounded color
oracle. Fixture/source and UI acceptance remain distinct from material quality;
full-frame repeat evidence is required before those baselines are adopted.

The [shared verification-input ledger](../assets/slice-14-production/remaining-acceptance/verifier-inputs.md)
records the real-map color-oracle transfer and the cart check's migration to
seated physical anchors. Numeric floors remain fixed; browser acceptance and
canonical image updates remain pending the actual label/card fixes.
