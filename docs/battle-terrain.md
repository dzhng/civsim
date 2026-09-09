# Battle terrain and scenery

How a battlefield becomes a place: rolling ground, sealed sides, woods and
rocks, and soldiers standing on all of it. The rule that governs every part is
the same one the sim lives by — **the picture samples the canonical data, it
never invents a parallel copy.**

## Canonical height lives in the sim; the renderer is a view

Ground elevation is a channel on `sim::Terrain` (`crates/sim/src/terrain.rs`),
beside speed/roughness/tint, exposed across the wasm boundary like the others.
It is **presentation and asset seating only** — no movement, collision, or
combat code reads it, which is the whole reason adding it left the golden hash
untouched. The day height becomes a *mechanic* (high-ground bonus, vision,
ballistics) is the day that test re-pins; until then, relief and passability are
independent (a map that wants impassable high ground must also paint speed 0).

The [shared height sampler](../packages/game-renderer/src/terrain/heightField.ts)
reads canonical terrain with bilinear, edge-clamped interpolation. Generated
vista detail is derived from that source and corrected where adjacent bands
meet; it is not independently authored ground. Campaign relief uses the same
sampler contract. Mouse picking has a stricter requirement: it must intersect the
triangles actually displayed, including mesh decimation and the joins between
terrain rings. Battle builds one spatial index from those meshes and uses it
for the camera's surface queries. A ray into open sky has no ground target.

## A coastline continues beyond the playable rectangle

Generated water reaches share their shoreline sampler between playable terrain
and distant bands. The land descends toward the bay, and the bay widens into
the distance; a cropped water mask must not leave mountains suspended above
its outer edge. Relief can change without changing movement masks or tint.

The renderer joins adjacent meshes using both edges' vertices. Merely matching
height samples leaves cracks when one grid skips vertices or ends at cell
centres. Height correction follows the final inner surface, while the joining
strip carries its material attributes into the outer band.

## Looking around turns at the eye

Battle's automatic tilt follows physical viewing distance and approaches the
horizon only near the ground. Manual look preserves the eye position, viewing
distance, and lens above uneven terrain. Its look target may leave the map;
clamping that target would move the eye during a head turn. Right-drag and
Q/E/Z/X use this same operation. Right-click issues a ground order, and
Alt-right-drag gives a facing order.

Wheel zoom brings the elevated look target back toward terrain as the remaining
zoom distance closes. Retaining that altitude after a high head turn would
strand even the closest camera view far above the soldiers.

Destination previews show the latest accepted command immediately, including
one still waiting for the simulation's command delay. The preview is feedback
about intent; it must not briefly show the previous destination as a second
order.

## One height field seats everything — the seating invariant

The ground mesh, the scenery props, the soldiers, and their shadows all sample
the **same** `TerrainHeightField`. That is what keeps feet, canopies, and
contact shadows on the surface instead of floating or sinking. The smell that
violates it is a `z: 0` (or `elevation: 0`) literal used as a placement seat:
forbidden for props/entities/scenery, allowed only for a documented flat
fixture, a ground-plane decal, or coordinate-system math. Battle *exaggerates*
the gentle metre-scale relief for readability at the gameplay camera; because
the exaggeration rides in the shared field's vertical scale, everything seated
through it stays consistent.

## The catalog presents what the sim enforces

`battle/mapCatalog.ts` (`BATTLE_MAP_CATALOG`) is the one source of a map's
presentation roles — sealed-edge kind (cliff/ocean/wall), open-edge fog, ground
cover. It owns no passability: the sim's speed masks seal the west/east flanks,
and the edge role only *describes* that blocker so the horizon can draw it.
Menu, battle launch, and verification scenes read this catalog; none redeclare a
map's traits. A declared sealed side that does not front impassable terrain is a
lie the `edgeSealMismatches` guard is there to catch.

Feature extraction (`battle/terrainFeatures.ts`) is pure and deterministic —
the same tint grid and seed always yield the same forest/rock/mud/water
features. Battle's *policy* over that stream (how dense a wood, how big a tree,
edge-weighted scatter for gameplay clarity) lives in `battle/terrainScenery.ts`,
seated through the height field; the meshes it places are the shared ones below.

## Grass uses the soldiers' world scale

Ordinary battle grass stays below a standing soldier's knees and has thin
blades, so vegetation does not make human figures appear miniature or hide
their equipment. Judge the complete blade after height variation and shader
shaping, rather than the sampler's base height alone.

The [production grass profile](../packages/photoreal-renderer/src/battle/battleGrassField.ts)
owns blade dimensions for both the whole-map field and the camera's denser
focus ring. Quality settings change sampling and geometry detail without
substituting broad leaves. The shader preserves those widths instead of
inflating thin blades to a visibility minimum. Geometry activation follows the
blade's projected size, so an invisible blade does not become expensive merely
because an input dial moved. The denser focus ring uses hysteresis around that
same pixel-size measure. Tessellation preserves an interior vertex for canopy
coverage; removing it changes the silhouette, not just curve smoothness.
The [standing-soldier view](../web/scenes/battle/battle-grass-scale.mjs)
guards the relationship at the close gameplay camera.

## Shared scenery props have one owner

Trees, rocks, mountains, and carts are the same models whether they dress a
campaign road or a battlefield, so the builder list lives once in
`models/shared/sceneryPropRegistry.ts` and every surface places a prop by id.
Geometry stays in `sceneryPropModels.ts`; the registry names it and carries the
scale hints and the model-sheet review groups. The instanced renderer
(`campaign/sceneryPass.ts`) is shared too — it takes a world-depth selector so
the same pass sorts props against the campaign ground or the battle ground.

## Where the pieces live

- Canonical terrain + height: `crates/sim/src/terrain.rs`, `maps.rs`; the wasm
  pointers in `crates/game-wasm/src/lib.rs`.
- Shared sampler: `packages/game-renderer/src/terrain/heightField.ts`.
- Battle presentation: `packages/game-renderer/src/battle/` — `mapCatalog.ts`
  (roles), `terrainFeatures.ts` (extraction), `terrainScenery.ts` (placement),
  `groundPass.ts` (rolling ground), `horizonPass.ts` (sealed edges). In
  production the battle draws all of this through the three.js WebGPU world in
  `packages/photoreal-renderer` (which samples the same catalog, features, and
  height field); the bespoke WGSL passes beside the data still serve the
  campaign and the renderer lab until the photoreal ladder retires them
  ([specs/done/3d-perspective-renderer](../specs/done/3d-perspective-renderer/README.md)).
- Shared props: `packages/game-renderer/src/models/shared/`.
- The visual gates that prove all of it are the `battle-terrain-*` scenes under
  `web/scenes/battle/`; the snapshot discipline they obey is
  [`web/shots/README.md`](../web/shots/README.md).

The [terrain and controls verification report](../web/reports/battle-terrain-controls.md)
records the reported-seed checks, review decisions, and remaining pixel-repeat
limitation.
