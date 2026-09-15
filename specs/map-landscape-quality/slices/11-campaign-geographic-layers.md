# 11 — Campaign roads, ownership and fog

Status: in progress; live ownership/visibility checkpoint verified. Dependencies: [02](02-campaign-composition-proof.md), [03](03-bounded-terrain.md), [08](08-water-boundaries.md), [10](10-environment.md).

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

## Dynamic geography checkpoint

The first vertical pass gives the physical world replaceable political ownership
and visibility. Ownership uses the existing north-first RGBA raster contract,
nearest faction boundaries and political wash strength; its material graph stays
shared across tile admissions. Visibility updates both resident terrain/roads and
entity/scenery membership, and subsequently admitted terrain samples the current
query. Queries remain campaign policy, not a second world visibility algorithm.

This checkpoint supplies dynamic ownership and visibility. The later line and
regional grouping checkpoints below supply live geometry and bounded updates. The old
composition fixture's constant tint is retained until its consumers move to live
ownership at production cutover; it is not the production faction model.

## Next bounded pass: live geographic lines

Reuse the existing [CPU geometry builder](../../../packages/game-renderer/src/campaign/roadGeometry.ts)
and campaign border construction. The world receives their geometry and geographic
identity; it does not recalculate connectivity or ownership. Replace resident line
inputs when campaign state changes, and seat draped vertices on the same presented
revision as terrain. Surface admission only re-drapes intersecting line regions;
visibility changes retain the existing campaign query as policy.

Freeze terrain, water response and entity art. The first artifact must include an
actual road junction, coastal sea lane and ownership boundary, then replace both
geographic inputs and an intersecting terrain tile. Check joins, clipping, depth,
fog and disposal before expanding to full-map culling/performance. Keep this pass
separate from label projection and city-foot grounding in 12.

### Live geographic line checkpoint

[The evidence](../assets/slice-11/lines/README.md) records shared CPU border
ownership, live physical road/sea-lane/border input, changed-domain seating and
disposal. Sparse borders were rejected after regional screenshots exposed holes
through mountains; subdivision restores continuity, and source-mask clipping
trims wet coastal tips. Both regional repeats are pixel-identical, all500 CPU tests and both typechecks
pass, and the final unprimed critique accepts this contact/clipping checkpoint.

Regional grouping below completes the line-culling contract. This contact
checkpoint alone does not establish full11 or production acceptance.

### Regional grouping checkpoint

[Regional evidence](../assets/slice-11/grouping/README.md) proves offscreen frustum
culling and pre-vertex rejection of distant updates with the same geographic
triangles. Explicit crossing order removes dependence on transparent batch centers.
Both regional repeats and prior composition/anchor controls pass exactly; all501
CPU tests/typecheck and final code/visual reviews pass. Hardware warm traversal
measures16.67ms p95 and33.33ms maximum admission frame across11admissions.

Remaining11work: full geographic fog/overview-atmosphere behavior, input/lifecycle
integration with complete entities/UI and final hardware acceptance. Geometry is
still resident globally; its CPU/GPU allocations are reported separately from the
bounded terrain budget. Do not call full11complete from this checkpoint alone.
