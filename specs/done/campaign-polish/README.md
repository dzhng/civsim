# Campaign Polish (closed)

Historical run artifacts have been removed. References to experiments below
record past findings; they are not links to retained reports or captures.

## What shipped

The WebGPU campaign map of Italy reads as a living, legible strategy map rather
than a brown political overlay. Concretely, on the real campaign map today:

- City labels sit about one icon-height from their city model, even for inland
  towns perched on raised ground.
- Roads run unbroken from a city into each destination city — no spoke dies
  under terrain, a footprint, or draw order.
- Natural ground reads as green Mediterranean turf with organic variation; the
  faction overlay is a separate ownership wash over the *same* geometry.
- Mountain ranges read as broad, varied massifs that clear cities, roads, and
  labels instead of a wall of identical cones; wet regions carry visible
  forests while dry Latium stays grassland.
- Small ox-less carts ride the roads as deterministic road-life.
- Hill-towns beside a massif (Alba Fucens, Corfinium) sit on a green foot, not
  embedded in a bare brown mass.

The work was driven entirely by four user screenshots (see
[Visual provenance](#visual-provenance)). It is campaign-only; the WebGPU
foundation it builds on closed separately in
[../renderer-skinned-crowd-foundation/README.md](../renderer-skinned-crowd-foundation/README.md).

## Why it works this way

**Terrain is read back from the painted background raster, not a second data
pipeline.** Height, land mask, moisture, forest, and rock are all classified out
of the campaign background PNG by its known palette. There is no hand-authored
elevation and no extra mapgen pass. The price is a color contract: the palette
in `crates/mapgen/src/raster.rs` and the classifier in
`web/src/campaign/terrain.ts` point at each other — recolor one and you must
recolor the other.

**Height is the single lever that couples terrain color, props, and clearance —
so the readability fixes all reach for it.** The rock-brown tint is purely a
function of height (`rock = smooth01((height - 6) / 16)`, `terrain.ts`), forest
is suppressed by that rock value, and mountain-prop spawn scores off height too.
This coupling is *why* the final hill-town fix is one carve of the heightfield
rather than three separate color/prop/clearance patches: lowering the relief
around a city greens its apron, de-rocks the color, and thins props near it at
once. It is also the trap that produced the bug — see the divergence below.

**Mountains are restyled props over rock-shaded terrain — not pure relief, not a
prop dump.** Pure relief was evaluated first (the explicit gate): with mountain
props removed the map is a nearly flat tan plain, because the heightmap's relief
is too gentle to carry ranges at the gameplay camera. A naive prop dump on every
high cell buries cities and roads. The shipped answer is a few deliberate broad
multi-hump massif meshes with per-instance yaw over a rock-shaded surface, plus
wide city/road clearance so no city ends up inside a mass.

**Labels are relief-aware because labels and models project from different
heights.** City *labels* anchor at the flat `z=0` ground; city *models* sit at
terrain height. An inland city's model therefore rides up over its raised
ground, and a fixed pixel offset left two-to-three label-heights of empty grass
under it. The offset subtracts the model's measured screen rise so the gap is a
constant ~one label-height whether the town is perched or coastal-flat.

**Synthetic fixture stages are exempt from the real-map readability heuristics.**
The terrain clearance, the wide scenery aprons, and the border draw all skip
controlled stages, which place their own controlled terrain and props. The
attribution string is the single source of truth (`isControlledStage`), so the
renderer and the terrain field agree on what counts as a fixture and never
reshape a workbench scene.

### Where the build diverged from the plan

- **City-aware terrain clearance was the missing half of "clearance."** Slice 4
  cleared mountain *props* around cities but left the *heightfield* under them
  untouched. Because color and props both read off height, the cleared zone
  stayed painted bare rocky-brown with no relief — so Alba Fucens / Corfinium
  read as embedded in a flat brown massif. The first acceptance pass
  rationalized this as a geographically-correct "town at the mountain foot" and
  logged it as optional polish. That stance was **reversed**: it was a real
  readability defect, fixed by giving the height grading a city vote (the
  city-aware clearance block in `terrain.ts`) and confirmed by a fresh unbiased
  critique reading the towns as on clear ground. Before/after:
  `assets/acceptance/03c-hilltown-apron-{before,after}.png`.
- **The mountain-crop metric had to be recalibrated, not the mountains.**
  Greening the grass *dropped* the "mountain ratio" in the terrain-feature crops
  without removing a single rock prop — the old warm-stone classifier had been
  counting tan plains as mountain. The floors were lowered to the true rock
  content and the green-ratio floor raised; the mountains read *more* clearly
  against green, not less.
- **Bespoke relief/forest/cart workbench fixtures were not built.** The
  `alignment` fixture doubles as the relief/clearance witness and the wet
  Cisalpine region as the forest witness; the cart was reviewed on real road
  geometry at frozen frames rather than through the battle-unit model-sheet
  infra.

## Principles & invariants

These must keep holding; violating one silently reintroduces a shipped bug.

- **Cities and roads are ground truth.** Never move a city to satisfy terrain or
  water — fix the shared terrain/projection contract instead.
- **Height drives color, forest suppression, and prop spawn.** Any change to the
  height grading is also a change to terrain color and scenery density. Judge all
  three together.
- **The painter ↔ classifier color contract** (`raster.rs` ↔ `terrain.ts`) is
  load-bearing; the two must be recolored together.
- **Natural green is judged with the faction overlay OFF.** The faction view is
  an ownership wash over identical road/city/cart/coast geometry and must never
  become the natural baseline.
- **Controlled stages are never reshaped by real-map heuristics** — terrain
  clearance, scenery aprons, and border draw all gate on `isControlledStage`.
- **Scenery yields to cities, roads, and labels.** Mountains get the widest
  apron; carts are the one prop allowed on the road, and even they skip the last
  few km into a city and obey fog.
- **Determinism is the snapshot's basis.** Carts are a pure function of frozen
  scene time; a snapshot pins every prop. A double-run re-renders byte-identical.
- **Metrics are guardrails, not goals.** Green ratios, mountain ratios, and
  road-continuity probes are floors that stop regressions; whether a scene is
  *accepted* is decided by an unbiased `screenshot-critique`, never a number.

## Pointers into the code

- **Terrain field, biome, and city-aware height clearance** —
  `web/src/campaign/terrain.ts` (`TerrainField`; mountain height grading; the
  rock channel `rock = smooth01((height - 6) / 16)`; the city-aware clearance
  block that carves a lowland apron ~12 km out, restored by ~34 km).
- **Stage gate** — `isControlledStage` in `web/src/campaign/data.ts` (shared by
  the renderer and the terrain field).
- **Natural terrain color/grade** — `naturalCampaignColor` in
  `packages/game-renderer/src/campaign/mapPass.ts` (grass moisture ramp, the
  low-frequency `meadow` term, the height-driven rock tint).
- **Relief-aware labels** — `cityLabelOffset` / `cityReliefRisePx` in
  `web/src/campaign/renderer.ts`.
- **Scenery selection and clearance** — `buildCampaignSceneryCandidates`,
  `selectRegionalScenery`, `clearCampaignStaticScenery`, `citySceneryClearance`,
  `roadSceneryClearance`, `CAMPAIGN_MAX_MOUNTAINS` in `renderer.ts`.
- **Road-life carts** — `campaignRoadCarts` and `CART_SPACING_KM` in
  `renderer.ts`, riding `smoothRoadCenterline` (defined in `mapPass.ts` and
  shared with the road pass, so carts sit on the drawn centerline); meshes
  `buildCartMesh` / `buildMountainMesh` in
  `packages/game-renderer/src/models/shared/sceneryPropModels.ts`.
- **Scenery plumbing + per-instance yaw** —
  `packages/game-renderer/src/campaign/sceneryPass.ts` (the `CampaignSceneryKind`
  union, including `'cart'`; the free `yaw` instance slot).
- **Gates / scenes** — `web/scenes/campaign/campaign-lod.mjs` (real-map LoD
  bands; `CENTRAL_ITALY_ROAD_PAIRS` including Roma→Ostia/Portus; terrain-feature
  crops; green-ratio floor; mountain/tree/rock density gate),
  `campaign-polish-roads.mjs` (road-continuity fixture, `?campaign=alignment`,
  and the `sceneryStats.carts >= 1` road-life gate),
  `campaign-polish-markers.mjs` (label-spacing + green-swatch fixture,
  `?campaign=test`). Committed baselines live in `web/shots/campaign/`.

## Dead ends

- **Pure terrain relief for mountains.** Too gentle at the gameplay camera —
  stripping props leaves a flat tan plain. Rejected in favor of restyled props
  over rock-shaded terrain.
- **A prop on every high cell.** Buries cities and roads; replaced by a capped,
  region-balanced selection with wide city/road aprons.
- **Accepting embedded hill-towns as "the mountain foot."** The first acceptance
  pass logged this as fine; it was a real defect and was fixed with terrain
  clearance.

## Residual (open, lower priority)

The multi-hump mountain *mesh* still reads somewhat flat at the steep top-down
regional zoom — a zero-context critic reads it as a painted shape there. The
prior critique accepted the mesh at the gameplay tilt ("geological, not
geometric"). Improving its silhouette/material at shallow camera angles is a
separate terrain-art item; it is no longer entangled with city readability,
which the terrain clearance resolved.

## Visual provenance

The standard the work was held to. Two trails: the requirement (what "done" had
to fix) and the result (what it looks like now).

**The requirement — user feedback** (`assets/user-feedback/`, four real
in-game screenshots the user supplied; see
`assets/user-feedback/README.md` for the
per-image defect list):

- `01-rome-ostia-label-road.png` — coastal Ostia/Portus risked losing its label
  and road.
- `02-city-label-distance-tibur.png` — labels floated far from their icons.
- `03-mountains-roads-trees.png` — brown ground, chunky cones, a city in the
  mountain mass, no trees, no carts.
- `04-rome-south-road-cutoff.png` — a road leaving Rome died before the next
  city.

**The result — accepted crops** (`assets/acceptance/`), each tied to the
feedback it answers:

- `01-ostia-label-road.png`, `02-tibur-label-spacing.png` — labels seated, Ostia
  road arrives.
- `06-natural-green.png` — natural ground reads green.
- `03-apennines-mountains-forest.png` — varied massifs + visible forest.
- `04-rome-south-road-continuity.png` — spokes paint unbroken into each city.
- `05-carts-on-roads.png` — deterministic carts on real roads.
- `03b-hilltown-clearance.png` — the pre-fix hill-town reading (towns on the bare
  massif), kept as the "before" reference.
- `03c-hilltown-apron-before.png` → `03c-hilltown-apron-after.png` — the
  city-aware terrain clearance, matched framing: Alba Fucens / Corfinium move
  from the bare brown lobe onto a green foot.
