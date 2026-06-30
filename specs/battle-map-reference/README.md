# Battle map — highland-valley reference match

Make the battle map read like the reference vista in
`assets/target-battle-map.png` **as closely as possible while staying inside the
`aesthetics` skill's Bronze-Age Aegean register.** Build the look bottom-up from a
single grass primitive through terrain relief, ridge backdrop, and atmosphere, to
a composed master shot judged against the reference.

## Next Agent Prompt

**Status:** Slices 00, 01, and 02 landed in `codex/battle-map-reference`
(2026-06-30). Next pickup is Slice 03.

Slice 00 now has a real side-by-side workbench:
`visualizations/target-vs-current.html` points at the committed
`web/shots/battle/terrain-3d/coastal-scrub.png` baseline instead of a placeholder,
and records the two-preset decision path: neutral albedos, `overcast-foggy` as
`highland-valley`'s default, and `golden-hour` for Aegean parity.

Slice 01 now wires the production battle camera through a pure
`web/src/battle/cameraRig.ts` curve. Zoom drives pitch, target offset, perspective,
and exported `zoomT`; the shared `Camera` projection now matches the existing
`cameraUniform.ts` perspective math so WebGPU rendering, picking, and DOM overlays
agree. The focused `battle-camera-zoom` scene publishes top/mid/vista camera stats,
keeps visible formations in every stop, and snaps the contact sheet at
`web/shots/battle/battle-camera-zoom.png`. The final vista endpoint is deliberately
more oblique than the old fixed camera (`pitch=1.02`, `perspective=0.006`), while
the mid zoom remains in the playable RTS pitch band.

Final verification:
- `node --experimental-strip-types --test tests/cameraRig.test.ts`
- `./node_modules/.bin/tsc --noEmit`
- `npm run build`
- `VERIFY_URL=http://localhost:5174 VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome node scene.mjs battle-camera-zoom battle-renderer-visual battle-input`

Local verification notes: the default SwiftShader WebGPU path reported
`requestAdapter returned no WebGPU adapter`; the hardware Chrome path passed.
`npm run build:wasm` could not regenerate `web/src/wasm` because this machine's
Homebrew Rust install lacks `wasm32-unknown-unknown`, so verification used an
ignored wasm build copied from the sibling checkout.

Slice 02 now owns the reusable grass primitive and a flat-field workbench. The pure
mesh builder lives in `packages/game-renderer/src/models/shared/grassModels.ts`;
`BattleGrassPass` lives in `packages/game-renderer/src/battle/grassPass.ts` and
draws instanced tuft meshes as `world-opaque` depth-writing geometry with a
fixed-phase wind uniform. The model-sheet gate is
`web/scenes/models/shared-grass-models.mjs`, producing
`web/shots/models/shared/grass/tuft.png` and `patch.png`. The battle workbench is
`web/scenes/battle/battle-grass.mjs`, producing
`web/shots/battle/grass/flat-field.png` and `wind-phase.png`; it also compares the
two fixed phases to prove the shader sway moves pixels deterministically. The
review-only wind GIF is
`web/shots/models/shared/grass/anim/flat-field.gif`.

Final Slice 02 verification:
- `node --experimental-strip-types --import ./tests/register-ts-extension-loader.mjs --test tests/cameraRig.test.ts tests/grassModels.test.ts`
- `npx tsc --noEmit`
- `npm run build`
- `VERIFY_URL=http://127.0.0.1:5174 VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome node scene.mjs shared-grass-models battle-grass`
- `VERIFY_URL=http://127.0.0.1:5174 VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome node scene.mjs renderer-lab-routes`
- `VERIFY_URL=http://127.0.0.1:5174 VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome node scene.mjs battle-camera-zoom battle-renderer-visual battle-input`
- `VERIFY_URL=http://127.0.0.1:5174 VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome node shots/models/scripts/grass-wind.mjs`

Screenshot critique accepted Slice 02 with no blockers. Non-blocking polish debt:
the tuft model-sheet ground slab clips hard on the left/bottom and leaves black
void; close/model-sheet scale has square ground mottling and thin blade aliasing;
the flat-field workbench is visibly a test slab in blue void. The grass itself
reads as dry yellow-olive Aegean scrub at game camera, and the patch/GIF are useful
review artifacts.

Slice 01 screenshot critique completed on the final camera contact sheet. It did
not find a Slice 01 blocker after the endpoint retune: the remaining
camera-specific complaint is that dense formations can still feel somewhat flat
inside their blocks. Record the rest as downstream visual debt, not camera wiring
debt:

- contact-sheet seams and the current map boundary read as review artifacts;
- units near trees have ambiguous tree/crowd depth ordering;
- unit contact shadows are weak relative to tree shadows;
- dense formations produce moire/barcode striping at the vista;
- small selection/marker pixels are low contrast;
- the current brown terrain feature is a blurry decal-like patch;
- grass/ground detail is soft and scale-blurry;
- roads, water, labels, and icon styling are not covered by this camera sheet.

**Next pickup:** start Slice 03 (grass over terrain). Wire `BattleGrassPass` into
the production battle renderer through the shared `TerrainHeightField`, but keep
the Slice 02 primitive/model-sheet gates as the shape contract. Do not fix the
listed unit, terrain-feature, water, road, or label debts inside grass terrain
integration unless the slice explicitly owns that surface.

Every visual slice (01–08) ends with two gates: a `screenshot-regression` baseline
snap **and** an unprimed `screenshot-critique` of the slice's hero shot against
`assets/target-battle-map.png` *and* the warm `references/battle-*.jpg` aesthetics
shots. A green snapshot proves *unchanged*, never *good*.

**Update this section before you end your pass** — move the status, record what
landed, and point at the next pickup slice.

### Global TODO

- [x] **Slice 00** — reference workbench + palette target lock (`slices/00-reference-workbench.md`)
- [x] **Slice 01** — zoom-coupled camera (`slices/01-zoom-coupled-camera.md`)
- [x] **Slice 02** — grass-blade primitive (`slices/02-grass-blade-primitive.md`)
- [ ] **Slice 03** — grass over terrain (`slices/03-grass-over-terrain.md`)
- [ ] **Slice 04** — terrain relief + ground grade (`slices/04-terrain-relief-grade.md`)
- [ ] **Slice 05** — ridge backdrop (`slices/05-ridge-backdrop.md`)
- [ ] **Slice 06** — sky, haze & weather presets (golden-hour ↔ overcast-foggy) (`slices/06-sky-and-haze.md`)
- [ ] **Slice 07** — distant water (`slices/07-distant-water.md`)
- [ ] **Slice 08** — reference-map compose + integration (`slices/08-reference-map-compose.md`)

## Goal & the central tension

The reference is a **cool, foggy Icelandic/Hebridean highland valley**: a dense,
waving, *cool meadow-green* grass field filling the lower third; smooth rolling
green hummocks in the midground; tall layered grey rock ridge-walls with pale
light/snow streaks receding into heavy white-grey haze; a cold water inlet on the
right mid-distance; a flat overcast pale grey-white sky. High-key, very low
contrast, strong aerial perspective.

At first glance this **collides** with the `aesthetics` skill — the warm golden-hour
Mediterranean north star (gold-to-blue sky, warm key, sun-bleached olive grass). But
the conflict is not real once you separate **material** from **light**:

**The cold reference and the warm aesthetics shots are the same world under two
different lighting/weather conditions, not two art styles.** (This is now written
into `aesthetics` itself — see `references/battle-overcast-highland.png` and the
"Lighting & weather is an environment" section.) So the reconciliation is:

- **Materials are neutral albedo.** Grass, rock, sand, water carry a base color tuned
  for neutral daylight; nobody bakes golden-hour amber *or* overcast grey into a
  material. (Measured proof: the aesthetics grass samples warm-dark `#858255` only
  because a low amber sun is on it — see Slice 00's compare board.)
- **The mood is a swappable environment preset** — sun color/elevation + sky gradient
  + fill + fog density. The reference look is the **overcast-foggy preset**; the
  classic Aegean look is the **golden-hour preset**. Same map, same assets, both
  in-register.
- **Composition/form still comes from the reference:** volumetric foreground grass,
  deep valley relief, layered receding ridge-walls, distant water, one continuous
  aerial-haze fade from blade to sky.

So "match the screenshot but still follow aesthetics" = **build the reference's
composition out of neutral assets, and light it with an overcast preset** that
`aesthetics` now explicitly blesses — while the *same* map under the golden-hour
preset reads as a sun-drenched Aegean field. Judge **albedo** against neutral light
and **mood** against the matching preset's reference (overcast-highland for this map;
the golden-hour `battle-*.jpg` for parity).

## Camera decision (David, 2026-06-30) — DECIDED

The battle camera's **pitch is coupled to zoom**: fully zoomed out is a top-down
tactical view; zooming in tilts the camera to look further out over the horizon;
fully zoomed in lands on the **reference's low oblique vista framing**. There is **no
separate static "vista camera"** — the reference comparison shot is the map captured
at full zoom-in. This is built in **Slice 01** and supersedes the original plan's
"don't change the gameplay camera" stance. The normalized zoom factor (`zoomT`) it
exports is the shared lever the grass (Slice 03) and haze (Slice 06) use to get lush
+ misty at the vista and clear at top-down.

## Grilling (resolve before/at Slice 00)

Ask one at a time; recommended answer in brackets.

1. **Lighting presets — how many, and which is `highland-valley`'s default?**
   The palette "conflict" is resolved by environment lighting (see central tension):
   neutral albedos lit by a swappable preset. *[Recommend: ship **two** presets in
   Slice 06 — `overcast-foggy` (this map's default, matches the reference) and
   `golden-hour` (parity with the aesthetics `battle-*.jpg`); lock the neutral
   albedos in Slice 00 against the compare board, judged under neutral light.]*
   **Blocking** — the albedo/preset split everything downstream inherits.
2. **New map, or restyle the existing three catalog maps?** *[Recommend: add one
   new catalog map `highland-valley` that composes the look, and let the reusable
   primitives (grass, ridge backdrop, sky) lift all maps. Don't break the three
   existing maps' identities.]*
3. **Grass: true blade geometry or camera-facing billboards?** *[Recommend: decide
   empirically in the Slice 02 workbench under a GPU-instance budget; lean
   instanced blade quads with vertex-shader wind.]*
4. **Deep valley relief — sim height, or render-only exaggeration?** *[Recommend:
   render-only — keep one height source (`terrainHeightAt`); raise only
   `verticalScale`/profile so soldiers, props, shadows, and cues stay seated; sim
   passability untouched.]*
5. **Legibility across the zoom-coupled camera.** Dense grass + heavy haze fight unit
   readability, and the camera now spans top-down → vista (see Camera decision).
   *[Recommend: grass density/height and fog depth key off `zoomT` — full at the
   zoom-in vista, suppressed toward top-down; at the **playable mid zoom** where
   units are actually micro-managed, units, the gold selection footprint, and
   trampled ground must stay legible. The vista is to admire, the mid zoom is to
   fight.]*
6. **Perf ceiling for added grass across the zoom range?** *[Recommend: hold the
   existing `full-game-rendering-performance` budget; grass gets a fixed instance
   cap + distance LOD, probed in Slices 02/03.]*

## Recon — measured facts (greppable seams)

WebGPU/WGSL renderer; every visual surface is a pass-per-file under
`packages/game-renderer/src/battle/`, wired in `web/src/battle/renderer.ts`, driven
by sim terrain read from wasm in `web/src/battle/scene.ts`.

- **Battle assembly seam:** `web/src/battle/renderer.ts` instantiates passes
  (`BattleGroundPass`, `BattleHorizonPass`, `CampaignSceneryPass` reused for
  battle) and `applyTerrain()` builds the height field + features + scenery and
  pushes to each pass. New passes (grass, sky) wire in here and into the ordered
  draw list with the correct render-graph role/phase/depth.
- **Ground:** `packages/game-renderer/src/battle/groundPass.ts` — `BattleGroundPass`:
  a height-displaced grid mesh, per-cover base color `GROUND_COVER_COLOR`, a
  fragment shader that fakes blades with multi-scale `fbm` noise + churn. **There
  is no grass geometry today — "grass" is a procedural color field.** This is the
  primitive Slice 02 builds. A warm grade (`warmKey`/`coolFill`) is baked in today —
  **Slice 06 moves it into the swappable environment preset** so it stops being
  hardcoded.
- **Backdrop / mountains:** `packages/game-renderer/src/battle/horizonPass.ts` —
  `BattleHorizonPass`: edge blockers. Mountains = three procedural `peak()` rows
  with a fog haze-mix toward `HAZE` and `STONE`/`STONE_TOP` constants; ocean = one
  graded apron quad; wall = rampart. Edge-bound and shallow — far from the
  reference's deep overlapping ranges.
- **Shared height contract (SACRED):** `packages/game-renderer/src/terrain/heightField.ts`
  — `TerrainHeightField` + `terrainHeightAt` bilinear sampler; `verticalScale` is
  the render exaggeration knob. Comment: *"Matches `sim::Terrain::height_at` so the
  renderer and the sim agree."* Soldiers, shadows, props, and cues **all seat
  through this one field.**
- **Feature / scenery streams (deterministic):** `terrainFeatures.ts`
  (`extractBattleTerrainFeatures`, `BattleEdgeRoles`, `BattleGroundCover`,
  `edgeSealMismatches`) and `terrainScenery.ts` (`featuresToBattleScenery`). Same
  grid + seed → same instances. Scenery meshes come from
  `models/shared/sceneryPropRegistry.ts`, built via `models/shared/meshBuilder.ts`
  (`box`/`peak`/`gradQuad`), instanced by `CampaignSceneryPass` — the existing
  instanced-mesh pattern a grass pass mirrors.
- **Map presentation:** `packages/game-renderer/src/battle/mapCatalog.ts` —
  `BATTLE_MAP_CATALOG` (3 maps today), per-map `edges` + `groundCover`,
  `buildBattleTerrainPresentation`. The new `highland-valley` map registers here.
- **Camera:** `web/src/battle/scene.ts` + `web/src/battle/cameraRig.ts` — an
  RTS-style `Camera` with zoom-coupled pitch, target offset, perspective, and
  exported `zoomT`. The gameplay camera is presentation/input only; it has no
  effect on the sim.
- **Sky:** **no sky pass.** The background wash is the ground-plane terrain shader
  in `frameShell.ts` (warm-olive + an `aerialStrength` haze); above the horizon
  line the flat clear color shows. `cameraWgsl.ts` has **no** fog / aerial-
  perspective term — ground/grass/scenery don't fade with distance; only
  `horizonPass` does its own per-vertex haze. The reference is *dominated* by
  aerial perspective, so a real graded sky + a shared fog term are genuine gaps.
- **Render-graph rules (must stay `ok`):** `renderGraph.ts` — frame phases
  `background → world-depth → overlay`; each pass declares `role` + `depth`; phase
  order can't go backward. Grass = `world-opaque` (writes depth, before crowd);
  sky = `background-underpaint`; haze = `overlay-effect`. Camera contract:
  `shared-world-camera-wgsl`.
- **Legacy, off the production path:** `packages/game-renderer/src/battle/terrainPass.ts`
  (2D painted-quad `BattleTerrainFixture`) is **not** wired into `renderer.ts`
  (ground + horizon + scenery are). Don't build the vista there; it would be
  invisible.
- **Verification harness:** scenes in `web/scenes/battle/*.mjs` (model:
  `battle-terrain-3d.mjs`) — route `renderer/battle-terrain-3d?gate=<map>`, read
  `window.__rendererLabStats.stats`, pixel metrics (`groundMetrics`), `ctx.snap`.
  Routes asserted in `web/scenes/system/renderer-lab-routes.mjs`; handlers in
  `web/src/battle/scene.ts`; snapshots under `web/shots`. Gated behind
  `VERIFY_GPU=1`. Sim correctness stays in `cargo`. `screenshot-regression` owns
  the snap mechanics; `screenshot-critique` is the mandatory unprimed gate on every
  visual slice.

## Firewalls / sacred contracts (every slice obeys)

- **One height source.** Never fork `terrainHeightAt`; relief changes go through
  `verticalScale`/profile so everything that seats on the ground stays seated.
- **Edge-seal honesty.** `edgeSealMismatches` stays empty; presentation never
  invents or removes passability.
- **Render-graph + camera contracts.** New passes keep `compileRenderGraph` green
  and use the shared camera WGSL with the correct phase/role/depth.
- **Determinism.** Grass / feature / scenery scatter is seed-stable so snapshots
  are deterministic.
- **Perf.** Hold the `full-game-rendering-performance` budget; grass is capped +
  LOD'd.
- **Palette discipline.** The battle's seven `aesthetics` rules are the grade
  authority. (Campaign two-color rule is out of scope.)
- **Lighting is an environment, not a material.** Every material (grass, rock, sand,
  water, soldiers) stores a **neutral albedo**; the warm/cool mood comes from a
  swappable sun+sky+fill+fog **environment preset** (Slice 06). Never hardcode
  golden-hour *or* overcast into a base color — if a render looks wrong, fix the
  preset, not the albedo. (Mirrors the new `aesthetics` "Lighting & weather is an
  environment" section.)
- **Camera is presentation only.** The zoom-coupled camera (Slice 01) is a pure
  function of zoom — deterministic so snapshots reproduce — and never touches the
  sim, pathing, ranges, or `terrainHeightAt`. It must keep gameplay legible across
  the playable mid-zoom band, not only at the extremes.

## Slice graph

```
00 reference-workbench ─ target lock, no render change
        │
01 zoom-coupled-camera ─ top-down (out) → reference vista (in); exports zoomT
        │                  (independent of the grass ladder — build early; sets the
        │                   framing every later slice is judged in)
        ▼
02 grass-blade-primitive ─ pure mesh builder + flat-field workbench
        │
03 grass-over-terrain ─ instanced on real maps + LOD/perf; density keyed to zoomT
        │
04 terrain-relief-grade ─ deeper valley via verticalScale/profile
        │
05 ridge-backdrop ─ layered aerial-perspective mountains
        │
06 sky-and-haze ─ sky + shared fog + swappable weather preset   ◀ mood lever
        │              (overcast-foggy ↔ golden-hour over neutral albedos;
        │               overcast render compares straight to the reference photo)
        │
07 distant-water ─ hazed turquoise inlet (neutral albedo + preset tint)
        │
08 reference-map-compose ─ new catalog map + full battle + master compare @ zoom-in
```

`01` (camera) is independent — it can land any time, but build it early because it
establishes the vista framing every later visual slice is critiqued in. `02 → 03` is
the only hard visual coupling (primitive before it's instanced); `04/05/07` are
independent of each other once the field exists; `06` should land before `08` because
it sets the grade everything is judged in. Each slice leaves a runnable artifact and
its own green gate before the next depends on it.

## Materialize / out-of-band

This is a multi-slice, asset-heavy visual feature → folder form (this directory),
not a single `.md`. Once all slices ship, `close-spec` archives this plan to
`specs/done/` and rewrites it from a build ladder into a durable rationale record.
