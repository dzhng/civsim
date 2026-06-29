# Slice 02: Battle Terrain Feature Contract

## Contract

Battle terrain becomes a typed feature stream instead of ad hoc renderer quads.
Given the sim terrain grid, the renderer can deterministically ask for features
such as forest clumps, rock outcrops, mud patches, scree/rough lanes, water, and
micro rough samples. The same seam also declares the map's directional edge
roles, full-field ground-cover style, and gentle height variation.

## API Seam

Add a shared terrain-surface sampler plus battle-specific presentation
extraction. The TypeScript shape should be similar to:

```ts
export type BattleTerrainFeatureKind =
  | 'water'
  | 'rock'
  | 'wall'
  | 'forest'
  | 'mud'
  | 'rough'
  | 'micro-rough';

export type BattleEdgeRole = 'open-fog' | 'cliff' | 'mountain' | 'ocean' | 'wall';
export type BattleGroundCover = 'green-grass' | 'yellow-grass' | 'scrub-grass' | 'sand';

export interface TerrainHeightField {
  w: number;
  h: number;
  cell: number;
  ox: number;
  oy: number;
  /** Height above the local surface datum, row-major. Units are declared by scale. */
  height: Float32Array;
  units: 'meters' | 'kilometers' | 'visual';
  verticalScale: number;
}

export interface BattleTerrainFeature {
  kind: BattleTerrainFeatureKind;
  x: number;
  y: number;
  radius: number;
  yaw: number;
  density: number;
  tint: number;
}

export interface BattleTerrainPresentation {
  mapId: string;
  edges: { north: BattleEdgeRole; south: BattleEdgeRole; east: BattleEdgeRole; west: BattleEdgeRole };
  groundCover: BattleGroundCover;
  height: TerrainHeightField;
  features: BattleTerrainFeature[];
}

export interface BattleMapCatalogEntry {
  id: string;
  wasmMapId: number;
  label: string;
  description: string;
  presentation: BattleTerrainPresentation;
  intentionallyFlat?: boolean;
}

export function extractBattleTerrainPresentation(grid: BattleTerrainGrid, seed: number): BattleTerrainPresentation;
export function terrainHeightAt(field: TerrainHeightField, x: number, y: number): number;
```

Recommended location:
`packages/game-renderer/src/terrain/heightField.ts` for the generic sampler and
`packages/game-renderer/src/battle/terrainFeatures.ts` for battle-specific edge,
cover, and feature extraction.

The first version can derive from `terrain_tint_ptr`, `terrain_rough_ptr`, map
dimensions, and a deterministic hash. It should not call DOM, GPU, or wasm
directly. `web/src/battle/scene.ts` should continue to build the grid from the
existing wasm pointers, then hand data into the renderer.

The durable implementation should extend the canonical terrain contract with
height rather than keeping relief as a renderer-only effect. Recommended path:
add `height: Vec<f32>` to `sim::Terrain`, expose it through wasm beside speed,
roughness, and tint, and allow `contract::TerrainSpec` or map builders to paint
gentle elevation operations. Campaign-to-battle handoff and standalone quick
battles should use the same terrain height representation. The renderer-side
`TerrainHeightField` is a typed view/adaptor over canonical terrain data, not an
authoritative source.

Keep the height abstraction generic enough for campaign. `web/src/campaign/terrain.ts`
already owns a `TerrainField.height` array and `heightAt` sampler; after this
slice, campaign should either use the shared sampler directly or expose an
adapter that returns `TerrainHeightField`. Battle may use meters and campaign may
use larger visual relief, but bilinear sampling, bounds behavior, row-major
layout, and prop-placement semantics should be common.

Hard invariant: west/east are the sealed battle sides. Their presentation must
never be `open-fog`; choose `cliff`, `mountain`, `ocean`, or `wall` to match the
map's impassable terrain. North/south are the open directions and should default
to `open-fog`.

Height invariant: central battlefield relief should be smooth and modest. It can
make rolling ground, shallow valleys, dunes, banks, and low ridges, but should
not create impassable mid-map mountains unless the speed grid also marks that
terrain impassable. Flat maps are valid only when deliberately declared flat.

Movement invariant: this slice must prove soldiers can be rendered walking on
the slope without clipping. It does not add slope-based combat, vision, or
projectile behavior. If implementation makes height affect pathing or movement
cost beyond existing speed/roughness, add Rust scenario tests that drive a unit
over a slope through the public sim API and assert final position/cohesion.

Seating invariant: prop, entity, and scenery placement code must not recover
flat terrain by authoring fixture-local `z: 0`. It should sample the shared
height source or be explicitly declared as a flat fixture/map. Label anchors,
camera ground-plane comments, and non-placement math can still talk about zero
height when that is the coordinate convention rather than a prop seat.

Edge invariant: west/east blockers are enforced by terrain speed/pathing masks
and map bounds; the edge role only describes how that blocker is presented.
Tests should fail if a map declares a sealed side visually while the matching
terrain cells remain passable.

## Human Review Surface

Add a small debug/visual scene, recommended
`web/scenes/battle/battle-terrain-features.mjs`, that boots each quick-battle
map and asserts:

- feature counts by kind are nonzero where expected;
- feature centers stay inside the map bounds;
- west/east edge roles are sealed and north/south edge roles are open-fog for
  each quick-battle map;
- west/east edge terrain cells are mechanically impassable or outside movement
  bounds, matching their edge role;
- ground-cover style is present for every map and covers the full playable
  rectangle before local features are applied;
- generic height field is present for every map, has the same grid contract as the
  terrain grid, and has a nonzero but bounded elevation span for non-flat maps;
- `terrainHeightAt` samples smoothly enough for soldiers and props to sit on the
  terrain without visible stair-steps;
- forest/mud/rock debug overlays match visible terrain tint regions;
- micro rough samples exist on open ground but are sparse enough not to clutter.

## Verification

- Unit tests for `extractBattleTerrainFeatures` with a tiny fixture grid:
  forest blob, rock island, mud strip, empty field.
- Unit tests for edge-role validation: reject or flag maps where east/west are
  open or north/south are sealed without an explicit scenario reason.
- Unit tests for mechanical edge validation: sealed west/east roles must
  correspond to speed-0 terrain masks or explicit map bounds in the canonical
  terrain data.
- Unit tests for ground-cover defaults: grass maps and sand/desert maps always
  emit full-field cover, even when no local terrain tint exists.
- Unit tests for height sampling: bilinear samples match cell centers, off-map
  handling is deterministic, and non-flat maps have bounded slopes.
- Adapter tests for campaign and battle: campaign `TerrainField.heightAt` and
  battle terrain height exports match the shared sampler contract within their
  declared units/scale.
- Campaign polish fixture test: `polish-label-spacing` and
  `polish-green-swatch` props must use the shared campaign height sampler, not
  fixture-local `z: 0`, so they cannot render below raised terrain.
- Source audit test or checklist: source-side `z: 0`-style hits in prop/entity/
  scenery placement are either removed, sampled through `terrainHeightAt`, or
  documented as intentionally flat at the owning fixture/map boundary.
- A contract test or wasm smoke test proves `terrain_height_ptr` or equivalent
  exported height data stays aligned with width, height, cell, and origin.
- Catalog tests prove `BattleMapCatalogEntry` is the single source consumed by
  menu, battle launch, and visual scenes.
- Existing `web/scenes/battle/battle-minimap.mjs` still sees sim-sourced terrain
  and feature centers.
- `cargo test -p sim --test scenario_terrain` and
  `cargo test -p sim --test terrain_micro` stay green if Rust map/tint behavior
  is touched.

## Must Stay Green

- `packages/game-renderer/src/battle/terrainPass.ts` still renders old terrain
  quads while the 3D prop pass is not in place.
- `web/src/battle/scene.ts` still deep-links `?map=A|B` for existing verification
  harnesses.
- `web/scenes/system/battle-elevation.mjs` remains green and should become a
  regression gate for the real battle height source instead of only a lab route.
- The minimap world/debug contract does not lose terrain feature consistency.

## Feedback That Changes This Slice

If feature extraction is too expensive on full 600x400 grids, add a cached
downsample or per-tint connected-component pass. Keep the public feature output
the same so slice 03 can still consume it.
