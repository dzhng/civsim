---
name: webgpu
description: Build, debug, or review WebGPU/WGSL renderer and compute work. Use when changing WebGPU passes, bind groups, buffers, shaders, frame orchestration, GPU performance, capability handling, or screenshot-gated WebGPU visuals.
---

# WebGPU

Use this for WebGPU implementation work where the hard part is GPU resource
layout, pass orchestration, WGSL correctness, or visual/performance validation.

## Workflow

1. Inspect the existing WebGPU shell, pass graph, bind group layouts, and shader
   contracts before adding a new pipeline.
2. Define the resource layout first: buffers, textures, uniforms, bind groups,
   ownership, update frequency, and read/write pass boundaries.
3. Choose render vs. compute deliberately. Use compute for parallel simulation,
   preparation, reductions, or texture/buffer transforms; use render pipelines
   when rasterization is the work.
4. Keep pipelines composable: stable bind group layouts, explicit pass order,
   ping-pong resources for iterative effects, and no read/write hazards.
5. Validate in a browser, not just TypeScript. Run the smallest WebGPU scenario,
   inspect the produced PNG, and use `compare-screenshots` for parity work.

## Repo Rules

- Prefer the existing `RawFrameShell`, camera uniform, render passes, scenarios,
  and screenshot artifacts. Do not create a second WebGPU device/context path
  unless the current shell cannot support the feature.
- WGSL uniforms and storage structs must respect 16-byte alignment. Pack small
  scalar uniforms into vec4 slots when it keeps offsets obvious.
- All pipelines inside one render pass must be compatible with the pass
  attachments. Adding a depth attachment is not a local change: either update
  every pipeline used in that pass, split the pass, or keep depth off. A green
  scenario route is not enough; open the screenshot and reject black frames or
  flattened/incorrect occlusion.
- Browser scenarios can pass while a WebGPU canvas is visibly black, especially
  when DOM overlays still render and stats only prove CPU-side plumbing. After
  WGSL or pass changes, inspect the actual PNG and treat a black/transparent
  canvas as a failed GPU draw even if there are no page errors.
- When a new shader branch or pass variant creates a black-canvas failure, back
  out to the last known-good WGSL path and reintroduce the visual idea through
  existing proven instance kinds or pipelines first. Once the screenshot is
  nonblack and the data path is validated, widen the shader surface in a smaller
  follow-up.
- When rendering sim terrain from a cell grid, do not expose raw cell/raster
  edges as final art. Merge or soften feature masks, then add instanced props
  such as trees, rocks, potholes, or churn details from the same data source.
  The minimap and battlefield must agree on terrain source, but the battlefield
  should be authored-looking, not a colored grid.
- For sim-sourced battle features, prefer lowering the translucent base mask and
  moving the visual weight into deterministic prop/detail quads. Forest should
  read from trees/shrubs and contact shadows; mud should read from potholes,
  rocks, and churn. Expose terrain/detail counts in renderer stats so visual
  reports can prove the content is present instead of relying only on pixels.
- For screenshot-driven camera fixes, verify the effective camera after renderer
  clamping, not just the requested debug hook values. A visual report can look
  stable while every close-camera request is silently collapsed to the same
  aspect-fill frame; expose or read a `camGet`/stats hook and inspect the PNG.
- Match the verification route to the visual question. Regression snapshots
  such as `campaign-webgpu-visual` can stay pixel-green while the archived
  parity gate in `webgpu-visual-report` changes; for parity work, rerun the
  report route, inspect its PNG, and then run `compare-screenshots`.
- Controlled visual fixtures still need authored texture/detail. A solid test
  swatch can classify correctly and keep snapshots green while the archived
  parity score exposes a dead flat world; use deterministic noise/scenery that
  remains inside the intended terrain class, then re-run the parity report.
- When battle feature overlays already line up with the minimap but the visual
  parity score still reads too smooth, inspect the base terrain pass before
  adding more feature props. Deterministic high-frequency grass, stubble, and
  pebble detail in the shader can raise edge energy without reintroducing
  debug-line or square-overlay artifacts.
- Tune battle base terrain and sim-tint props as one system. If the full-frame
  edge-energy ratio is low, greener/higher-frequency base grass can move the
  metric more than simply adding larger feature blobs, while smaller denser
  prop quads make forest/mud read as authored terrain. Watch the exposed
  terrain quad/scenery counts after each change so the improvement stays
  bounded instead of becoming a brute-force overdraw path.
- For Battle Selection DPR2 parity, dense deterministic shader flecks can be a
  valid replacement for legacy renderer speckle when the old shot has more
  high-frequency ground breakup. Keep the change in the base terrain shader,
  not overlay quads, and accept it only when the composite score improves after
  inspecting that the new edges read as grass/stubble instead of random debug
  noise.
- For sim-tint battlefield features, keep merged cell masks subordinate to
  authored detail. Large forest/mud regions can merge into hard rectangles, so
  lower and ragged-feather the base feature alpha, then spend the visual weight
  on deterministic tree, shrub, rock, churn, and pothole props. Accept the
  change only after opening the battle capture and confirming the feature reads
  as terrain objects rather than a square overlay; in one Battle Selection DPR2
  pass this moved parity distance from `0.11798` to `0.11580`.
- A second small pass of battle ground fleck tuning can keep improving parity if
  it raises edge energy without adding overlay geometry: adjust seed frequency,
  smoothstep thresholds, and stubble/stone mix strength together, then inspect
  the candidate edge map. Treat noisy red/blue edge-diff speckle as acceptable
  only when the actual PNG still reads as grass and the full parity score moves
  down.
- When a battle parity pair is edge-energy low, prefer one bounded terrain
  shader iteration over adding more sim-tint geometry. Raising base grass fleck
  frequency and slightly widening light/dark/stone thresholds moved one DPR2
  selection capture from `0.11580` to `0.10955` while keeping the terrain free of
  debug-line and square-overlay artifacts.
- If a campaign close-view pair already has near-parity edge energy, adding
  more fixture props can be a trap. A trial foreground/road-flank scenery boost
  made the scene busier but worsened Campaign Label Zoom from `0.18317` to
  `0.20434`; fix camera/depth/label composition instead of brute-forcing
  density.
- Use the compare-screenshots `worldCrop` score when a full-frame parity score
  is diluted by toolbar/HUD/void area. The crop can reveal the true renderer
  gap: Campaign Label Zoom held a full-frame `0.18317` while its close-world
  crop scored `0.24726`. In that state, greener controlled-fixture palette
  trials, a `cam(0, 438, 13)` center shift, and tighter label offsets all
  worsened parity; keep those rejected changes out and target actual world
  composition/depth instead.
- For campaign close-view parity, road line styling can dominate the score and
  the human read. Tune road mesh widths, alpha, and grey-stone/shadow colors in
  the line pass before changing camera or labels; then rerun the parity helper.
  Plausible palette changes can worsen the fixed pair, so keep rejected color
  experiments out of the committed artifact set.
- For campaign label-zoom parity, validate the review camera itself before
  changing art. A small controlled-stage center shift can move the board
  trapezoid, black/terrain ratios, and edge-energy ratio much more than model
  constants. After the frame matches, harden WebGPU glyph-atlas labels toward
  the archived white text with black outline; weak translucent halos read as
  missing text even when the font and icon are technically present.
- If a parity report is meant to judge selected campaign markers, make the
  scenario select the posed entity instead of assuming selection state leaks
  in. Then inspect a central crop as well as the full-frame score: full-frame
  metrics can reward a ring that is present while missing whether it is too
  huge, too subtle, or not reading as a ground-plane perspective overlay.
- For campaign close-view selection parity, tune the selected footprint's world
  radius and shader alpha separately from production gameplay markers. A
  selected ring can dominate the central stack even when the entity itself is
  correct. Keep rejected camera experiments out of the artifact set when they
  improve one proxy, such as black ratio, but worsen the composite parity score.
- When a campaign close-view capture reads too orthographic, test the shared
  WebGPU pitch/perspective constants before moving individual props. Pitch
  changes affect board trapezoid, model height, selection ellipse, shadows, and
  label projection together; capture zoom can match black/terrain coverage while
  still worsening the composite parity score.
- Campaign pitch should be zoom-aware. Whole-map captures need an orthographic
  pitch so the map fills the frame like the archived renderer, while close
  city/army views need the full perspective pitch. Keep controlled close-view
  clamp math separate from real-map aspect-fill math: applying the height/cosP
  fill correction to the controlled stage fixed whole-map voids but regressed
  Campaign Label Zoom until the controlled clamp kept its previous envelope.
- For campaign whole-map parity, territory overlay opacity is a first-order
  visual signal, not a finishing detail. If the political map reads too
  parchment-flat, tune `CampaignTerritoryPass` color wash and alpha together,
  then score both whole-map and close-label captures; a stronger overlay can
  improve the worst pair while quietly regressing label zoom if pushed too far.
- For campaign close-view report cameras, make one-axis center trials small and
  score both directions. Moving the controlled-stage `y` center can improve
  black/terrain coverage and edge parity, but the wrong direction can sharply
  increase void coverage. Keep rejected label/selection tweaks out of the
  artifact set when the camera correction is the actual win.
- For controlled campaign close-view palette work, tune the deterministic
  fixture bitmap before changing the global campaign map shader. The archived
  close shot is sensitive to green/yellow ground value; darkening and greening
  the `?campaign=test` bitmap while preserving deterministic noise moved
  Campaign Label Zoom parity from `0.19570` to `0.18514` without disrupting
  edge energy. Keep unrelated full-report screenshot drift out of the artifact
  set before recomputing the diff JSON.
- For campaign model parity, remember that city and army standards are part of
  the instanced entity mesh and use white mesh colors as the faction-livery
  mask. Preserve their attachment by changing mesh geometry, not by layering
  screen overlays; thin vertical panels read more like real flags than chunky
  cuboids. After a whole-scene parity win, open the isolated model gate too so
  an oversized, flat, or detached flag does not hide inside a small metric move.
- For campaign close-view scenery parity, material values can move the crop
  score without adding more geometry. Darkening/warming the shared mountain and
  rock mesh colors moved Campaign Label Zoom from `0.18317` full / `0.24726`
  crop to `0.18299` full / `0.24697` crop. Whole-map moved slightly the wrong
  way (`0.36267` to `0.36278`), so inspect both rows and keep the change small
  unless the close-view artifact is visibly improved.
- Treat a small numeric WebGPU parity win as a checkpoint, not acceptance, until
  `screenshot-critique` has had an unprimed pass over the exact candidate PNGs.
  The campaign material win still left visible blockers that metrics did not
  foreground: selection decals hidden by models, labels colliding with 3D
  assets, detached flags, weak ground-contact shadows, label clipping, and
  blurry/overlarge map text.
- Campaign selection decals should be drawn as ground features, before roads,
  scenery, entities, clouds, and labels. Drawing the selected-army ring after
  props made it read like a translucent screen overlay; moving it earlier in
  the pass lets the road, rocks, trees, and army occlude it. For the controlled
  close-view gate, a radius just outside the model footprint plus a lower
  selected-army label moved Campaign Label Zoom from `0.18299` full / `0.24697`
  crop to `0.18266` / `0.24656`. A larger ring scored slightly better but
  unprimed critique called it oversized, so prefer the smaller human-readable
  ground marker and keep the remaining label/flag/shadow issues tracked.
- Campaign model-gate screenshots are most useful when they exercise the real
  WebGPU passes, not mocked DOM or separate drawing code. Add addressable gates
  for each asset family, render them through `CampaignEntityPass`,
  `CampaignSceneryPass`, `CampaignSelectionPass`, `CampaignLinePass`, and the
  atmosphere passes as applicable, and publish pass counts such as selections,
  road segments, water features, clouds, scenery, and visible labels in the
  report JSON.
- Soldier model gates must exercise the same skinned batching path used by
  production battle rendering. Route each capture through `SkinnedCrowdPipeline`,
  bucket instances by class mesh, freeze clip/phase/facing/camera through query
  params, and publish `meshVariants`, class id, clip, and phase in stats. A
  screenshot of one generic placeholder does not prove the old class models,
  animation beats, or mounted/weapon silhouettes survived the WebGPU port.
- DOM-composited tactical overlays still need WebGPU-era camera/LOD discipline.
  For unit banners or labels, preserve the world anchor first, then apply
  zoom-aware scaling around that anchor. A fixed-size DOM standard can look like
  it floats above or dominates the WebGPU formation even when the underlying
  pick/projection math is correct.
- For sim-sourced battle terrain, broad tint masks should be treated as
  underpainting only. A density-only pass can improve parity metrics while still
  reading as smudged decals under unprimed critique. Keep forest/mud mask alpha
  low, bias patch boundaries toward distinct trees/shrubs/rocks/potholes, and
  record both the `compare-screenshots` movement and the critique findings
  before accepting the visual. If the metric win fights artifact readability,
  prefer the version that removes visible decal artifacts and log the tradeoff.
- Use instancing, batching, storage buffers, and GPU-side phase passes for scale.
  Avoid CPU readbacks in hot paths; debug readbacks must be bounded and named.
- For iterative effects or simulations, separate phases such as `state`,
  `apply`, `integrate`, `constrain`, and `correct`. Use ping-pong buffers or
  textures whenever a pass reads the previous state and writes the next state.
- For neighbor queries or crowd/particle work, prefer spatial grids, tiles, or
  compacted work lists over O(n^2) scans.
- Expose performance knobs that matter: workgroup size, instance count caps,
  tile/grid size, LOD thresholds, and readback limits.
- Capability handling must match the product surface. In this repo, WebGPU is
  the production renderer target; unsupported-device UI is allowed, but visual
  parity must not be achieved by silently falling back to the retired renderer.

## Validation

- Static checks: `cd web && ./node_modules/.bin/tsc --noEmit` and
  `cd web && ./node_modules/.bin/vite build`.
- Browser checks: run the narrowest `VERIFY_WEBGPU=1 node scenario.mjs ...`
  route that exercises the changed pass.
- Visual checks: open the generated PNGs yourself. For parity, run the
  `compare-screenshots` helper and report the score movement.
- If a disputed visual change remains, run `screenshot-critique` with a fresh
  unprimed sub-agent before accepting it.
