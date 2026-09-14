# Research and architecture decisions

Sources checked on 2026-09-15. These support design choices; none establishes that our current render meets the reference. Existing pinned local library code remains authoritative for API availability.

## Terrain detail without unbounded world meshes

[NVIDIA: Terrain Rendering Using GPU-Based Geometry Clipmaps](https://developer.nvidia.com/gpugems/gpugems2/part-i-geometric-complexity/chapter-2-terrain-rendering-using-gpu-based-geometry) describes nested regular grids, a filtered elevation hierarchy, reusable geometry, and bounded windows that move with the viewer. Its important principle here is that visible detail need not scale with total map area.

**Decision:** start with world-aligned cached grid tiles, a resident coarse overview, and shared edge samples. Reproduce a two-resolution join in the bounded-rendering slice before choosing the stitching implementation. Full GPU clipmaps are a measured fallback if the simpler cache cannot meet the frame budget; no virtual-texture service or custom streaming engine by default. The historical DirectX implementation is not a literal WebGPU port.

## Rock texture belongs to the face

[NVIDIA: Generating Complex Procedural Terrains Using the GPU, texturing section](https://developer.nvidia.com/gpugems/gpugems3/part-i-geometry/chapter-1-generating-complex-procedural-terrains-using-gpu) explains why a single planar texture stretches on steep faces and how normal-weighted triplanar projections reduce that distortion. Normal maps require a consistent basis for each projection.

[Three.js TSL documentation](https://threejs.org/docs/pages/TSL.html) provides triplanar texture nodes. The published defaults use local position and normals, so tiled terrain must explicitly supply coherent coordinates.

**Decision:** the material slice first reproduces a textured ramp/vertical-face fixture using the pinned TSL implementation, then applies it to our mountain geometry. Use world-stable texture coordinates and correctly transformed normals. Keep large-scale rock/grass coverage independent from small-scale fracture detail. Remove the contour-dominant height-striping treatment instead of layering another noisy effect over it. A compact, checked-in neutral material set may be generated procedurally; external assets are optional, with provenance recorded if used. Voxel caves and overhangs are unnecessary for this target.

## Preserve forest coverage as detail changes

[NVIDIA: Next-Generation SpeedTree Rendering](https://developer.nvidia.com/gpugems/gpugems3/part-i-geometry/chapter-4-next-generation-speedtree-rendering) discusses vegetation cutout aliasing and interactions between alpha coverage and representation transitions. It also shows why a naive transition can make the combined tree too transparent.

**Decision:** retain close leaf geometry and coarse crowns under the shared registry. Choose by projected crown size, with stable instance identity and hysteresis. Reproduce a zoom/return fixture before full forests; prove silhouette coverage and shadow continuity. Do not enable global MSAA merely to improve foliage: the battle renderer intentionally uses a different sample-count policy for soldier readability. Any optional dither must use owned deterministic state and pass fixed-frame gates.

## One physical response and one color conversion

[Three.js NodeMaterial documentation](https://threejs.org/docs/pages/NodeMaterial.html) provides separate color, normal, opacity, position, and shadow hooks. The local owners are [terrainLayer.ts](../../packages/photoreal-renderer/src/battle/terrainLayer.ts), [seaLayer.ts](../../packages/photoreal-renderer/src/battle/seaLayer.ts), and [environment.ts](../../packages/photoreal-renderer/src/environment.ts).

**Decision:** share physical surface response, normal transforms, and linear color ownership. The spike's water mutation test demonstrates the consequence of converting a linear color twice. Water coverage, depth, and shore distance become separate signals; the battle field-water weight/ramp is not automatically a campaign ocean-depth model. Unit scale, optical distance, and texture frequency are explicit inputs, not copies of constants in each renderer.

## Local evidence that changes the migration plan

- [Campaign renderer](../../web/src/campaign/renderer.ts) projects entities with terrain elevation but its inverse `toWorld` uses the map plane. Raised-terrain pointer tests must accompany migration; a forward/inverse test of the same flat assumption is insufficient.
- [Campaign terrain](../../web/src/campaign/terrain.ts) derives relief and biome signals from the painted raster and flattens height near cities. Subdividing that result alone cannot restore missing range structure. Keep the source land/range identity; redesign the visual relief and explicit local seating constraints.
- [Regional spike](../../packages/game-renderer/src/terrain/campaignLandscape.ts) computes shore distance inside its window and uses local grid indices for trees. Neither may become the production tiled source unchanged.
- [Battle generator](../../crates/sim/src/genmap/mod.rs) derives passability and hydrology from physical terrain. Shared rendering must not regenerate those channels or change map recipes.
- [Campaign battle setup](../../crates/campaign/src/battlegen.rs) already maps site features to battle recipes and preserves city/crossing templates. Use that existing character relationship; do not add a generic locale schema, save version, or new wasm payload without a demonstrated missing consumer input.
- [Battle performance gate](../../web/scenes/battle/battle-perf-30k.mjs) already owns a 33 ms budget. [Full-game performance](../../web/scenes/system/full-game-rendering-performance.mjs) includes campaign/handoff and named-hardware comparisons. Extend these owners for this work, rather than inventing a parallel benchmark or quoting SwiftShader timings as hardware evidence.
