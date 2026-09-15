# 12 — Campaign entities, labels and selection

Status: pending. Dependencies: [11](11-campaign-geographic-layers.md).

## Contract and owner

Complete campaignWorld with existing city/army/model/standard data, shared physical scenery/crowd layers where compatible, and existing CPU label/card arbitration. The application adapter retains command/UI state.

Slice variable: **Entity grounding, text hierarchy and interactive selection.**

## Work

Seat cities, representative soldiers, army standards, carts and selection on the same presented surface as roads. Port screen text/markers without discarding the established label hierarchy or DOM card behavior. Use the canonical camera for screen anchors and rendered-surface rays for interaction. Keep fog hiding, faction/allegiance treatments, selected entity hierarchy and city labels readable under taller relief. Preserve troop model/animation ownership rather than building a second crowd pipeline. Add disposal and scene-entry/exit paths.

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
