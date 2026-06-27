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
- Campaign army parity improved when the entity mesh became a dense visible
  formation instead of a few tiny soldiers under chunky cuboid flags. Use a
  folded attached flag panel, a stronger footprint shadow, and enough soldier
  silhouettes to read as a unit token in both whole-scene captures and the
  isolated model gate. Test scale changes separately: shrinking the marker
  answered a critique complaint but regressed Campaign Label Zoom from
  `0.18226` full / `0.24565` crop to `0.18331` / `0.24728`. A ground-oval
  selection marker plus folded flag landed at `0.18257` / `0.24647`, still
  better than the previous checkpoint while addressing the unprimed
  screen-circle and billboard-flag critique. Prefer the version that moves
  metric and critique together when the score tradeoff is this small.
- Campaign model-gate screenshots are most useful when they exercise the real
  WebGPU passes, not mocked DOM or separate drawing code. Add addressable gates
  for each asset family, render them through `CampaignEntityPass`,
  `CampaignSceneryPass`, `CampaignSelectionPass`, `CampaignLinePass`, and the
  atmosphere passes as applicable, and publish pass counts such as selections,
  road segments, water features, clouds, scenery, and visible labels in the
  report JSON.
- Campaign close-view cloud/fog must soften without making scenery transparent.
  Drawing the cloud veil full-strength over close-stage mountains, rocks, and
  cities makes background meshes read like see-through props. Removing or
  moving the veil entirely makes the scene harsher and fresh critique rejected
  it. Prefer a controlled-fixture cloud alpha scale in `CampaignCloudPass`:
  it preserves the original layer order, avoids camera-uniform shader branches
  that produced black campaign captures, and reduced Campaign Label Zoom from
  `0.18257` / `0.24647` crop to `0.17429` / `0.23263`.
- Campaign overview and close fixtures need separate compile-time style
  constants. Whole-map political wash and sea color improved when
  `CampaignMapPass`/`CampaignTerritoryPass` accepted constructor styles and
  the real-map route used stronger territory alpha plus a sea tint, while the
  controlled close fixture kept the old constants. Do not key this off camera
  uniforms inside WGSL; prior camera/uniform branches and a multi-placeholder
  exposure refactor both produced black campaign captures. After every WGSL
  placeholder change, inspect at least one controlled close capture, not just
  the scenario pass/fail line.
- Campaign whole-map parity can improve numerically while still reading too
  dark to a human reviewer. If the overview looks dim but close campaign rows
  are stable, keep the fix route-specific: lighten the real-map sea tint and
  lift the real-map cloud/parchment veil, leaving controlled close-fixture cloud
  scale and map constants alone. Track average luminance alongside
  `parityDistance`; one accepted overview pass cut the whole-map luminance gap
  from `-12.9` to `-4.5` and improved Campaign Whole Map from `0.26943` /
  `0.27974` crop to `0.23252` / `0.24128` without moving Campaign Label Zoom.
- For campaign overview label clipping, prefer deterministic label-layout
  offsets over camera movement. The whole-map camera can be numerically close
  while large faction labels hang off a viewport edge; use existing
  `screenOffsetX/Y` label fields or measured atlas bounds to nudge edge labels
  inward, then accept the change only if a fresh critique stops flagging the
  clipping. One `SELEUCIDS` right-edge fix traded Campaign Whole Map from
  `0.23252` / `0.24128` crop to `0.23458` / `0.24343`, kept Campaign Label Zoom
  fixed, and removed the high-confidence right-edge critique finding.
- Extend campaign overview safe margins symmetrically before treating toolbar
  occlusion as a camera problem. North/south `screenOffsetY` nudges on city and
  faction labels fixed `LONDINIUM` toolbar pressure and bottom-edge city label
  clipping while keeping Campaign Label Zoom unchanged; the accepted tradeoff
  moved Campaign Whole Map from `0.23458` / `0.24343` crop to `0.23783` /
  `0.24685`, and fresh critique shifted from edge-clipping findings to genuine
  label-collision/style blockers.
- For campaign overview brightness complaints, tune the real-map
  cloud/parchment veil before changing map or territory colors. A sea/territory
  color trial reduced the luminance gap but worsened Campaign Whole Map from
  `0.23783` / `0.24685` crop to `0.25649` / `0.26631`; lifting only the real-map
  `CampaignCloudPass` alpha scale to `1.75` improved it to `0.23102` /
  `0.23976` while leaving Campaign Label Zoom unchanged. Add avg luminance to
  the compare output and treat fresh critique findings as acceptance blockers
  even when global darkness is improved.
- Keep campaign overview brightness route-specific and verify the human read
  against the side-by-side. Raising the real-map cloud/parchment scale from
  `1.75` to `1.9` plus giving sea labels a pale fill/dark halo moved Campaign
  Whole Map to `0.22694` / `0.23549` crop and reduced the world-crop luminance
  gap to `-1.99825`, with Campaign Label Zoom unchanged. Fresh critique still
  blocked acceptance on muddy overlays, tiny city labels, edge fog, and missing
  old flag/unit markers.
- When the overview still reads darker after label/style work, try the real-map
  `CampaignCloudPass` alpha scale before repainting the map or territory. A
  palette/territory lift can make luminance perfect while worsening structural
  parity; a small atmosphere-scale bump from `1.9` to `2.05` cut the world-crop
  luminance gap from about `-1.999` to `-0.945` with only a tiny crop-score
  tradeoff (`0.23266` to `0.23285`) and left controlled close campaign captures
  unchanged.
- Fit campaign sea labels to the actual visible water lane, not just the map
  feature name. Curving a long label helps, but a label near a narrow coast can
  still spill onto land; shrink it and move it into wider water, then inspect
  the PNG because grayscale parity can miss semantic land/water overlap. The
  Atlantic label near Spain was fixed this way and moved Campaign Whole Map to
  `0.22546` full / `0.23390` crop.
- For campaign close-view selection rings, tune world footprint and alpha
  together. A ground-plane ellipse can be technically correct but still read as
  an overprominent decal when it spans the road/unit stack, or become too faint
  to serve as a key selected-unit UI marker. Keep production campaign selection
  conservative, but allow controlled close-review fixtures to pass an explicit
  selection emphasis bit so the report can exercise readable selected-state UI
  without repainting every selected campaign army. The next blockers remain
  camera/scale, shadows, flags, road layering, and true ground-plane depth cues.
- Campaign road styling should be route/stage-aware. Whole-map roads can stay
  broad and visible, but the controlled close-view road must be narrower so it
  does not slice through the selected army/ring stack. Thread road style through
  `buildCampaignMapDrawData` instead of changing the global line shader; one
  controlled-stage road scale moved Campaign Label Zoom from `0.17419` /
  `0.23270` crop to `0.17364` / `0.23442` while leaving Campaign Whole Map
  unchanged.
- Do not let selected-unit markers become too faint while chasing close-view
  campaign parity. A smaller ground footprint helped the central stack, but
  lowering selected-army alpha made the ring stop reading as a key UI state.
  Keep the ring projected as a ground-plane ellipse and tune alpha/green
  contrast back up until the selected state is obvious in the full report and
  a tight crop, even if the grayscale metric gives back a tiny amount.
- Campaign entity meshes currently paint without a depth buffer, so internal
  formation order must be authored back-to-front. If rear soldiers are emitted
  after front soldiers, they will stack visually over the near rank; sort
  soldier slots by local depth before appending geometry and inspect a tight
  crop, not just the full-frame parity score.
- Do not satisfy old campaign marker parity with generic dot/circle markers.
  A simple overview marker pass can move pixels while still reading as missing
  flags/models to an unprimed reviewer. Port the old icon/flag hierarchy and
  zoom LOD as an explicit visual feature; prune halfway marker layers unless
  fresh critique sees them as the intended campaign map language.
- For campaign overview markers, use constant screen-size quads anchored to
  world positions for old-overlay concepts such as city squares and army
  pennants. World-radius markers disappear at political zoom and read as
  missing content. A screen-space marker pass can be an accepted tradeoff even
  if `parityDistance` worsens slightly, but only when an unprimed comparison
  says the candidate is more complete/readable and the style gap is still
  recorded as open.
- For campaign overview sea names, preserve the antique-chart typography but do
  not render long sea labels as rigid straight quads. Draw sea-label glyphs
  along a shallow arc inside the WebGPU label atlas, then project the curved
  atlas quad through the existing label pass. This can slightly worsen
  archived straight-text pixel parity while fixing the human issue: long names
  should bend to the water lane instead of spilling visually into land.
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
- Keep battle overlay vertex contracts single-sourced. `web/src/shared/overlays.ts`
  emits `x, y, r, g, b` per vertex; `BattleOverlayPass` and any frozen-report
  overlay filtering must use the same five-float stride. A stale six-float RGBA
  assumption can scramble line segments, hide selection rings, and present as
  random colored/debug streaks in WebGPU battle screenshots.
- For sim-sourced battle terrain, broad tint masks should be treated as
  underpainting only. A density-only pass can improve parity metrics while still
  reading as smudged decals under unprimed critique. Keep forest/mud mask alpha
  low, bias patch boundaries toward distinct trees/shrubs/rocks/potholes, and
  record both the `compare-screenshots` movement and the critique findings
  before accepting the visual. If the metric win fights artifact readability,
  prefer the version that removes visible decal artifacts and log the tradeoff.
- For Battle Selection DPR2 terrain cleanup, do not keep pushing per-cell
  pothole/rock density once the scene already reads as stamped blobs. A
  dedicated irregular pothole shader plus increased potholes worsened parity
  from `0.10869` to `0.11165`, and a fewer-potholes/more-rocks variant worsened
  it to `0.11206`; both still looked patterned. Change the feature
  representation/layout instead of brute-forcing density.
- Battle terrain shader detail should be camera-style scoped. A global
  greener/higher-frequency base shader helped Battle Max Crowd but risked
  destabilizing close DPR2 selection; compiling a separate wide tactical
  terrain style and selecting it only for low-zoom battle cameras improved
  Battle Max Crowd (`0.20990` to `0.20404`, crop `0.23754` to `0.22554`) while
  keeping Battle Selection DPR2 crop steady at `0.13474`.
- Campaign city standards must be embedded in the city mesh, not layered like
  loose overlays. Place the pole through the visual city core and emit it before
  buildings so front roofs/walls occlude the lower pole. For close crops, prefer
  a thin double-sided panel that slightly overlaps the pole; extruded
  `verticalPanel` side faces can create a detached bright top strip that reads
  as a floating flag artifact. If a flag still reads perched, do not solve it by
  merely raising it: move the mast to the settlement core, lower the cloth into
  the building volume, and draw a central roof/keep after the standard so the
  city visibly swallows the lower mast like a standard inserted into the city.
- If a nested 3D object still cannot read correctly after reasonable mesh
  placement, treat it as a render-graph/depth-contract bug, not an aesthetics
  tweak. Campaign flags inside cities and future garrisoned armies inside
  cities are basic 3D-engine requirements shared with battle rank/weapon
  occlusion. Do not keep iterating painter-order hacks; add a depth-tested
  world pass with compatible pipelines, shared camera-space depth, and explicit
  overlay passes, then verify it with cropped nested-object fixtures before
  accepting production model polish.
- When introducing depth into an existing flat shell, prefer a separate
  depth-tested world pass over adding a depth attachment to a pass with
  incompatible existing pipelines. A named `world` phase can load the
  already-cleared color target, clear/reuse a `depth24plus` texture, bind the
  same camera uniforms, and prove the contract without forcing every flat
  marker/terrain pipeline to become depth-compatible in one edit.
- Production model gates need their own nested-object pixel samples. The
  abstract render-graph fixture can prove depth plumbing while the real city
  mesh still reads like a pasted or perched flag. Add tight samples for the
  actual model: a buried standard/cloth point should resolve to city material
  and an exposed cloth point should resolve to faction color. Keep the visible
  cloth readable, but place a lower segment inside the settlement volume so the
  gate proves interpenetration rather than just flag height.
- When a city/army standard passes nested-depth samples but still reads like a
  pasted flag, add real attachment geometry before moving poses again. A visible
  mast socket, hoist strip, and cloth crossbar can improve the model-gate crop
  and move close campaign parity, but it is not acceptance if fresh critique
  still sees disconnected blocks, missing flag shadows, or ambiguous roof/cloth
  depth. Record those as model-art blockers and target contact shadows, stronger
  socket massing, and face lighting next.
- Production garrison gates should prove both sides of the nested-object
  contract. A fully hidden token does not prove readable garrison presentation,
  and random faction-color slivers do not prove a coherent army inside the
  city. Sample a buried occupant point that resolves to city material and a
  raised standard point that resolves to the occupant faction color, then inspect
  tight crops with a fresh critique. If the critique sees confused flag/pole
  attachment, clipping banners, weak selection rings, or smear shadows, record
  those as visual blockers even when the depth samples pass.
- Nested-object fixtures should intentionally defeat painter-order shortcuts:
  submit the city/front-rank/ground occluders first, then submit the flag,
  garrison stub, rear rank, or selection ring later. Accept the route only after
  canvas pixel samples or tight crops prove the late geometry is correctly
  hidden or revealed by depth.
- When promoting campaign models from background drawing into the depth-tested
  `world` phase, keep labels, clouds, and screen-style markers in a later overlay pass.
  Otherwise the right depth fix can accidentally bury UI readability. Expect
  archived close-view parity to move: a production campaign depth pass made the
  selected army, road, labels, and ring more readable under fresh critique, but
  worsened Campaign Label Zoom metrics because camera/scale/lighting no longer
  matched the old reference. Treat that as the next visual tuning target, not a
  reason to return city/army/scenery meshes to painter-order overlays.
- Do not let battle and campaign accumulate private copies of the camera WGSL
  struct and projection helpers. Put the packed camera layout and helpers such
  as `cameraSpace`, `perspectiveDepth`, `projectGround`, and `projectWorld3d`
  in `packages/webgpu-core`, then import that source into depth-sensitive
  passes. This keeps nested flags, garrisons, ground rings, battle ranks,
  picking, labels, and screenshots converging on one world/camera/depth
  contract instead of self-consistent but incompatible local projections.
- The shared camera WGSL belongs in background and overlay-adjacent passes too,
  not only opaque model passes. Shell terrain/backdrop impostors, campaign map
  textures, territory washes, water/cloud quads, markers, and label anchors
  should import `WORLD_CAMERA_WGSL`; labels may still convert the shared
  `cameraSpace`/`perspectiveDepth` anchor into screen pixels for atlas offsets.
  A private `struct Camera` in a shader string is a drift warning unless it is
  the shared source itself. Keep `webgpu-lab-routes` scanning renderer sources
  for private `struct Camera` declarations so this remains a testable invariant
  instead of a manual grep habit.
- When migrating battle shaders to the shared camera helpers, preserve existing
  normalized z values and pass ordering first, then assert the contract through
  route stats before adding battle depth. A pure projection-source refactor
  should keep DPR1/DPR2 battle input, freeze stability, and visual-report
  parity effectively stable; in one pass Battle Selection DPR2 moved only from
  `0.10928` to `0.10861` while its world crop stayed unchanged.
- Campaign selection rings and contact shadows must be tuned as world cues, not
  overlay decals. A stronger selected-army ring can make the state readable and
  improve close-view parity, but if an unprimed crop critique calls it neon/flat,
  temper alpha/saturation and record the remaining road-depth/shadow blockers.
  Adding per-building/per-soldier contact-shadow geometry to the same
  depth-tested entity mesh is preferable to a new screen overlay; in one pass it
  nudged Campaign Label Zoom from `0.19952` / `0.26605` crop to `0.19910` /
  `0.26555` while preserving city-standard and garrison depth samples.
- Campaign roads must reserve world space, not just draw brighter lines. A
  road pass can render through the depth world pass with depth testing while
  keeping depth writes off so layered road bands compose and later
  depth-tested scenery/entities still draw over the road. If overlapping bands
  write depth, the first under-band can hide the pale center and make the road
  look like a dark rail. Also clear large rocks/mountains from road corridors;
  unprimed critique will correctly read props placed on a route as a road
  integration bug rather than an art choice. Endpoint pads and softer shoulders
  are only a checkpoint: final parity still needs actual gate/plaza geometry,
  contact shadows, and raised/beveled road surfaces.
- Campaign ground selections are world-space decals, not occluders. They should
  project through the shared camera and draw early in the depth world pass, but
  their depth pipeline must not write depth; otherwise the selected ring can
  reserve pixels above soldiers/cities and read like a screen overlay slicing
  through the model. Let roads, scenery, entities, and shadows paint over the
  marker naturally.
- Campaign prop placement must reserve settlement footprints, not just road
  corridors. Deterministic tree/rock/mountain scattering can be technically on
  the ground and still project into a city volume at close pitch, reading as a
  floating tree on a roof. Filter scenery against tier-aware city clearance
  radii before upload, and make controlled visual fixtures use generous
  clearance because they magnify city composition bugs.
- Reserve road/army corridors for every scenery kind, not just large rocks and
  mountains. A tree planted beside or inside a road corridor can be perfectly
  depth-tested and still collide with an army standard in the review camera.
  Treat this as scene-authoring footprint policy layered on top of correct
  depth, not as a reason to special-case draw order.
- Feed scenery generation the live entity footprints when armies/cities are
  present. Static map-node clearance catches settlements, but selected armies
  and future garrisons need reservations from the same entity frame that drives
  the renderer; otherwise deterministic props can be authored into occupied
  world space and look like depth failures.
- Tall standards need silhouette clearance, not just base-circle clearance.
  A tree can be outside an army's ground footprint but still project into the
  raised flag/pole column at campaign pitch. Grow scenery reservations by the
  visible standard/roof silhouette when authoring review fixtures.
- Type buckets are a batching strategy, not an ordering strategy. It is fine to
  draw all conifers, all rocks, or all soldier mesh variants together, but those
  buckets must use the same shared world-depth helper as the rest of their
  domain. If a tree behind a standard appears over the flag, or a battle rank
  sorts by mesh class, look first for pass-private depth math or a pipeline
  submitted through the wrong frame category.
- Real skinned soldier depth needs its own hostile-order gate. Keep
  `/webgpu/skinned-depth` drawing a nearer soldier before a later rear class
  bucket through `SkinnedCrowdPipeline`, then sample the overlap so class
  batching cannot become a hidden painter-order dependency.
- Once a pipeline declares a depth attachment, every route that draws it must
  submit it through the depth world pass. A skinned pipeline can look correct in
  isolated model gates while live battle routes go mostly black if one lab
  route still calls it from a no-depth/background pass. After changing pipeline
  attachments, search all `draw(pass)` callsites and run a wide live route, not
  just the isolated asset gate.
- Keep the frame shell API named after architectural phases, not generic
  callbacks. `background` is for terrain/backdrops/underpainting,
  `world` is the depth-tested world pass with `depth24plus`, and `overlay` is
  for labels/HUD/minimap/debug overlays. Publish the executed phase list in
  route stats and make depth-critical scenarios assert `background ->
  world-depth` (and overlay when relevant), so future routes cannot silently
  paint true 3D geometry through a no-depth side channel.
- Production battle/campaign scenarios should assert the same contract as the
  lab routes. Expose `cameraContract`, depth allocation, and executed
  `framePhases`/`phases` from normal game renderer stats; otherwise a lab gate
  can stay green while the shipped route quietly drifts into a different pass
  shape.
- Once a campaign model/decal pass is promoted to the depth world phase, remove
  its no-depth twin API instead of keeping `draw`/`drawDepth` side by side.
  For `CampaignEntityPass`, `CampaignSceneryPass`, and
  `CampaignSelectionPass`, plain `draw(pass)` should mean the depth-compatible
  world path; keep `webgpu-lab-routes` scanning those files for reintroduced
  `drawDepth`, parallel `depthPipeline`, or no-depth pipeline variants.
- Make phase misuse impossible at the TypeScript boundary where practical.
  `FrameCommands` should expose branded `BackgroundRenderPass`,
  `WorldRenderPass`, and `OverlayRenderPass` callback parameters, and
  depth-sensitive world draws such as `SkinnedCrowdPipeline`,
  `Nested3dFixturePass`, campaign entities, scenery, selections, roads, and
  depth lines should require `WorldRenderPass`. Keep `webgpu-lab-routes`
  scanning this contract so a later cleanup cannot silently move true 3D
  geometry back into a no-depth phase.
- Brand the non-world public draw methods too. Background underpaint passes
  such as battle terrain, campaign map, territory, water, and flat campaign
  lines should require `BackgroundRenderPass`; labels, markers, minimaps,
  clouds, and debug overlays should require `OverlayRenderPass`. This keeps the
  frame phase contract complete and makes accidental cross-phase calls a compile
  error instead of a visual regression hunt.
- The live frame shell should submit graph-shaped pass lists, not ad-hoc
  `background`/`world`/`overlay` callback fields. Use named pass ids plus a
  `phase` string (`background`, `world-depth`, `overlay`) and publish those ids
  in frame stats. This makes the running frame inspectable like the declarative
  render graph and gives scenarios a concrete way to prove production routes are
  using the intended phase ordering.
- Keep render-graph domain and frame phase separate. A pass can belong to the
  `battle` or `campaign` domain while still running in the `background`,
  `world-depth`, or `overlay` frame phase. Only the frame phase should decide
  depth legality: `worldDepth` reads/writes and depth attachments belong in
  `world-depth`; background underpaint and overlay UI must not touch them.
  Have `compileRenderGraph` validate phase order and depth ownership, and make
  the render-graph lab route expose graph frame phases and depth-pass ids.
- Live `world-depth` frame passes need an explicit depth mode, not just a phase
  name. Use `read` for ground decals, roads, and other world cues that should be
  occluded by later geometry without reserving pixels; use `read-write` for
  opaque, skinned, nested, or scenery geometry that participates in occlusion;
  reserve `write` for a dedicated depth-fill pass. Publish those modes in
  `FrameShellStats.phases[].depthPasses` and make scenarios assert them.
- Treat render-graph depth modes as exclusive access contracts. A `read` depth
  pass must not write the attachment, a `write` pass must not read it, and the
  full-game graph should reject private depth attachments that bypass the
  shared `worldDepth`. Keep negative fixtures in the lab route so this remains
  browser-verified instead of only implied by TypeScript.
- Shared projection does not require one numeric depth scale for every world.
  Battle and campaign should import the same camera/projection helpers, but
  large battlefields and compact campaign fixtures need named depth helpers
  such as battle-world and campaign-world. Those helpers belong in the shared
  WGSL source; one-off constants inside renderer passes are how drift returns.
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
