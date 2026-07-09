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

The renderer never stores its own heightmap. `terrain/heightField.ts` is a typed
*view* — `TerrainHeightField` + `terrainHeightAt`, a bilinear edge-clamped
sampler that mirrors `Terrain::height_at` so the renderer and the sim agree on
where the ground is. Campaign relief (`web/src/campaign/terrain.ts`) speaks the
same sampler shape so both surfaces, and later vision/projectiles, read one
contract.

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
