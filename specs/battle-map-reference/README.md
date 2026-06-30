# Battle map — highland-valley reference match

Make the battle map read like the reference vista in
`assets/target-battle-map.png` **as closely as possible while staying inside the
`aesthetics` skill's Bronze-Age Aegean register.** Build the look bottom-up from a
single grass primitive through terrain relief, ridge backdrop, and atmosphere, to
a composed master shot judged against the reference.

## Next Agent Prompt

**Status:** Slices 00, 01, and 02 landed. Slice 03's renderer
infrastructure landed in `codex/battle-map-reference` (2026-06-30), and the
earlier repair pass added a real reference-comparison shot plus a dense `zoomT=1`
vista grass mode. The latest pass moved that comparison off the old catalog
plateau and onto a deterministic render-lab `highland-valley` relief fixture
using the same `BattleTerrainGrid`/`TerrainHeightField` seam as the production
terrain route. Slice 03 and Slice 04 are still **not visually accepted**: the
fixture is closer to the right family of scene, but the target relationship still
fails. The latest pass added a fixture-only overcast sky/backdrop pass, cleaned
the reference-shot canvas capture so it no longer includes a page-background strip,
softened shared terrain/grass distance haze, and raised the reference vista grass
budget to `48k` tufts.

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

Slice 03 now wires grass onto the real battle maps. `BattleGrassPass` gained a
terrain-aware `setTerrain(...)` path that samples `BattleTerrainGrid` +
`TerrainHeightField`, rejects water/rock/wall/mud tints, seats every tuft through
`terrainHeightAt`, and reports mask/LOD stats (`eligibleCells`,
`blockedTintCells`, `invalidTintTufts`, `focusRadius`, `zoomT`). Production
`web/src/battle/renderer.ts` now creates the grass pass in `applyTerrain()`,
rebuilds it by quantized camera focus + `zoomT`, drives wind from the frozen/live
frame time, and draws `battle-grass` as `world-opaque` before
`battle-skinned-crowd`. The terrain route
`/renderer/battle-terrain-3d?gate=<map>` now includes grass on all three catalog
maps, and the gate asserts masked grass, world-depth ordering, blocked-tint
clearing, and a soldier seating sanity view.

The terrain grass deliberately remains sparse at playable map zoom so formations
and selection glow stay readable. The green grass palette is now anchored to the
Slice 00 neutral albedo chips (`#c0c178` near grass, `#99a05c` shadow/mid hummock),
and the terrain pass has a nonlinear dense vista mode keyed to the highest `zoomT`
range. Updated terrain baselines are
`web/shots/battle/terrain-3d/{river-and-crags,walled-plain,coastal-scrub}.png`.
The map-scale wind review artifact is
`web/shots/models/shared/grass/anim/terrain-field.gif`, generated by the same
`grass-wind.mjs` script that still writes `flat-field.gif`.

The reference-facing artifact now exists. `web/scenes/battle/battle-map-reference.mjs`
captures the current zoomed-in reference camera and writes
`web/shots/battle/map-reference/candidate-vista.png`,
`reference-comparison.png`, and `grass-crops.png`. It now requests
`/renderer/battle-terrain-3d?gate=highland-valley&view=reference`, a deterministic
render-lab highland fixture with cliff/water edge roles, `heightSpan` in the
Slice 04 readable band, terrain-masked dense grass, a reference-only overcast sky,
and fixture-only distant valley/ridge/water backdrop. The shot is intentionally a
diagnostic comparison against the target, not an acceptance baseline for the final
playable map.

**Current Slice 03 visual state — not accepted:** the candidate is much denser
than the old sparse-stubble shot and no longer hides behind unrelated
`terrain-3d/*` snapshots. The old flat catalog-map plateau blocker is reduced, but
the current candidate still reads as a close procedural field, not the reference's
misty valley panorama. The latest cleaned `compare-screenshots` metrics moved in
the right direction but are still failing: full-frame distance `0.46663`
(previously `0.49204`); foreground/midground world-crop distance `0.58006`
(previously `0.59845`); candidate world-crop edge energy is `3.25764x` the target,
which still matches the visible grass speckle and hard low-poly forms. Treat the
comparison verdict as **another pass needed**, not as a green Slice 03.

Neutral subagent review on the current reference/candidate pair says the images do
not show the same viewport/state/content. The candidate now preserves only the
rough subject relationship: grassy mountain-and-water vista. It is still a lower,
flatter, low-poly/game-rendered blockout with pyramidal mountains, broad flat grass
plane, hard-edged water/shore, flatter lighting, noisier grass, and much weaker
terrain structure, atmospheric perspective, and depth layering. Do not close the
slice until the neutral reviewer says the camera/content relationship is
comparable.

Repair path for the next pass:
- Keep iterating from the `highland-valley` fixture path; it is the current honest
  comparison surface until Slice 08 turns the composition into a real playable map.
- Fix the reference camera/composition and terrain forms first: the shot still needs
  a real valley drop, foreground hummock, non-pyramidal left cliff wall, and
  mid-distance right water inlet in the same relationship as the target before fine
  grass color/density can be judged fairly.
- Keep the sparse top-down/gameplay layer for unit readability, but make the
  zoom-in/reference view softer, less yellow, less stippled, and much less
  geometric.
- Use the existing side-by-side, crop artifacts, metric diff, and neutral reviewer
  on every iteration; do not accept a screenshot if the neutral reviewer still says
  the target relationship needs another pass.

Previous broad Slice 03 repair verification:
- `node --experimental-strip-types --import ./tests/register-ts-extension-loader.mjs --test tests/cameraRig.test.ts tests/grassModels.test.ts`
- `npx tsc --noEmit`
- `npm run build`
- `VERIFY_URL=http://127.0.0.1:5174 VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome node scene.mjs battle-map-reference battle-grass shared-grass-models battle-terrain-3d battle-terrain-features battle-terrain-elevation battle-renderer-visual battle-input full-game-rendering-performance`

Latest focused verification for the overcast fixture/backdrop pass:
- `node --experimental-strip-types --import ./web/tests/register-ts-extension-loader.mjs --test web/tests/cameraRig.test.ts web/tests/grassModels.test.ts`
- `npx tsc --noEmit`
- `npm run build`
- `UPDATE_SHOTS=1 VERIFY_URL=http://localhost:5174 VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome node scene.mjs battle-map-reference battle-grass battle-terrain-3d battle-terrain-blockers battle-terrain-elevation`
- `VERIFY_URL=http://localhost:5174 VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_BROWSER_CHANNEL=chrome node scene.mjs battle-map-reference battle-grass battle-terrain-3d battle-terrain-blockers battle-terrain-elevation`

Screenshot critique initially blocked on terrain grass reading as random black
speckle in open fields. After the terrain-only stubble softening, the follow-up
critique cleared the blocker: grass reads as sparse terrain stubble, does not bury
trees/props, and the close soldier sanity shot keeps units and blue team/selection
pixels legible. That critique clearance applies only to the Slice 03 infrastructure
shots, not to reference-match acceptance. Non-blocking note for the infrastructure
shots: `coastal-scrub` still has the most visible isolated flecks on yellow-green
ground, but they are subdued enough for the gameplay-stubble layer.

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

**Next pickup:** continue from the `battle-map-reference` highland fixture
comparison artifact. Do not close Slice 03 or Slice 04 yet. The highest-value next
move is to make the terrain/composition genuinely comparable: deeper visible valley
recession, foreground hummock, a non-pyramidal left ridge wall, and right-side
water that sits in the mid-distance. The first overcast sky/backdrop layer is in,
but the candidate still reads as blockout geometry; fix those forms before another
fine grass color pass.

Every visual slice (01–08) ends with three distinct gates:
`screenshot-regression` for baseline stability, `compare-screenshots` against
`assets/target-battle-map.png` for the "less wrong against the reference" verdict,
and an unprimed `screenshot-critique` of the slice's hero shot against the target
and the warm `references/battle-*.jpg` aesthetics shots. A green snapshot proves
*unchanged*, never *good*.

`compare-screenshots` is the reference-facing gate. It must establish the target
from first principles, confirm the candidate/reference captures are comparable,
generate side-by-side/crop/heatmap/edge artifacts as needed, and ask the skill's
neutral subagent reviewer to inspect the images without implementation history. If
the subagent calls out wrong camera, missing content, bad color, weak density, or
style mismatch, treat that as visual evidence to fix or explicitly explain before
accepting the slice. If the current map cannot yet be fairly compared to the
reference, record that as "both wrong / another pass needed" rather than accepting
on snapshot stability.

**Update this section before you end your pass** — move the status, record what
landed, and point at the next pickup slice.

### Global TODO

- [x] **Slice 00** — reference workbench + palette target lock (`slices/00-reference-workbench.md`)
- [x] **Slice 01** — zoom-coupled camera (`slices/01-zoom-coupled-camera.md`)
- [x] **Slice 02** — grass-blade primitive (`slices/02-grass-blade-primitive.md`)
- [ ] **Slice 03** — grass over terrain (`slices/03-grass-over-terrain.md`) — infrastructure and diagnostic reference shot landed; target relationship still failing
- [ ] **Slice 04** — terrain relief + ground grade (`slices/04-terrain-relief-grade.md`) — diagnostic `highland-valley` fixture landed; relief relationship still too weak
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
  snap mechanics, `compare-screenshots` owns the reference-facing "less wrong"
  comparison and neutral subagent review, and `screenshot-critique` remains the
  mandatory unprimed qualitative gate on every visual slice.

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
