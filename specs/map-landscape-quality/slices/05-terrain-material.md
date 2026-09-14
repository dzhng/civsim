# 05 — Shared rock, scree and grass response

Status: pending. Dependencies: [04](04-mountain-form.md).

## Contract and owner

Extract shared terrain response into the proposed landscape terrainMaterial owner. Keep battle turf, roads, mud, trample and physical tint decoding at their existing boundary. Common material profiles own neutral palette and feature scale.

Slice variable: **Surface material and transition quality on fixed geometry.**

## Work

First reproduce triplanar color/normal mapping on a flat-to-steep ramp with the pinned TSL helpers, as described in research.md. Then replace contour-dominant world-height striping with face-oriented fracture/roughness/normal detail. Blend exposed rock, scree, soil and grass using surface slope, source cover and irregular transition masks. Snow/dry/temperate coverage must retain the existing campaign climate distinctions, but do not force snowy peaks into the supplied Mediterranean reference. Keep albedo neutral and preserve the single water-color conversion fix. Texture detail changes must not alter height, coast coverage, or physical passability.

## Runnable checkpoint

Planned landscape-materials scene with common material probes at campaign and battle scales, then frozen real regions; terrain-water remains a consumer guard.

New routes/scenes named here are planned deliverables. Use the existing scene runner and snapshot primitive; do not claim they already exist.

## Verification and review

Render equivalent material inputs under the same lighting through both consumers. Probe steep faces for texture stretching, ground-versus-water color agreement and geometric normal transforms. Run terrain-water, battle-ground-turf, battle-terrain-seams and environment tests. Check zoomed frames for stippling/shimmer instead of hiding it with blur.

Crop/mask: Lit/shaded rock face, grass shelf and scree-foot crops. Geometry, tree model/placement, lighting, water shape and wave motion are frozen.

Apply [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) to the candidate, prior output and reference as applicable. Record telemetry and the less-wrong/both-wrong verdict. Then run an unprimed [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last visual acceptance check**; resolve in-scope findings before accepting. Repeat intentionally updated snapshots with zero pixel differences. The shared [verification contract](../validation.md) governs controls, evidence and non-blocking review windows.

## Delegated decisions and protected behavior

Procedural versus small checked-in material textures, frequencies, blend curves, roughness and palette values are delegated. No runtime asset dependency or duplicated campaign shader is permitted.

Everything outside this slice's variable stays fixed; the relevant existing gameplay, water-color, surface and lifecycle tests stay green. Follow the [ownership contracts](../architecture.md). Record new implementation decisions and measured deviations in this slice before ending a pass.

Feedback that would change the slice: A different rock or climate art direction changes material profiles; it does not create another material implementation.

Human checkpoints are non-blocking. Show the artifact, allow a short response window while doing independent work, then decide from evidence and proceed. Do not ask permission for the already-authorized implementation or spike choices.
