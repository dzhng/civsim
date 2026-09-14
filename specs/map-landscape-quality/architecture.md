# Ownership and implementation contracts

This defines the intended end state, not APIs already implemented. File names below marked **proposed** are planned homes; retain an existing equivalent owner instead of adding an alias beside it.

## Share appearance, preserve each world's meaning

The campaign keeps strategic geography and kilometre coordinates. Battle keeps metre-based physical terrain, movement, deployment space, and existing site-derived recipes. Both render through `PhotorealWorld`, `camera3d`/`cameraBridge`, the physical environment owner, and common surface/material/scenery code. A shared aesthetic does not require a shared map generator or identical detail budgets.

No new save version, campaign locale schema, battle recipe format, backend, package dependency, or library upgrade is required. The existing source raster remains the geographic input. Its palette classifier is a single source adapter, not a second material palette. Generated offline material assets, if needed, are checked in and have provenance; no runtime asset API is introduced.

## Canonical owners

| Concept | End-state owner | What remains mode-specific |
|---|---|---|
| Input geography | Campaign data adapter and `crates/sim` battle terrain | Strategic range/coast identity versus physical playable terrain |
| Surface domain and mesh/query contract | `packages/game-renderer/src/terrain/surface.ts` | Source units and transforms, not duplicated interpolation math |
| Campaign relief generation | `packages/game-renderer/src/terrain/campaignLandscape.ts`, redesigned | Geographic range envelope, ridge hierarchy, city approach constraints |
| Shared shader vocabulary and frame uniforms | `photoreal-renderer/src/landscape/shaderNodes.ts` | Each world updates its own camera focus and clock |
| Common physical terrain response | **Proposed:** `packages/photoreal-renderer/src/landscape/terrainMaterial.ts` | Battle road/mud/trample masks and campaign cover profiles |
| Water response | **Proposed:** `packages/photoreal-renderer/src/landscape/waterMaterial.ts`, extracted from `battle/seaLayer.ts` | Ocean, river, lake shape/displacement and world-scale shore ramps |
| Material/cover profile | **Proposed:** `packages/game-renderer/src/terrain/materialProfile.ts` | Explicit detail wavelengths and cover mixtures for each scale |
| Vegetation identities and meshes | Existing `models/shared/sceneryPropRegistry.ts` | Placement eligibility, density budgets, projected representation thresholds |
| Shared scenery instances and drawing | **Proposed:** neutral scenery contract under `game-renderer/src/terrain/`; physical layer under `photoreal-renderer/src/landscape/` | Per-world visibility/reservations; no battle import from a campaign GPU pass |
| Campaign tile residency | `photoreal-renderer/src/campaign/terrainTiles.ts` | Battle may reuse edge/mesh primitives; its existing playable/vista layout stays owned by battle |
| Standards | Existing shared standard asset and `photoreal-renderer/src/landscape/standardLayer.ts` | Tier, grounded scale, livery and label policy |
| Environment and color | Existing `game-renderer/src/environment/environment.ts` and `photoreal-renderer/src/environment.ts` | Preset, distance scaling, view-fitted shadow extent |
| Campaign composition | **In progress:** `photoreal-renderer/src/campaign/campaignWorld.ts` | Territory, fog, roads, cards, labels, entities, campaign scene data |
| Application interaction | Existing `web/src/campaign/renderer.ts` and `scene.ts` | Commands, saves, selections, UI state, camera controls |

Do not move whole files just to make names neutral. Extract shared response from battle's ground/sea orchestration, then have battle and campaign import it directly. Move the existing node math helpers to a neutral home only when they have actual cross-world consumers. Retain the battle turf/blade owner and physical generator.

## Surface semantics

The common contract must explicitly carry:

- Domain origin, axis orientation, sample spacing, and native units. Normalize raster north-down rows at the input boundary; world queries use east/north/up in both modes. Converting coordinates is separate from choosing artistic height exaggeration.
- CPU mesh positions, normals, indices, surface coverage, and material signals. The shared mesh type cannot depend on `PhotorealBattleGroundMesh` or battle tint IDs. Battle converts its tint/roughness fields at its source boundary.
- `sampleRendered(x, y)` and `raycastRendered(ray)` against the triangles actually presented for the current frame. Returned height, normal, and surface identity come from one mesh revision. Missing detail falls back to the resident coarse surface, not zero height.
- A separate physical source query for battle. Visual sampling changes neither Rust heights nor movement/passability. Rendered soldiers/cues can use the presented surface without changing their physical XY position or simulation rules.
- Frame-atomic geometry/anchor updates: a tile replacement, roads, props, shadows, selection, and picking switch to the same surface revision. Never leave roads on yesterday's sampler while rendering today's mesh.

Source signals and rendered geometry are different concepts with one owner each; do not collapse them into a function that silently changes meaning between modes. Rendering may use a coarser mesh at overview; movement continues to consume physical data.

## Water semantics

Keep these separate: wet coverage, water-body identity, signed shore distance, and a depth value/proxy. They cannot all be represented by the battle field's filtered 0–1 water weight. The campaign can derive a bounded depth proxy from shore distance; label it as a visual proxy, not measured bathymetry. Bodies and connected rivers come from geographic inputs, not decorative noise.

The same canonical boundary drives terrain coast geometry, water coverage, surf placement, territory clipping, and render-land queries. A full-resolution coast mask is not automatically the same as the strategic territory-capable land mask: preserve their different semantics and derive each from the same source adapter. Region/tile boundaries never become new shores.

Convert display-authored dry albedo exactly once; common water response is already linear. Share roughness/normal/light response while exposing scale-specific depth and detail inputs. Waves use the owned frame time and remain inside their water body.

## Bounded work and detail

Start with a resident coarse overview and world-aligned regular tiles. Reuse mesh topology; cache by world tile identity and detail level. Sampling may use a halo, but clip rendered coverage to the tile domain. Edge positions and shading normals must agree at shared world coordinates; different resolutions have an explicit stitched or morphed boundary.

Each ground location has exactly one active rendered surface owner. Suppress coarse triangles beneath active detail and restore coarse coverage atomically on eviction; rendering, shadowing and ray queries use the same visible coverage. A hidden coarse triangle cannot win a pick. The suppression/replacement mechanism is delegated.

Initial engineering limits, selected for this feature rather than claimed measurements:

- At most 64 detailed terrain tiles resident, in addition to one coarse overview.
- One terrain-build worker request in flight. Keep completed overlapping tiles useful during camera motion; do not cancel/restart all work on every view change.
- At most one new tile admission/surface swap per animation frame; prioritize visible missing detail, then nearby reuse. Existing adjacent edge buffers update inside that same transaction so the detailed region shares one boundary. Report all changed upload bytes, including neighbor edges and coarse coverage. A failed tile produces an explicit error and keeps the coarse surface; no automatic retry loop.
- At most 128 MiB of feature-owned terrain tile geometry and coverage textures. Report allocated bytes directly. Shared global geography, scenery assets, shadows, and other game resources are reported separately.
- Idle camera: no repeated tile generation or unchanged static-instance uploads. Repeated traverse/return and campaign/battle round trips must reach a stable residency plateau and dispose evicted resources.

The implementer may lower detail or change tile dimensions/resolutions within these limits. Raising a bound requires measured evidence and a recorded plan revision, not user permission. Do not meet a budget by erasing a whole visible range/forest or by hiding gameplay overlays.

## Graphics and performance acceptance

Keep the installed Three.js version and existing sample-count/depth policy. No second GPU canvas, private projection, fallback WebGL renderer, global MSAA change, or private haze layer. Shadow visibility includes objects that cast into the view; cast and receiver transforms share the same terrain/instance coordinates.

Correctness captures use the existing SwiftShader harness. Hardware timing uses the current machine's actual adapter and browser, named in the report; choose it automatically and record the provenance. The campaign engineering target is p95 frame time <=33 ms during frozen-state pan/zoom with the full UI, and warm tile integration must not cause >100 ms frames. Measure at 1280×800 DPR1, with a separate DPR2 correctness/interaction check. These are selected targets, not existing user-specified hardware guarantees.

Preserve the existing battle 33 ms static/pan/zoom gates at their defined workload. Capture pre-change and candidate on the same hardware/browser using the existing full-game report. Extend that report's renderer identity and new landscape metrics; don't fabricate missing timings or classify software as hardware. If hardware is unavailable, finish the implementation and visual work but mark hardware acceptance unverified, not passed.

## Retirement contract

The lab route is an intentional development surface while production migrates. It must become a thin caller of the production campaign world at cutover; the standalone spike builder/composition cannot survive as a second engine. Delete losing geometry/material experiments after their verdicts; retain evidence and rationale only.

Retire raw campaign world passes as their last consumers switch, including development routes. Keep reusable CPU road/territory/label-layout/model data. Audit other callers before deleting shared raw infrastructure used by unrelated routes. The shared mountain mesh may remain only for an actual independent consumer; campaign range placement must be removed. Old baked lighting cannot remain in the new physical albedo path.
