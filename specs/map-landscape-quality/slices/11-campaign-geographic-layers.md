# 11 — Campaign roads, ownership and fog

Status: pending. Dependencies: [02](02-campaign-composition-proof.md), [03](03-bounded-terrain.md), [08](08-water-boundaries.md), [10](10-environment.md).

## Contract and owner

Extend the existing composition proof in the proposed campaignWorld with full real-map CPU road, territory and visibility inputs. Keep simulation and CPU geographic/layout builders as their current owners.

Slice variable: **Geographic overlay placement and depth in the new world.**

## Work

Port road ribbons, sea lanes, borders, faction washes, fog and overview atmosphere to the shared three.js world. Every draped vertex uses the presented surface; coast clipping shares the new water boundary. Use explicit depth-tested decal/transparent ordering and keep fog/UI meanings intact. Do not convert the entire old raw pass API into wrappers. Implement full-region visibility/culling and re-drape only changed surface regions. The old production adapter remains active until the complete cutover slice.

## Runnable checkpoint

Extend /renderer/campaign-composition to real regions and live campaign frame input; planned campaign-landscape-overlays scene covers natural/political/fog variants.

New routes/scenes named here are planned deliverables. Use the existing scene runner and snapshot primitive; do not claim they already exist.

## Verification and review

Run campaign-map-alignment, campaign-polish-roads, campaign-collision, campaign-lod and campaign-frame against the new composition entry point. Prove road endpoints, no unbridged water gaps, border clipping, fog coverage and depth ordering after tile swaps. Expected renderer-label/source assertions become semantic checks with a behavior ledger.

Crop/mask: Full map plus road/city approach, border/coast and fog-edge crops. Final entity models/card migration are deferred to 12; landscape art is fixed.

Apply [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) to the candidate, prior output and reference as applicable. Record telemetry and the less-wrong/both-wrong verdict. Then run an unprimed [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last visual acceptance check**; resolve in-scope findings before accepting. Repeat intentionally updated snapshots with zero pixel differences. The shared [verification contract](../validation.md) governs controls, evidence and non-blocking review windows.

## Delegated decisions and protected behavior

Three.js layer decomposition, retained CPU helpers and buffer packing are delegated. Do not change faction/allegiance color meaning, map connectivity, or the canonical surface.

Everything outside this slice's variable stays fixed; the relevant existing gameplay, water-color, surface and lifecycle tests stay green. Follow the [ownership contracts](../architecture.md). Record new implementation decisions and measured deviations in this slice before ending a pass.

Feedback that would change the slice: A requested ownership/fog design change would alter this slice; current behavior is the migration target.

Human checkpoints are non-blocking. Show the artifact, allow a short response window while doing independent work, then decide from evidence and proceed. Do not ask permission for the already-authorized implementation or spike choices.
