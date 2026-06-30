# Slice 03: Battle 3D Terrain Props

## Contract

Battle terrain types have proper 3D/model-backed representation at gameplay
camera pitch:

- west/east map boundaries read at a glance as impassable cliffs, mountains,
  ocean, or wall terrain;
- north/south horizons read as open country continuing into heavy fog;
- the entire playable field has grass, yellow grass, scrub, or sand coverage
  before local terrain features are layered in;
- the playable field has subtle height variation: rolling rises, shallow dips,
  dunes, banks, or low ridges, not a perfectly flat plane unless the selected
  map is intentionally flat;
- soldiers, shadows, and props sample the same height source, so soldiers walk
  uphill and scenery sits on the terrain without clipping;
- forests read as tree and scrub clumps, not just green tint;
- rocks and walls read as stone geometry/prop silhouettes;
- mud and scree/rough ground read as churned patches with sparse physical cues;
- micro roughs read as tiny scattered stones/tufts, sparse enough to avoid
  visual noise.

## API Seam

Add a battle scenery pass that consumes the slice 02 feature stream and the
shared prop models from
`packages/game-renderer/src/models/shared/sceneryPropModels.ts`.

Recommended locations:

- `packages/game-renderer/src/battle/sceneryPass.ts`
- `packages/game-renderer/src/battle/terrainFeatures.ts`
- `packages/game-renderer/src/terrain/heightField.ts` or equivalent generic
  sampler shared by battle terrain mesh, soldier elevation, shadows, prop
  placement, campaign terrain/scenery, and future vision/projectile systems
- `packages/game-renderer/src/battle/horizonPass.ts` or an equivalent terrain
  backdrop path for side cliffs/ocean and north/south fog
- `packages/game-renderer/src/renderGraph.ts` role entry for battle scenery if
  the frame graph needs an explicit mesh bucket.

The pass should keep instancing deterministic. It can share mesh-building code
with the campaign scenery pass, but battle-specific scale, density, lighting,
and culling belong in battle code.

## Human Review Surface

Add/update battle visual scenes:

- `battle-terrain-west-east-blockers`: camera crops of each map's sealed sides;
  must show cliffs, mountains, ocean, or walls and publish stats proving the
  matching terrain edge cells are impassable or outside movement bounds.
- `battle-terrain-north-south-fog`: camera crops looking along the open
  directions; must show fogged open distance without apparent hard walls.
- `battle-terrain-ground-cover`: grass/yellow-grass/scrub/sand coverage samples
  for every map style.
- `battle-terrain-rough-and-micro`: forest, mud, scree, rock, and micro-rough
  cue samples with bounded prop counts.
- `battle-terrain-elevation-placement`: soldiers, shadows, and shared props
  seated on rolling terrain, backed by route stats for elevation span and shared
  sampler agreement.
- `battle-terrain-features`: a debug summary scene can compose the above checks
  for each battle map.
- existing battle scenes such as `battle-renderer-visual`, `battle-minimap`, and
  `battle-selection` should continue to show units over terrain without overlap
  or depth artifacts.
- a model-sheet-style static prop review under
  `web/shots/models/battle/terrain/` if any terrain cue is battle-only.

Visual target: warm, sparse Mediterranean scenery. Forest edges should be clear
for gameplay, and open ground should not become decorative clutter.

Use `specs/battle-experience/assets/edge-cliffs-grass-reference.png` for the
side-edge and grass-density read: high hazy blocker silhouettes on sealed sides,
low-contrast distance fog on open directions, and ground covered with layered
grass blades/tufts rather than isolated green spots. Adapt color to the map:
olive/yellow summer grass for Aegean fields, paler straw for dry plains, and
sand with sparse scrub for desert maps.

Use that same reference for relief amplitude: the field should have visible
depth and soft undulation without turning the playable center into mountains.
The renderer may exaggerate tiny meter-scale height for readability, but the
terrain data should remain plausible enough for later vision and ballistic
systems to consume.

## Verification

- `VERIFY_GPU=1 node scene.mjs battle-terrain-features battle-minimap` from
  `web/`.
- `VERIFY_GPU=1 node scene.mjs battle-terrain-west-east-blockers battle-terrain-north-south-fog battle-terrain-ground-cover battle-terrain-rough-and-micro battle-terrain-elevation-placement`
  from `web/`.
- Screenshot checks should include content metrics for foliage/stone/mud pixels
  and basic non-overlap checks around unit deployment lanes.
- Screenshot checks should include edge-direction assertions: camera views or
  crops looking east/west contain sealed blocker silhouettes, while north/south
  crops contain fogged open distance without apparent hard walls.
- Screenshot checks should include full-field ground-cover metrics for grass or
  sand, not just local terrain-feature pixels.
- Screenshot or route stats should prove non-flat maps have visible, bounded
  terrain relief and that soldiers/shadows/props share sampled elevation.
- `VERIFY_GPU=1 node scene.mjs battle-elevation` should stay green after the
  production battle heightmap replaces the current lab-only relief source.
- If new shared prop variants are added, re-run the slice 01 shared prop sheet.
- Inspect generated PNGs against the Bronze-Age Aegean references before
  blessing.
- Every committed battle terrain shot passes an unbiased screenshot-critique
  pass (see the Review Map in the feature README) before it is accepted; critic
  findings are fixed or justified in writing.

## Must Stay Green

- Battle frame graph depth ordering: soldiers should occlude/stand among terrain
  props correctly, and terrain props should not overpaint HUD/minimap overlays.
- Movement/pathing blockers must line up with visible sealed east/west edges.
- Soldier feet, contact shadows, missiles-at-origin if rendered, and terrain
  props must use the shared sampled height source. No duplicate battle-only
  visual height math.
- No prop/entity/scenery placement code should use hard-coded `z: 0` as a
  terrain seat. If a fixture is intentionally flat, declare that at the fixture
  or map boundary and keep placement code height-aware.
- Campaign height sampling must keep working through the same generic sampler or
  an explicit adapter, so this slice does not fork battle and campaign terrain
  placement semantics.
- Selection footprints remain readable and warm gold over terrain.
- Existing battle performance scenes do not regress from unbounded prop counts.

## Feedback That Changes This Slice

If 3D props make dense forest fighting unreadable, reduce inner-forest density
and preserve stronger edge silhouettes. Gameplay clarity wins over literal
forest fill.
