# 05 — Shared rock, scree and grass response

Status: shared owner and face-oriented artifact reduction implemented; combined visual acceptance remains open after [04](04-mountain-form.md).

## Contract and owner

Neutral response policy lives in game-renderer terrain/materialProfile, with the shared raw rock asset. Three and TypeGPU implement their own shader adapters. Keep battle turf, roads, mud, trample and physical tint decoding at their existing boundary. Common material profiles own neutral palette and feature scale.

Slice variable: **Surface material and transition quality on fixed geometry.**

## Work

First reproduce triplanar color/normal mapping on a flat-to-steep ramp with the pinned TSL helpers, as described in research.md. Then replace contour-dominant world-height striping with face-oriented fracture/roughness/normal detail. Blend exposed rock, scree, soil and grass using surface slope, source cover and irregular transition masks. Snow/dry/temperate coverage must retain the existing campaign climate distinctions, but do not force snowy peaks into the supplied Mediterranean reference. Keep albedo neutral and preserve the single water-color conversion fix. Texture detail changes must not alter height, coast coverage, or physical passability.

## Runnable checkpoint

The landscape-materials scene is a Three material/source guard. Its historical consumer=battle branch does not exercise the current TypeGPU renderer and cannot prove present cross-backend equivalence. Current TypeGPU production evidence lives with13; equivalent-input material/shore/seam controls through that backend remain required. The earlier geometric-normal control is retired after the production comparison rejected the bump contribution. Frozen real regions and terrain-water remain consumer guards.

## Verification and review

Render equivalent material inputs under the same lighting through both consumers. Probe steep faces for texture stretching, ground-versus-water color agreement and geometric normal transforms. Run terrain-water, battle-ground-turf, battle-terrain-seams and environment tests. Check zoomed frames for stippling/shimmer instead of hiding it with blur.

Crop/mask: Lit/shaded rock face, grass shelf and scree-foot crops. Geometry, tree model/placement, lighting, water shape and wave motion are frozen.

Apply [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) to the candidate, prior output and reference as applicable. Record telemetry and the less-wrong/both-wrong verdict. Then run an unprimed [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last visual acceptance check**; resolve in-scope findings before accepting. Repeat intentionally updated snapshots with zero pixel differences. The shared [verification contract](../validation.md) governs controls, evidence and non-blocking review windows.

## Delegated decisions and protected behavior

Procedural versus small checked-in material textures, frequencies, blend curves, roughness and palette values are delegated. No external runtime asset service or duplicated campaign shader is permitted;
small checked-in material textures are owned by the application build.

Everything outside this slice's variable stays fixed; the relevant existing gameplay, water-color, surface and lifecycle tests stay green. Follow the [ownership contracts](../architecture.md). Record new implementation decisions and measured deviations in this slice before ending a pass.

Feedback that would change the slice: A different rock or climate art direction changes material profiles; it does not create another material implementation.

Human checkpoints are non-blocking. Show the artifact, allow a short response window while doing independent work, then decide from evidence and proceed. Do not ask permission for the already-authorized implementation or spike choices.

## Current implementation and evidence

The shared neutral profile and rock bitmap have backend-local shader adapters.
Campaign source coverage is sampled in world space, avoiding per-vertex coverage
mismatches at coarse/fine boundaries. Normalize geometric normals after
interpolation so joined edges retain the same material response. Terrain lighting
follows geometric normals; bitmap color and roughness provide filtered fractures.
One texture belongs to each world and retires with it.

| Retained checkpoint | Evidence and scope |
| --- | --- |
| Shared shader vocabulary and terrain response | [Vocabulary](../assets/shared-shader/README.md), [response ownership](../assets/slice-05/extraction/README.md). Historical Three consumer equivalence is not current TypeGPU equivalence. |
| Source-band sampling | [Source cover](../assets/slice-05/source-cover/README.md): source orientation, filtering and disposal; no added tile buffers. Current exposure interpretation is superseded by the shelf pass below. |
| Face-oriented bitmap, geometric lighting normals | [Normal control](../assets/slice-05/rock-normal-control/README.md), [actual battle](../assets/slice-05/production-battle-rock/README.md), [retirement](../assets/slice-15-retention/rock-production10/README.md). Retains fractures without the rejected granular derivative-normal response. |
| TypeGPU bitmap adoption | [Production adapter](../assets/slice-13/bitmap-rock/README.md): shared asset/policy, filtering and owned texture lifetime. |
| Grass through gentle mountain interiors | [Connected shelves](../assets/slice-05/connected-shelves/README.md): source band strengthens exposed faces instead of forcing bare shelves. Three production views repeat exactly; terrain return/residency/DPR checks pass. |

The shelf pass is a bounded visual improvement on the simplified form from04,
not final landscape acceptance. Grass connects through bowls and shoulders while
steep faces remain rocky. The wider existing rock interval is preferred over the
narrow rolling-ground interval. Angular grass edges, isolated painted patches,
thin green crest caps, distinct scree and final motion/shimmer remain open.
Resolve these through current production consumers, keeping physical terrain and
battle cover semantics unchanged. Reuse the shared13/15 acceptance matrix.

## Rejected controls

Do not repeat [directional noise](../assets/slice-05/directional-face/README.md)
or [palette/mask region tuning](../assets/slice-05/material-regions/README.md)
as established solutions: they failed regional geological readability. The
[first full source-cover response](../assets/slice-05/source-cover-first/README.md)
made interiors uniformly bare. Bitmap derivative normals added grain and were
removed. These findings constrain the next experiment; their build history stays
in the linked evidence rather than becoming another implementation queue.
