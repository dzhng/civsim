# 02 — One-world campaign composition proof

Status: pending. Dependencies: [01](01-surface-contract.md).

## Contract and owner

Begin the proposed photoreal campaignWorld as the final composition owner, using existing PhotorealWorld and cameraBridge. Add only the smallest real campaign data fixture needed to prove its boundaries.

Slice variable: **Depth and interaction integration, not final art.**

## Work

Render one raised terrain patch, a draped road, a territory wash, fog edge, one city and army representation, a standard, selection, and a label/card. Reuse CPU draw/layout inputs where they already exist. All GPU world objects use the same depth buffer and camera; DOM cards use its projected anchors. Reorder submissions deliberately to prove real occlusion. Do not bridge raw campaign passes with a second canvas or private shared-texture protocol. Keep production selection unchanged until cutover; this lab composition grows into production rather than being discarded.

## Runnable checkpoint

Planned /renderer/campaign-composition route and campaign-composition scene. The fixture is clickable at DPR1 and DPR2, with the camera off-center and tilted.

New routes/scenes named here are planned deliverables. Use the existing scene runner and snapshot primitive; do not claim they already exist.

## Verification and review

Click the visually rendered elevated target through actual pointer input, not a debug select shortcut. Assert fog hides the entity and associated label; a front ridge occludes a rear road/army even when submission order is hostile. Prove standard and selection grounding, then resize and dispose/recreate the world. Run renderer-lifecycle and the surface tests.

Crop/mask: Full composition, city/road/selection intersection and fog edge crops. Placeholder city geometry is permitted; landscape palette, forest density, and polished text atlas art are out of scope.

Apply [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) to the candidate, prior output and reference as applicable. Record telemetry and the less-wrong/both-wrong verdict. Then run an unprimed [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last visual acceptance check**; resolve in-scope findings before accepting. Repeat intentionally updated snapshots with zero pixel differences. The shared [verification contract](../validation.md) governs controls, evidence and non-blocking review windows.

## Delegated decisions and protected behavior

Small fixture geometry and internal layer classes are delegated. The single world/depth/camera contract and actual pointer oracle are fixed.

Everything outside this slice's variable stays fixed; the relevant existing gameplay, water-color, surface and lifecycle tests stay green. Follow the [ownership contracts](../architecture.md). Record new implementation decisions and measured deviations in this slice before ending a pass.

Feedback that would change the slice: A new UI design would change the label/card work. Existing campaign UI and faction/allegiance meanings are the acceptance target.

Human checkpoints are non-blocking. Show the artifact, allow a short response window while doing independent work, then decide from evidence and proceed. Do not ask permission for the already-authorized implementation or spike choices.
