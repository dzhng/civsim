# Battle Experience — closed

## What shipped

Battles render as authored places rather than flat sim test fields:

- a rolling 3D ground — a height-displaced grid mesh with full-field ground
  cover (green / yellow / scrub grass, or sand), multi-scale grass noise, and
  earthy ground churned into trodden mud where the terrain is dark-brown;
- shared 3D scenery (trees, rocks, mountains, carts) drawn from one prop
  registry and seated on the terrain height, with forests filled to a dense
  canopy;
- sealed west/east edges that read at a glance as the blocker the sim enforces —
  a receding hazed cliff/mountain range, a continuous graded sea, or a faced
  crenellated wall — while north/south fade open into haze;
- soldiers, shadows, ground, and props that all sample one shared height field,
  so units ride the surface and nothing clips;
- three quick-battle maps (RiverAndCrags, WalledPlain, CoastalScrub) and a
  Custom Battle setup flow where the player picks a map and builds two armies
  under a gold budget and the 20-unit campaign cap.

Canonical terrain height lives in the Rust sim; the renderer samples it. The
height channel is presentation-and-seating only — no movement, vision, or
ballistics code reads it — so the golden determinism hash is untouched.

## Why it works this way

**Height is a shared sampler, owned by the sim, not the renderer.** A battle
soldier, a campaign road, a prop, a shadow, and any future vision/projectile
system must be able to ask "how high is the ground here?" through the same small
API. So the canonical data is a `height` channel on `sim::Terrain` (bilinear,
edge-clamped `height_at`), exposed over the wasm boundary, and mirrored in TS by
`TerrainHeightField` + `terrainHeightAt`. Making the renderer the source of
truth would have stranded campaign and the later gameplay systems; making it
battle-only would have forced a second sampler for campaign. The contract is
deliberately tiny so each surface can pick its own scale and generation.

**Height seats and renders; it does not yet play.** The height channel feeds
rendered elevation and asset seating only — no movement, vision, or ballistics
code reads it. (Movement still reads the separate terrain speed/roughness
channels exactly as before; this feature added no new gameplay read of height.)
High-ground combat, line-of-sight, and projectile arcs are explicitly deferred;
the heightmap is shaped so they can consume it later. Because movement reads no
height, the golden determinism hash is untouched.

**Relief is gentle and exaggerated only for the eye.** The sim paints a few
metres of rise over a field thousands of metres wide — tactically readable,
never a mountain in the lane. The production renderer multiplies it by
`RELIEF_EXAGGERATION` (1.6) so it reads at the gameplay camera; the
`battle-terrain-3d` lab route pushes 2.6 to make the rolling shape obvious in
review. A critic calling the gameplay ground "flat" is seeing the intended
subtlety, not a bug — the seating is proven numerically, not visually (see
invariants).

**Edge impassability is mechanical; the cliffs are presentation.** West/east are
sealed by the sim's speed/pathing masks and map bounds. `horizonPass` only
*draws* that fact. The two must never disagree, so edge roles are derived from
the same terrain the sim enforces, and the catalog declares them in one place.

**One catalog, one prop registry — no parallel metadata.** Map traits (edge
roles, ground cover, ids, labels) live in `BATTLE_MAP_CATALOG`; the menu and
quick-battle code consume it. Scenery meshes live in `SCENERY_PROP_MODELS` so
battle and campaign reference one source instead of copying builders.

**Quick battle budget is 15,000 gold, not 10,000.** At current unit costs 10k
makes a 20-slot balanced army feel artificially cramped; 15k lets the cap be the
real constraint. Unit costs were a scope firewall — quick battle consumes
`contract::unit_cost` as-is.

**Forest density scales with area, not radius.** Tree count linear in radius
read as a sparse scattering for any real wood; scaling with radius² (capped)
fills the canopy. **Mud churn keys on brown AND dark** so the dry yellow/scrub
covers (also warm) stay smooth — only genuinely dark-brown mud cracks. **Scenery
stone is tinted cool blue-grey** at the source because the scenery shader warms
lit faces, so a neutral base would read tan.

**Every visual baseline passes an unbiased screenshot-critique before it is
accepted** — a fresh sub-agent told only the surface and the image, never the
intended answer. The author's own eye and the pixel gate are not a substitute.
This rule was added mid-feature after critiques caught a table-like cart, a
lollipop broadleaf, tan stone, and frame-like edges; it now governs every shot
the feature touches.

## Invariants — what must stay true

- **One height field for everything.** Ground mesh, props, soldiers, and shadows
  must all sample the same `TerrainHeightField`. The elevation gate asserts each
  soldier's seated elevation equals the sampled height (`soldierElevationMatches`
  in `battle-terrain-elevation.mjs`); if a surface grows its own height source,
  feet float or sink.
- **Visible boundary == mechanical boundary.** A sealed edge must look sealed and
  an open edge must look open. Presentation may never contradict the speed/pathing
  masks.
- **Height is seating/render only.** Adding high-ground bonuses, vision blocking,
  or projectile deflection here would silently change battles and break the
  golden hash — that is a separate, later feature.
- **No `z: 0` seating shortcuts.** Prop/entity/scenery placement samples terrain
  height. Zero-height literals are allowed only for documented camera/label
  anchors, coordinate math, or maps explicitly declared flat.
- **Depth-writing world passes precede read-only decals** in the battle frame
  graph (ground/scenery/crowd before shadow/cue decals), or decals z-fight.
- **Map traits have one home** (`BATTLE_MAP_CATALOG`); shared meshes have one home
  (`SCENERY_PROP_MODELS`). UI and passes consume, never redeclare.

## Pointers into the code

- **Sim (canonical height + maps):** `crates/sim/src/terrain.rs` (`height_at`,
  `add_rise`/`add_ridge`), `crates/sim/src/maps.rs` (per-map relief +
  `MapId::CoastalScrub`), `crates/contract/src/lib.rs` (`PaintOp::Rise`),
  `crates/game-wasm/src/lib.rs` (`terrain_height_ptr`). Pinned by
  `crates/sim/tests/terrain_height.rs` (sampling/edge/relief; golden untouched).
- **Renderer terrain:** `packages/game-renderer/src/terrain/heightField.ts`
  (`TerrainHeightField`, `terrainHeightAt`), `battle/terrainFeatures.ts`
  (deterministic feature + edge-role extraction, `edgeSealMismatches`),
  `battle/mapCatalog.ts` (`BATTLE_MAP_CATALOG`), `battle/groundPass.ts` (rolling
  ground + mud churn), `battle/horizonPass.ts` (sealed-edge blockers),
  `battle/terrainScenery.ts` (`TREES_PER_AREA` forest fill).
- **Shared props:** `packages/game-renderer/src/models/shared/sceneryPropRegistry.ts`
  (`SCENERY_PROP_MODELS`) over geometry in `sceneryPropModels.ts`.
- **Live game wiring:** `web/src/battle/renderer.ts` (`setTerrain` cutover,
  `RELIEF_EXAGGERATION`), `web/src/battle/scene.ts`,
  `web/src/battle/quickBattleCatalog.ts` (`QUICK_BATTLE_GOLD`,
  `QUICK_BATTLE_MAX_UNITS`), `web/src/menu/quickBattleSetup.ts`,
  `web/src/main.ts`.
- **Gates:** `web/scenes/battle/battle-terrain-{features,3d,blockers,elevation}.mjs`,
  `web/scenes/models/shared-prop-models.mjs`.
- **Docs:** `docs/battle-terrain.md` (ownership + the seating contract).

## Dead ends & divergences

- **Sealed-edge seam (deferred).** The horizon blockers were rebuilt — a
  receding hazed back-ridge that fills the void behind the front peaks, one
  continuous graded sea (its near colour matched to the field water tint so no
  stripe), and a faced wall with a base course — which fixed the white-void and
  stacked-band readings. What remains: the map's own rock/dirt impassable margin
  reads as a thin transition seam where turf meets the blocker. The blocker
  geometry seats *below* ground, so it cannot hide that ground-edge ring;
  softening it is a terrain-edge-blend job in the ground pass, not the horizon.
  A fresh critic still judges the stylized low-poly blockers harshly at the
  grazing edge camera. Left for a later pass; non-blocking.
- **Baseline provenance migrated to hardware.** The canonical headless baseline
  device is SwiftShader (per `web/shots/README.md`), which this Mac lacks, so the
  committed baselines were re-blessed on the hardware/Metal adapter
  (`VERIFY_GPU_ADAPTER=hardware`, deterministic 0px there). CI needs a one-time
  SwiftShader reconciliation. Inherently-animated scenes (smoke, projectiles,
  AI-driven motion) and the `battle-input` freeze test still diff on the hardware
  adapter regardless of this work — confirmed pre-existing by reverting the
  source and re-running (identical diff magnitude), not regressions.
- **The relief "flatness" finding is justified, not fixed.** See "Why" — the
  relief is gentle by design; bumping `RELIEF_EXAGGERATION` is a knob, not a bug.

## Visual provenance

`assets/edge-cliffs-grass-reference.png` — David's uploaded reference (a
painterly landscape, not an in-game shot): grey-stone cliffs rising on one side
and dissolving into heavy atmospheric haze, sea glimpsed in the distance, and a
wide field of rolling green grass under an overcast sky. This image *is* the
requirement for the map-edge language. It drove three decisions: sealed sides
render as large hazy cliffs/mountains (not a fence); open directions fade through
distance haze over continuous grass; and the field carries gentle rolling
relief — dunes, banks, shallow dips — rather than a flat parade ground. The
shipped result is a stylized low-poly interpretation of this standard, which is
why the residual above is about how the stylized blockers read at the grazing
camera, not about whether the edge language exists.
