# 11 — Campaign roads, ownership and fog

Status: in progress; live ownership/visibility checkpoint verified. Dependencies: [02](02-campaign-composition-proof.md), [03](03-bounded-terrain.md), [08](08-water-boundaries.md), [10](10-environment.md).

## Contract and owner

The production campaignWorld consumes real-map CPU road, territory and visibility inputs. Keep simulation and CPU geographic/layout builders as their current owners.

Slice variable: **Geographic overlay placement and depth in the new world.**

## Work

Road ribbons, sea lanes, borders, faction washes and fog belong to the production Three world. Every draped vertex uses the presented surface; coast clipping shares the new water boundary. Use explicit depth-tested decal/transparent ordering and keep fog/UI meanings intact. Do not convert the entire old raw pass API into wrappers. Implement full-region visibility/culling and re-drape only changed surface regions.

## Acceptance state

| Accepted | Remaining | Evidence |
| --- | --- | --- |
| Live ownership/visibility, geographic inputs, source clipping and changed-domain seating | Complete fog/overview coverage and entity/UI integration | [Lines](../assets/slice-11/lines/README.md) |
| Regional frustum culling and bounded changed-region updates | Current final hardware acceptance; geographic allocations stay separate from terrain residency | [Grouping](../assets/slice-11/grouping/README.md) |
| Road/junction surface width and fog upload compatibility; requested-camera readiness | Final road styling, endpoint/crossing and coast/depth verdicts across the required matrix | [Road width](../assets/slice-11/road-surface-width/README.md) |

Use the existing production geographic and campaign scenes. The shared full-map,
fog/political, camera and hardware matrix belongs to [15](15-acceptance.md); do
not create a second overlay scene merely to repeat the same world and assertions.

## Verification and review

Run campaign-map-alignment, campaign-polish-roads, campaign-collision, campaign-lod and campaign-frame against the new composition entry point. Prove road endpoints, no unbridged water gaps, border clipping, fog coverage and depth ordering after tile swaps. Expected renderer-label/source assertions become semantic checks with a behavior ledger.

Crop/mask: Full map plus road/city approach, border/coast and fog-edge crops. Final entity models/card migration are deferred to 12; landscape art is fixed.

Apply [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) to the candidate, prior output and reference as applicable. Record telemetry and the less-wrong/both-wrong verdict. Then run an unprimed [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last visual acceptance check**; resolve in-scope findings before accepting. Repeat intentionally updated snapshots with zero pixel differences. The shared [verification contract](../validation.md) governs controls, evidence and non-blocking review windows.

## Delegated decisions and protected behavior

Three.js layer decomposition, retained CPU helpers and buffer packing are delegated. Do not change faction/allegiance color meaning, map connectivity, or the canonical surface.

Everything outside this slice's variable stays fixed; the relevant existing gameplay, water-color, surface and lifecycle tests stay green. Follow the [ownership contracts](../architecture.md). Record new implementation decisions and measured deviations in this slice before ending a pass.

Feedback that would change the slice: A requested ownership/fog design change would alter this slice; current behavior is the migration target.

Human checkpoints are non-blocking. Show the artifact, allow a short response window while doing independent work, then decide from evidence and proceed. Do not ask permission for the already-authorized implementation or spike choices.

## Ownership invariants

Campaign policy supplies political ownership, visibility and connectivity. The
physical world consumes those inputs and seats their vertices on the presented
surface revision; it does not derive a second visibility or road graph. Ownership
updates apply to resident terrain and subsequent admissions alike. Surface changes
re-seat only intersecting line regions; visibility updates must remain compatible
with those partial position updates.

Retain original road centers and lateral offsets for each re-seat so repeated
terrain changes cannot progressively narrow the ribbon. Width is measured on the
local surface, including junction caps. This approximation does not straighten
sharp bends or make roads flat benches. Resource costs and its accepted limits
are recorded in the road evidence above.

The [current overlay checkpoint](../assets/slice-11/overlay-current/README.md)
reconciles four earlier material/shadow baselines with exact repeats and unchanged
ownership/visibility behavior. Final regional road, coast and fog composition
still belongs to the common production matrix.
