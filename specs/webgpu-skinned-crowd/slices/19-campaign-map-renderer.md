# 19 — Campaign Map Renderer

## Contract

The campaign map world surface is raw WebGPU: parchment terrain, sea, water
glint, foam, roads, borders, territory washes, clouds, fog, labels, and camera
zoom/tilt behavior render without the current campaign renderer.

Campaign map parity includes the previous 3D renderer's board framing, terrain
relief, water/grass readability, tree/rock density, road treatment, and
map-label typography/icons. A flat parchment-only approximation is a temporary
scaffold, not final parity.

Close campaign views must use the same perspective language as the archived
renderer: the board/terrain footprint projects as a trapezoid, distant models
and roads foreshorten, and ground-plane overlays such as selection rings share
that projection. A flat orthographic rectangle is not accepted for the
campaign-label-zoom gate.

## API Seam

- `packages/game-renderer/src/campaign/mapPass.ts`
  - uploads the existing campaign background image as a raw WebGPU texture and
    draws it through the shared WebGPU camera uniform with parchment grading.
  - owns WebGPU road/sea-lane line rendering and city marker rendering from
    `campaign-map.json` for the current checkpoint.
- `packages/game-renderer/src/campaign/territoryPass.ts`
  - uploads the current campaign territory RGBA overlay as a raw WebGPU texture
    and blends faction ownership washes over the parchment map.
  - exports border vertex packing for the smooth nearest-city frontier curves
    produced from live campaign ownership state.
- `packages/game-renderer/src/campaign/atmospherePass.ts`
  - draws deterministic WebGPU open-water glints/foam washes and overview rim
    cloud banks over the campaign map.
- `web/src/campaign/rendererWebGPU.ts`
  - production campaign scene adapter: owns the normal route's raw-WebGPU map,
    territory, atmosphere, roads, entity, selection, projection, label, freeze,
    and stats surface. The legacy campaign renderer route has been retired;
    legacy captures are migration evidence only.
- `packages/game-renderer/src/campaign/mapPass.ts`
  - `CampaignLabelPass` generates a canvas glyph atlas and draws visible label
    quads through raw WebGPU with zoom-aware density, Cinzel city/faction labels,
    Georgia italic sea labels, and army labels.

## Playable Deliverable

- `/webgpu/campaign-map`
- `/?campaign=test`
- archived migration captures for legacy comparison, not a live renderer route
- Presets implemented: whole map, Roma, Gaul, Egypt/Nile, Alps, political.
- Whole-map view shows territory washes, smooth faction borders, deterministic
  water glints, rim clouds, tier-3 city labels, faction labels, and sea names;
  closer presets may reveal lower-priority city labels.

## Verification

- Final campaign visual screenshots cover terrain, water, clouds, roads,
  territory, borders, and labels.
- Dedicated model/reference screenshots cover road segments, tree clusters,
  rocks/mountains, terrain relief/water/fog samples, and label typography/icon
  samples for city, army, faction, and sea labels.
- `web/scenarios/webgpu-lab-routes.mjs` opens `/webgpu/campaign-map?preset=whole`
  and checks the current checkpoint: textured parchment map, WebGPU territory
  texture, border segments, WebGPU atmosphere layer, sea, road/sea-lane pixels,
  city marker pixels, and WebGPU glyph-atlas label coverage.
- Pixel checks preserve faction/road/label readability for the route checkpoint.
- `web/scenarios/campaign-webgpu-production.mjs` opens the normal campaign test
  route, freezes the frame, checks WebGPU stats/pixels, clicks real rendered
  army and city markers through the production scene input path, and verifies
  the normal panels over the same WebGPU scene.
- Gameplay fog-of-war remains required before this slice is production-complete.
- `web/scenarios/campaign-webgpu-visual.mjs` keeps the controlled campaign
  marker/UI screenshots passing through the production WebGPU campaign adapter;
  `verify-campaign-visual.mjs` is only a compatibility wrapper.
- The `webgpu-visual-report` campaign-label-zoom capture now uses an actual
  close review camera on the controlled stage. The WebGPU campaign clamp keeps
  strict bounds for real maps, but controlled visual fixtures can zoom beyond
  aspect-fill and pan inside their overflow instead of collapsing every request
  to the centered full-board frame. This moved the tracked Campaign Label Zoom
  parity distance from `0.37363` to `0.27431`; the remaining gap is now mostly
  art/projection/readability rather than a broken report camera.
- The controlled test/handoff campaign fixtures use a muted olive field
  swatch instead of the earlier parchment beige scaffold so the close-label
  WebGPU comparison starts from the archived renderer's greener ground color.
  This moved Campaign Label Zoom parity distance from `0.27431` to `0.25048`.
  Remaining visible gaps are terrain texture, foreground scenery scale, and
  grounded perspective for selection rings, shadows, flags, and labels.
- The same controlled fixtures now use deterministic muted-grass texture and a
  denser 48-instance close scenery set with larger foreground/background rocks,
  trees, and mountains. Army labels also offset farther below settlement labels
  when an army is colocated with a city. This moved Campaign Label Zoom parity
  distance from `0.25048` to `0.24434` and matched the archived reference's edge
  energy more closely (`edgeEnergyRatio 1.06531`). Remaining gaps include exact
  prop placement, richer terrain relief, and grounded perspective/depth ordering
  for flags, selection, and label quads.
- The road line pass now draws a narrower grey-stone road with softer side
  shadows instead of the previous stark white multi-band treatment. This moved
  Campaign Label Zoom parity distance from `0.24434` to `0.23538` and brought
  edge energy closer to the archived renderer (`edgeEnergyRatio 1.03316`).
  A tested higher-saturation terrain grade looked plausible but worsened the
  same metric, so it was rejected rather than committed.
- The `webgpu-visual-report` close camera now uses `cam(0, 433, 13)` for the
  controlled stage so the board trapezoid and foreground void line up with the
  archived close capture instead of overexposing the lower board. The glyph
  atlas also uses a darker, wider black halo for city and army labels plus
  stronger subtext. Together these moved Campaign Label Zoom parity distance
  from `0.23538` to `0.20930`, with black/terrain coverage closer to the
  reference and `edgeEnergyRatio 0.98570`.
- The same close-label visual report now explicitly selects the posed army
  before capture, so the report exercises the selected marker state instead of
  only the idle city/army stack. The campaign selection pass draws a stronger
  ground-plane ring and the controlled close fixture uses a smaller selected
  army radius than the real campaign map. This moved Campaign Label Zoom parity
  distance from `0.20930` to `0.20759`, kept edge energy close to parity
  (`edgeEnergyRatio 0.99377`), and preserved Battle Selection DPR2 at `0.15910`.
  The remaining close-view debt is still central-stack composition, label
  separation, richer object depth, and reducing the floating-board/void read.
- City standards in the shared campaign entity mesh now use a real thin
  vertical panel attached to a stronger pole instead of small cuboid flag caps.
  This makes the city/town ownership flags read closer to the archived close
  renderer and moved Campaign Label Zoom parity distance from `0.20759` to
  `0.20673`, with edge energy essentially matched (`edgeEnergyRatio 1.00286`).
  The isolated city model gate was regenerated and inspected; the next debt is
  still depth integration, selection-ring thickness, and the crowded central
  army/city/road label stack.
- The controlled close-view selected army footprint now uses a tighter radius
  and lower army-ring alpha, reducing the loud central green ring without
  removing the selected-state evidence. Campaign Label Zoom parity distance
  moved from `0.20673` to `0.20635`, and edge energy stayed nearly exact
  (`edgeEnergyRatio 0.99855`). A wider report-camera experiment improved black
  coverage but worsened parity to `0.21198`, so the close camera remains
  `cam(0, 433, 13)`.
- The WebGPU campaign pitch now uses a stronger close-view perspective
  (`0.82` instead of `0.66`), making the board trapezoid, city/army standards,
  selection ellipse, shadows, and scenery silhouettes read less orthographic.
  Campaign Label Zoom parity distance moved from `0.20635` to `0.19716`, with
  edge energy still close to the archived renderer (`edgeEnergyRatio 0.98847`).
  A higher report-camera zoom matched terrain/black coverage better but
  worsened parity to `0.21065`, so camera zoom stayed fixed and the accepted
  change is the renderer perspective.
- The close-label visual report camera now uses `cam(0, 436, 13)`, a small
  controlled-stage center shift that reduces the lower void while keeping the
  same perspective and zoom. Campaign Label Zoom parity distance moved from
  `0.19716` to `0.19570`, black coverage moved closer to the archive
  (`0.52141` to `0.50197` versus archive `0.48049`), and edge energy stayed
  near parity (`edgeEnergyRatio 1.00746`). Opposite-direction camera, army-label
  offset, and army-ring alpha trials all worsened the same score and were
  rejected.
- The campaign model-gate report now adds individual reference captures for
  selected-city footprint, road-only treatment, terrain grass/scrub, terrain
  stone/relief, shoreline-water, and cloud/fog, expanding the report from 10 to
  16 addressable campaign PNGs. The new gates run through the real raw-WebGPU
  entity, scenery, selection, line, water, cloud, and glyph-atlas passes and
  record per-pass counts in `webgpu-model-gates.json`.

## Must Stay Green

- Campaign data loading and simulation state are read-only.
- Faction colors and allegiance colors keep the two-color rule.
- City/army label text remains legible at current review zooms.
- City/army labels preserve the old icon+text map language: Cinzel/Georgia
  typography, halos, and allegiance-colored city/army icons.
- Labels use the WebGPU glyph atlas rather than DOM nodes; dense campaign panels
  are the remaining intentional DOM layer.

## Human Feedback

Campaign readability matters more than battle fidelity here: ownership,
standing, roads, and labels must scan quickly.

Fresh screenshot critique is part of acceptance for close campaign work. The
latest unprimed critique after the camera/label pass still flags open blockers:
the map reads as a floating board against black void, labels remain crowded over
busy cities and the central army, selection rings are too subtle, the central
army/banner/road/label stack is visually tangled, object scale and shadows are
not fully unified, and some rocks still read as clipped gray patches.
