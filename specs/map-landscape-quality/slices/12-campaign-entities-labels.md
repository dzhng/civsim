# 12 — Campaign entities, labels and selection

Status: in progress; shared standards checkpoint verified, remaining passes below. Dependencies: [11](11-campaign-geographic-layers.md).

## Contract and owner

Complete campaignWorld with existing city/army/model/standard data, shared physical scenery/crowd layers where compatible, and existing CPU label/card arbitration. The application adapter retains command/UI state.

Slice variable: **Entity grounding, text hierarchy and interactive selection.**

## Work

Seat cities, representative soldiers, army standards, carts and selection on the same presented surface as roads. Port screen text/markers without discarding the established label hierarchy or DOM card behavior. Use the canonical camera for screen anchors and rendered-surface rays for interaction. Keep fog hiding, faction/allegiance treatments, selected entity hierarchy and city labels readable under taller relief. Preserve troop model/animation ownership rather than building a second crowd pipeline. Add disposal and scene-entry/exit paths.

## Remaining passes and decision boundaries

Complete these in order, with a focused artifact at each boundary. They are parts
of this migration, not new frameworks. Landscape art stays frozen throughout.

| Pass | One question and seam | Acceptance artifact |
|---|---|---|
| Entity input and grounding | Can live campaign city, army and cart inputs use existing physical model layers and the presented surface? Keep campaign frame construction in its existing owner; extend the shared crowd size input rather than making a campaign crowd renderer. | Actual city feet at final scale, representative soldiers and cart contact before/after a tile replacement; fog and selected state update without stale instances. Include Perge/Attalea, Cyrene/Apollonia and Scodra. |
| Label projection and layout | Can the existing CPU atlas and collision policy use the same raised anchors as the rendered entities? Give layout access to canonical projection; render its accepted glyph quads in the existing world. | Raised city and army labels at DPR1/DPR2 with DOM card blockers, sea-name fitting and faction hierarchy preserved. Compare the actual accepted ink rectangles with drawn glyphs after resize and tile replacement. |
| Interaction and lifecycle | Do commands still target the visible entities with the complete presentation attached? Keep proximity and command policy in the application; use presented-surface rays for ground coordinates. | Independent clicks on visible raised markers, selection/cards after fog changes, scene exit/re-entry and return from battle. No extra canvas or surviving listeners/resources. |

The source seams are the existing [campaign frame adapter](../../../web/src/campaign/renderer.ts),
[CPU label layout](../../../packages/game-renderer/src/campaign/labelLayout.ts),
[city asset](../../../packages/game-renderer/src/models/campaign/campaignEntityModels.ts),
and [physical crowd layer](../../../packages/photoreal-renderer/src/crowd/crowdLayer.ts).
Inspect their current contracts before changing them. Label data types must not
remain owned by a retired raw GPU pass. Preserve the established text hierarchy,
water fitting and card occupancy; the composition fixture's simple DOM labels are
not their replacement.

Each pass uses the comparison and final unprimed critique below. A failure in
foot contact returns to grounding; a failure in layout returns to projection/layout.
Do not hide either with terrain flattening, a new UI style or a second camera.

## Runnable checkpoint

New composition route now supports full campaign presentation and pointer selection; planned campaign-landscape-interaction scene uses existing test and real-map campaigns.

New routes/scenes named here are planned deliverables. Use the existing scene runner and snapshot primitive; do not claim they already exist.

## Verification and review

Run campaign-visual, campaign-polish-markers, campaign-collision and camera/initialization tests at DPR1/DPR2. Click visible raised markers using independent pixel stimuli. Verify cards/labels and carts after tile replacement, resize, selection and fog toggles. Repeat lifecycle entry/exit; no orphan canvas, listeners or GPU resources.

Crop/mask: City/army standard, label/card crowding, cart-road and selection crops plus full frames. Terrain/forest/water/environment art stays fixed.

Apply [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) to the candidate, prior output and reference as applicable. Record telemetry and the less-wrong/both-wrong verdict. Then run an unprimed [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last visual acceptance check**; resolve in-scope findings before accepting. Repeat intentionally updated snapshots with zero pixel differences. The shared [verification contract](../validation.md) governs controls, evidence and non-blocking review windows.

## Delegated decisions and protected behavior

Atlas batching, layer classes, and vertical seating implementation are delegated. Existing UX semantics and one shared depth/camera/surface are fixed.

Everything outside this slice's variable stays fixed; the relevant existing gameplay, water-color, surface and lifecycle tests stay green. Follow the [ownership contracts](../architecture.md). Record new implementation decisions and measured deviations in this slice before ending a pass.

Feedback that would change the slice: Changes to typography or UI hierarchy require a revised requirement; this slice preserves the established campaign interface.

Human checkpoints are non-blocking. Show the artifact, allow a short response window while doing independent work, then decide from evidence and proceed. Do not ask permission for the already-authorized implementation or spike choices.


## Grounding evidence from the form pass

A correct center anchor does not guarantee a seated city footprint. The actual largest normal city mesh extends 6.092 campaign render kilometres from its anchor; the smaller tier extends 5.109. The closest real city pairs are Perge/Attalea and Cyrene/Apollonia, so oversized flat pads also interact. These are exaggerated presentation units, not real geographic building sizes.

The [401-site measurements](../assets/slice-04/README.md#deferred-local-foundations) preserve the old and retained-relief residuals, wet-foot samples and the rejected flat-foundation experiment. Flat cores eliminated detailed 2 km foot residuals but produced circular shelves/depressions in clay views; the 8 km experiment still left 373/401 nonflat. That implementation was rejected and its code removed. The retained relief still needs footprint grounding here. Keep node XY and water at zero, inspect actual model feet at final scale, and resolve the visible contact problem without punching circular holes through ranges. Use the measured close pairs and diagonal coast at Scodra as regression cases.

## Shared standard instance checkpoint

The standard presentation contract now belongs beside its shared asset, not to
one GPU renderer. Campaign tiers, custom field/trim/emblem colors and explicit
wind values flow through the same physical layer as battle standards. Battle
still supplies its unit identity and selection; zero wind is an explicit value,
not a request for a default. Tiers select mesh buckets while one material owns
lighting and cloth response.

This checkpoint does not complete dynamic city/crowd/label migration, footprint
grounding, or production cutover. The raw standard pass remains only for its
unmigrated consumers and reads the same instance/default owner.

## Live city input and grounding checkpoint

The physical city layer now accepts the existing campaign frame's stable city
identity, ownership, allegiance, selection and label metadata. Shared entity
instances no longer belong to the raw GPU pass. The existing city asset retains
its horizontal footprint and level roofs; walls extend below local terrain so
the presented triangles determine visible contact. The authored contact cue is
seated on those same triangles and remains depth-read. Default city asset arrays
are unchanged. Terrain replacement, input removal/reappearance, fog and resource
release are covered by the [city checkpoint evidence](../assets/slice-12-city-inputs/README.md).

This completes the bounded city part of the first remaining pass, not the full
entity/input pass: army/crowd/cart inputs, accepted label layout, interaction
policy and production integration remain open. Preserve the recorded coastal
footprint and steep-selection limitations; map-wide physical sun-shadow fitting
belongs to the environment pass.

## Shared physical crowd checkpoint

Campaign representative figures now consume the existing physical crowd with the
campaign figure scale applied consistently to meshes, LOD/culling and impostors.
The campaign world seats incoming frame figures on its presented surface and
updates visibility and lifecycle ownership. [Crowd evidence](../assets/slice-12-crowd/README.md)
records the exact fixture repeat, live frame inputs, scale regression checks and
retained paired-row readability limit. This does not complete army standards,
carts, labels, commands or production cutover.
## Shared label frame checkpoint

The raw campaign pass and physical campaign world now consume one renderer-neutral
atlas/layout frame. The physical world supplies canonical raised projection and
renders accepted quads in the same canvas. Existing production label generators,
sea fitting, hierarchy and card occupancy remain authoritative. The bounded
[DPR and lifecycle evidence](../assets/slice-12-labels/README.md) records the
verified city/army glyph seam and the remaining full-presentation integration.

## Unified army/cart input checkpoint

Physical campaign composition now takes one existing entity frame for cities,
crowd, standards and selection. Carts remain scenery inputs with the road's
surface-relative clearance. Shared selection geometry/style and campaign-standard
city identity retain the source presentation rules while the physical surface
owns final elevation. [Army/cart evidence](../assets/slice-12-army-carts/README.md)
records the combined fixture and the deliberate garrison policy: city/banner
representation replaces figures intersecting roofs, without moving the shared
garrison anchor or changing field-army crowd/troop state. Selection style is
retained. Production interaction and overview screen markers remain separate.

## Spatial card placement

At the full-tilt zoom where all own city cards must show, cards now pack from
top to bottom rather than by city tier. This prevents a northern low-tier card
from cascading beneath an entire southern cluster. The scene retains projection
and measurement; one pure placement owner computes final rectangles. The lower
zoom culling band keeps its tier policy. [Actual-scene evidence](../assets/slice-14-production/remaining-acceptance/card-placement-control/README.md)
records Tibur's 199.684 px correction, unchanged city bodies, all original
collision/visibility checks, and three exact repeats. Offshore Ostia and general
card/model association remain limited by the existing downward-only policy.
