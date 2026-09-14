# 05 — Shared rock, scree and grass response

Status: shared owner and face-oriented artifact reduction implemented; combined visual acceptance remains open after [04](04-mountain-form.md).

## Contract and owner

Shared terrain response lives in the landscape terrainMaterial owner. Keep battle turf, roads, mud, trample and physical tint decoding at their existing boundary. Common material profiles own neutral palette and feature scale.

Slice variable: **Surface material and transition quality on fixed geometry.**

## Work

First reproduce triplanar color/normal mapping on a flat-to-steep ramp with the pinned TSL helpers, as described in research.md. Then replace contour-dominant world-height striping with face-oriented fracture/roughness/normal detail. Blend exposed rock, scree, soil and grass using surface slope, source cover and irregular transition masks. Snow/dry/temperate coverage must retain the existing campaign climate distinctions, but do not force snowy peaks into the supplied Mediterranean reference. Keep albedo neutral and preserve the single water-color conversion fix. Texture detail changes must not alter height, coast coverage, or physical passability.

## Runnable checkpoint

The landscape-materials scene renders equivalent campaign and battle inputs, a geometric-normal control, and near/far material views. Frozen real regions and terrain-water remain consumer guards.

## Verification and review

Render equivalent material inputs under the same lighting through both consumers. Probe steep faces for texture stretching, ground-versus-water color agreement and geometric normal transforms. Run terrain-water, battle-ground-turf, battle-terrain-seams and environment tests. Check zoomed frames for stippling/shimmer instead of hiding it with blur.

Crop/mask: Lit/shaded rock face, grass shelf and scree-foot crops. Geometry, tree model/placement, lighting, water shape and wave motion are frozen.

Apply [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) to the candidate, prior output and reference as applicable. Record telemetry and the less-wrong/both-wrong verdict. Then run an unprimed [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last visual acceptance check**; resolve in-scope findings before accepting. Repeat intentionally updated snapshots with zero pixel differences. The shared [verification contract](../validation.md) governs controls, evidence and non-blocking review windows.

## Delegated decisions and protected behavior

Procedural versus small checked-in material textures, frequencies, blend curves, roughness and palette values are delegated. No runtime asset dependency or duplicated campaign shader is permitted.

Everything outside this slice's variable stays fixed; the relevant existing gameplay, water-color, surface and lifecycle tests stay green. Follow the [ownership contracts](../architecture.md). Record new implementation decisions and measured deviations in this slice before ending a pass.

Feedback that would change the slice: A different rock or climate art direction changes material profiles; it does not create another material implementation.

Human checkpoints are non-blocking. Show the artifact, allow a short response window while doing independent work, then decide from evidence and proceed. Do not ask permission for the already-authorized implementation or spike choices.

## Implementation order

First extract shared shader vocabulary and material response without changing appearance. This ownership pass can proceed while mountain form is evaluated. Keep physical tint decoding, road/mud masks, turf and playable/vista layout under battle. Then tune the common rock/grass transition on fixed accepted geometry. Final visual acceptance still depends on04; extracting shared ownership does not.

The shared shader vocabulary extraction is verified; [evidence](../assets/shared-shader/README.md) records unchanged consumer captures and the controlled inherited battle snapshot failure. The terrain material response now also has one shared owner; moving helper ownership alone did not complete 05.

The shared terrain response extraction is verified: [ownership evidence](../assets/slice-05/extraction/README.md) records exact small canonical controls, equivalent-consumer RGBA, matched hardware turf controls, and the inherited full SwiftShader readiness limitation. Face-oriented visual tuning remains active.

The [face-response evidence](../assets/slice-05/face-detail/README.md) records the procedural triplanar/normal probe, fixed-geometry before/after comparison, exact consumer and water guards, hardware battle controls, and remaining close-rock softness. This is a verified material implementation checkpoint, not final combined landscape art acceptance.
