# WebGPU Port Notes

These are task-specific notes for the civsim WebGPU renderer migration. They
are deliberately outside `.agents/skills/webgpu/SKILL.md`; the skill should stay
general, while this file tracks the current port's visual, architectural, and
verification lessons.

## Acceptance Stance

- Do not chase archived-renderer similarity once WebGPU is visibly better.
  `parityDistance`, edge maps, grayscale diffs, luminance, and world crops are
  diagnostic telemetry for drift, missing content, darkness, UI overlap, or
  accidental regressions. As the WebGPU renderer becomes richer, sharper, and
  more readable than the old renderer, similarity scores may rise.
- Accept or reject work by named requirements, model gates, focused crops,
  fresh screenshot critique, and player readability.
- The old renderer is migration evidence, not the final target. After WebGPU
  cutover, routine screenshots should target WebGPU only.

## Architecture Direction

- Battle and campaign must share the same camera/depth contract. Put camera
  packing, projection helpers, depth modes, frame phases, and pass roles in
  shared WebGPU-core modules and make renderers plus verifiers import them.
- The frame shell should expose semantic phases: background underpaint,
  depth-tested world, read-only world decals/cues, effect overlays, and UI
  overlays. Type buckets such as trees, rocks, soldier classes, city meshes, or
  flag meshes are batching details inside semantic passes.
- Production routes and lab routes must assert the same contract: pass ids,
  phases, roles, depth modes, and overlay separation should be visible in route
  stats.
- Campaign water is a map-surface property, not a freehand atmosphere overlay.
  Sea tint, glint, and foam must be bound to the same world-space sea mask used
  by the map texture/terrain field. A separate pass may return later only if it
  consumes that canonical mask; hard-coded translucent ellipses are forbidden
  because they can flood mainland while roads/cities remain geographically
  correct.
- Renderer draw APIs should make phase misuse difficult. Depth-sensitive world
  geometry should require the world-depth pass type; background and overlay
  helpers should not accept raw `GPURenderPassEncoder` as a back door.
- Once a model/decal/line pass is promoted to the depth world phase, remove
  no-depth twin APIs instead of keeping parallel draw paths.

## Depth And Layering Blockers

- Campaign city flags, future garrisoned armies, battle ranks, weapons, trees,
  rocks, roads, and selection rings need true 3D occlusion. If a far tree draws
  over a near flag, or a flag cannot sit inside a city, treat that as a
  render-graph/depth-contract bug before treating it as art.
- Hostile-order gates are required: submit occluders first, submit nested or
  rear objects later, then sample/crop pixels that prove the depth buffer owns
  visibility.
- Selection rings and ground cues are world-space decals. Draw them early with
  depth reads and no depth writes so roads, soldiers, cities, rocks, and trees
  can naturally paint over them.
- Opaque cities, armies, skinned soldiers, trees, rocks, and mountains write
  shared world depth. Translucent shadows, rings, roads, and UI labels stay
  separate.
- Campaign roads need world-space integration, not just brighter lines. The
  desired look is pale grey stone with raised/beveled edges or shadowed borders,
  with scenery cleared from corridors and endpoint pads/plazas handled as part
  of the model language.

## Campaign Visual Notes

- Preserve the old campaign's typography and icon language: white serif/caps
  text with dark outline/halo, house/army icons next to labels, and zoom-aware
  label/icon LOD.
- City and army labels must sit below the model with readable spacing, not
  collide with geometry. At whole-map zoom, city labels should sit close to the
  city square marker; the visual gap should be about one marker side, not a
  label drifting into nearby sea or land.
- When an army occupies a city, render one composed label: army icon/name plus
  army size on the top line, city name underneath. Do not independently stack a
  city label and army label at the same screen anchor. The WebGPU campaign
  stats expose `composedArmyCityLabels` so scenes can assert this state.
- Gameplay fog-of-war hides map flags and labels outside visible territory,
  including friendly army flags. The decorative zoomed-out border haze/cloud
  effect is separate and must not reveal hidden markers.
- The archived `campaign-3d` current-renderer baseline is a natural/no-faction
  shot. Use it as the parity floor for coastline, roads, labels, markers, and
  perspective, but always keep a same-camera WebGPU political/faction-color
  screenshot beside it. WebGPU acceptance needs to cover both map reading
  modes, not optimize only toward the old no-faction capture.
- Campaign selection rings are world-space ground decals, not screen overlays.
  They must carry the sampled campaign surface height just like cities and
  armies; flat `z=0` rings can vanish under raised terrain or appear detached
  as the camera tilts.
- City standards belong inside the city mesh like a flagpole inserted into the
  settlement core. The pole should pass through the city volume, lower portions
  should be occluded by front roofs/walls, and a small visible pole segment
  should remain above the city.
- Army standards and city standards should share a coherent wind direction and
  perspective language.
- Selection circles must be projected ground-plane ellipses, not screen-space
  perfect circles. They should sit outside shadows/footprints and remain
  readable as key selected-state UI.
- Whole-map sea labels should fit the visible water lane. Long labels may need
  curved glyph placement, repositioning into wider water, or smaller type so
  they do not spill onto land.
- Preserve the campaign overview border haze/cloud vignette from the aesthetics
  reference. It is an atmospheric chart-frame effect that should appear when the
  player is zoomed out enough, independent from gameplay fog-of-war.
- The campaign close camera should preserve perspective: distant objects shrink
  and the board reads as a trapezoid, not a flat rectangle.
- Scenery generation must reserve city, road, army, and tall-standard
  silhouette footprints. A depth-correct tree can still be scene-authored into
  the wrong place and read as floating on a roof or intersecting a flag.
- Real-map map accuracy is judged by alignment under camera movement: city,
  road, territory, land/water, terrain, and labels must share one coordinate
  contract. The fake `campaign-webgpu-map-alignment` scene is the first guard;
  real Italy scenes remain the proof that the production data is correct.
- `specs/webgpu-skinned-crowd/visualizations/campaign-baselines/campaign-3d.png`
  is the archived natural-map 3D parity reference: terrain, coast, roads,
  city/army markers, labels, mountains, water, and board perspective should
  remain recognizable without the broad faction-color wash. WebGPU should also
  capture the same regional Italy camera with faction colors enabled, but that
  political overlay is an improvement/alternate view, not the baseline mode.
  Screenshot both modes whenever this scene is used for regression; compare
  natural-to-natural for parity and inspect political/faction-color output as
  required improved coverage.

## Battle Visual Notes

- Battlefield terrain features should not read as jagged cell overlays. Merge
  or soften sim masks, keep broad tints subordinate, and spend visual weight on
  deterministic props/details: forest uses trees/shrubs/contact shadows; mud
  uses rocks, potholes, churn, and broken ground.
- The minimap and battlefield must agree on terrain source. If the minimap
  shows large features, the battlefield needs visible authored evidence in the
  corresponding areas.
- `battle-webgpu-minimap` now guards that contract directly. It clicks sim-tint
  feature centers through the minimap, checks the WebGPU camera lands within one
  terrain cell, and captures a DPR2 frame with the same forest/mud features in
  world view and minimap view.
- Ground cues, paths, selection rings, reform ghosts, projectiles, and debug
  lines should not share one ambiguous line bucket. Split by semantics:
  world-depth read-only ground cues versus overlay/effect lines.
- Battle ground-cue vertex contracts are fragile; keep the source stride and
  shader stride single-sourced to avoid random colored streaks or missing cues.
- Soldier model gates must exercise the same skinned batching path as
  production battle rendering, including class mesh, clip, phase, facing, and
  camera.
- `battle-webgpu-visual` now owns the DPR2 production battle visual baseline
  for selection/HUD/minimap review. It freezes a 5v5 WebGPU frame, selects and
  orders a unit, and asserts the semantic ground-cue pass rather than assuming
  selection/order cues are terrain mesh quads.
- `battle-webgpu-effects` now owns the DPR2 projectile/effect-line baseline.
  It uses a named frozen-with-effects hook for fixed tick 473, keeps ordinary
  frozen screenshots effect-free by default, and compares hidden-vs-visible
  same-tick canvas pixels. The renderer frozen-frame cache key includes the
  transient-effect toggle so a preserved-effects frame cannot reuse a hidden
  one.

## Visual Reports And Gates

- The cutover visual report should include whole-scene comparisons, model-gate
  contact sheets, soldier/animation gates, nested-object gates, and release
  audit status. A good whole-scene metric must not hide a missing model,
  animation beat, garrison, label, road, terrain feature, or marker.
- The campaign LoD scene uses the archived natural `campaign-3d.png` capture as
  a structural regression floor for the WebGPU natural 3D Italy shot. The gate
  checks content classes such as water, land, roads, labels, and models, plus
  absence of broad political wash; it is not a mandate to chase pixel
  similarity once WebGPU becomes better.
- Campaign model gates should render through the real production passes for
  entities, scenery, selection, roads, water/clouds, and labels where relevant.
- Nested model gates need pixel samples for buried and exposed regions: for
  example, a hidden flag/pole point should resolve to city material while an
  exposed cloth point resolves to faction color.
- For visual disputes, crop and upscale the relevant feature before theorizing,
  then run unprimed screenshot critique on the candidate PNG.
- Model/art blockers found by critique should be recorded in this spec even if
  metric telemetry improved.

## Current Open Visual Blockers

- City flag must blow the same direction as army flags, sit slightly higher,
  and still be embedded in the city volume instead of perched above it.
- Continue watching city label spacing at each campaign LOD: labels should stay
  close to their marker/model without overlapping the city volume.
- Campaign close-view still needs final tuning for contact shadows, road
  integration, selection readability, flag attachment, and scenery clearance.
- Battle terrain feature art should continue moving from tint masks toward
  authored trees, rocks, potholes, churn, and smoother edges.
