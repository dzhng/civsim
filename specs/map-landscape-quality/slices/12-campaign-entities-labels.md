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
