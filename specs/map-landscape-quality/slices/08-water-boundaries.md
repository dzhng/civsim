# 08 — Coasts, channels and river connections

Status: in progress. Dependencies: [01](01-surface-contract.md), [03](03-bounded-terrain.md), [04](04-mountain-form.md).

## Contract and owner

The source adapter and surface water domain own wet coverage, body identity and signed shore distance. Territory, water and land queries consume that same boundary with their explicitly different semantics.

Slice variable: **Geographic water placement and terrain-water geometry.**

## Work

Extend the canonical world-stable shore-distance owner delivered by 01 with connected-body data, consistent water levels and bank geometry; do not introduce another shore transform. Preserve narrow islands, channels, cliff coasts and existing river mouths from the source raster/map. Join terrain banks and water surfaces without a floating edge or an all-coast sand skirt. Give inland bodies a consistent water level and connect known river mouths; do not create major river networks from procedural detail. Any shoreline refinement preserves source geography and cannot strand cities/roads. Keep depth proxy data distinct from wet coverage.

## Runnable checkpoint

Planned landscape-shores scene: small island, channel, river mouth, beach, and coastal mountain in flat diagnostic material; include both tile and water-body boundaries.

New routes/scenes named here are planned deliverables. Use the existing scene runner and snapshot primitive; do not claim they already exist.

## Verification and review

World-coordinate coast/land tests, body continuity, shore-sign agreement and boundary sampling. Compare territory clipping and road land queries against the same boundary. Check channels/islands survive overview and close views, and that coastal geometry remains seated after LOD swaps.

Crop/mask: Shore outline, inlet/island and river-mouth crops. Water color, foam, waves, final rock texture and lighting are out of scope and held flat.

Apply [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) to the candidate, prior output and reference as applicable. Record telemetry and the less-wrong/both-wrong verdict. Then run an unprimed [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last visual acceptance check**; resolve in-scope findings before accepting. Repeat intentionally updated snapshots with zero pixel differences. The shared [verification contract](../validation.md) governs controls, evidence and non-blocking review windows.

## Delegated decisions and protected behavior

Bank tessellation, connected-body construction and bounded depth-proxy generation are delegated. Reuse the distance-field algorithm and world-stability contract from 01. Major geography, city positions and existing crossings are fixed.

Everything outside this slice's variable stays fixed; the relevant existing gameplay, water-color, surface and lifecycle tests stay green. Follow the [ownership contracts](../architecture.md). Record new implementation decisions and measured deviations in this slice before ending a pass.

Feedback that would change the slice: A user-supplied geographic correction changes source data. Better-looking water alone is not grounds for moving the shoreline.

Human checkpoints are non-blocking. Show the artifact, allow a short response window while doing independent work, then decide from evidence and proceed. Do not ask permission for the already-authorized implementation or spike choices.


## Source checkpoint and next boundary

The [source investigation](../assets/slice-08/README.md) separates wet coverage from territory-capable land without enlarging the serialized mask. A compact source-wide run index retains connected river/body identity. Existing canonical shore distance remains authoritative; body level and future depth proxies are separate signals.

The first checkpoint does not change water geometry. Before the next geometry pass, demonstrate the narrow-channel/island failure at coarse resolution and reconcile bank geometry, water level, picking and tile suppression as one surface contract. A texture-only water mask on sloping terrain is not sufficient. Battle lake levels remain supplied by physical hydrology rather than re-inferred from filtered water weights.
