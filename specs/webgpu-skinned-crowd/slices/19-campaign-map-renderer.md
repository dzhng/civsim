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
- The compare-screenshots helper now records `worldCrop` metrics and artifacts
  for the WebGPU parity rows where UI or void can dilute the full-frame score.
  On the current accepted captures, Campaign Label Zoom remains `0.18317`
  full-frame but scores `0.24726` in the close-world crop, making the remaining
  campaign debt more explicit. Palette/noise changes to the controlled fixture
  (`[146,176,98]` plus stronger texture), a `cam(0, 438, 13)` center shift, and
  tighter city/army label offsets were all tested and rejected because they
  worsened the same fixed pair.
- Campaign mountain/rock materials now use darker, warmer stone values so the
  close-label scenery reads closer to the archived brown-grey meshes without
  adding more props. Campaign Label Zoom moved from `0.18317` full / `0.24726`
  crop to `0.18299` full / `0.24697` crop. Campaign Whole Map moved slightly
  from `0.36267` to `0.36278`; the tradeoff is accepted because the whole-map
  visual impact is negligible and the named close-view failure improved.
- The selected-army marker now draws before roads/scenery/entities so it behaves
  like a ground decal instead of a screen overlay. The controlled-stage selected
  radius is large enough to sit outside the army footprint, and the selected
  army label is pushed below the unit stack. Campaign Label Zoom moved from the
  material checkpoint `0.18299` full / `0.24697` crop to `0.18266` full /
  `0.24656` crop. A larger-radius trial reached `0.18237` / `0.24620`, but
  fresh critique flagged it as oversized and detached, so the accepted version
  keeps the smaller radius and the better label placement.

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

The material-color checkpoint improved Campaign Label Zoom metrics, but the
fresh unprimed critique still blocks accepting the campaign render as visually
done. It flags the selection ring reading behind the selected army instead of
as a ground decal; army and city labels colliding with dense 3D models; flags
that feel detached from poles/settlements; weak building/army ground contact
shadows; possible city transparency/fogging; top-bar and right-edge label
clipping in the whole-map shot; oversized faction labels; blurry low-contrast
sea labels; and heavy western fog that reads like a smear. These are next-order
parity targets, not aesthetics polish.

After the ground-decal draw-order and selected-label pass, the selection marker
is no longer buried behind the army and the label is below the unit. Fresh
critique still flags remaining campaign blockers: city labels are crowded by
geometry, the selected army model is too thin/post-like, flags feel flat and
detached, shadows and rock lighting are inconsistent, and the black board edge
still makes the map feel clipped.

The campaign army marker now uses a denser instanced entity mesh with eleven
soldier silhouettes, a stronger footprint shadow, and a folded attached
standard instead of blocky detached flag boxes. The isolated model-gate army
capture was aligned with production draw order and label placement so the
selected ring is a ground decal and `1ST LEGION` sits below the unit. The
selection shader now flattens selected markers by kind so they read as ground
ovals under the oblique campaign camera. Campaign Label Zoom moved from
`0.18266` full / `0.24656` crop to `0.18257` full / `0.24647` crop. A pure
model-only version scored `0.18226` / `0.24565` but fresh critique still read
the ring as a circular overlay and the flag as billboarded, so the slightly
weaker numeric result is the accepted visual trade. A smaller army-scale trial
was rejected because it worsened the same row to `0.18331` / `0.24728`; full
model-scale cleanup remains a later parity pass rather than this checkpoint.

The close campaign fixture now scales the WebGPU cloud/fog veil down instead of
drawing the whole-map atmosphere at full strength over nearby scenery. This
keeps the soft distant atmosphere while reducing the transparent/washed-out
read on background mountains and rocks. Campaign Label Zoom moved from
`0.18257` full / `0.24647` crop to `0.17429` full / `0.23263` crop. Rejected
trials are documented for the next pass: moving/removing the veil made props
crisper but harsh and less coherent under fresh critique, while branching the
cloud shader on `cam.zoom` produced black campaign captures even though the
scenario route reported green.
Fresh critique on the accepted alpha-scale candidate did not identify new
layout/model/label defects, but it incorrectly reported the before/after PNGs
as pixel-identical despite different hashes and improved compare metrics. Treat
that critique as weak no-new-defect evidence, not as proof that the change is
visually complete. Shared blockers remain: selected marker clarity, crowded
city labels, and some dark rocks near the central army.

The whole-map campaign route now uses explicit WebGPU map/territory style
constants instead of sharing the close-fixture wash. Stronger real-map
territory alpha plus a lighter sea tint moved Campaign Whole Map from
`0.36278` full / `0.37717` world crop to `0.28160` full / `0.29252` world
crop while leaving Campaign Label Zoom at `0.17429` / `0.23263`. A broader
exposure/saturation/vignette shader refactor was rejected because it produced a
black controlled close capture despite the route completing.

Fresh unprimed overview critique still blocks calling the whole map visually
done. It flags thin dashed/diagonal sea construction lines, missing overview
army/flag markers, weak coastline glow/depth, a still-muted/muddy palette,
large-label clipping and collisions, lower-contrast sea labels, translucent
polygon/fog bands, small city icons, and flatter layer separation. The accepted
checkpoint is a measured parity improvement only; the next overview pass should
target coastline/sea-lane artifacts, army marker LOD, and label layout before
further palette tuning.

The sea-lane bands are now thinner and lower alpha so they read as subtle
routes rather than construction/debug lines over the darker WebGPU water.
Campaign Whole Map moved from `0.28160` full / `0.29252` world crop to
`0.27079` full / `0.28114` world crop; Campaign Label Zoom stayed unchanged at
`0.17429` / `0.23263`. Fresh unprimed critique no longer called out the sea
construction-line artifact, but it still blocks whole-map acceptance on missing
overview army/flag markers, flat territory overlays, weak coastlines, low-
contrast sea labels, faction/city label collisions, muted terrain contrast, and
top-toolbar clipping.

An overview marker LOD experiment was rejected. Restoring all 412 city markers
plus army markers produced black-ring speckle and worsened Campaign Whole Map
to `0.29188` / `0.30326`; army-only flag markers were less noisy but still did
not satisfy fresh critique and scored `0.27100` / `0.28136`; tier-2+ city dots
plus flags still read as stipple/noise and scored `0.27184` / `0.28224`. Keep
the marker work for a dedicated old-map LOD pass with better icon shapes and
label rules instead of committing this halfway layer.

The map shader now derives a soft shoreline rim from neighboring sea-mask
samples, improving coast/island separation without adding geometry or touching
the controlled close fixture. Campaign Whole Map moved from `0.27079` full /
`0.28114` world crop to `0.26943` full / `0.27974` world crop, while Campaign
Label Zoom stayed unchanged at `0.17429` / `0.23263`.

The whole-map route is no longer allowed to hide a darkness regression behind a
better pixel score. The real-map sea tint is lighter and the real-map
cloud/parchment veil is stronger, while the controlled close fixture keeps its
previous map/cloud constants. This cut the Campaign Whole Map average luminance
gap against the archived renderer from `-12.9` to `-4.5` and improved parity
from `0.26943` full / `0.27974` crop to `0.23252` full / `0.24128` crop. Campaign
Label Zoom stayed unchanged at `0.17429` / `0.23263`; Campaign Handoff Battle
moved slightly from `0.17936` / `0.16380` to `0.17883` / `0.16293`.

Fresh unprimed critique on this candidate no longer reports the overview as
globally too dark, but it still blocks visual acceptance. High-confidence
findings are uneven/patchy haze, fog washing out the Atlantic/Iberia and
bottom-left Africa edges, top-toolbar clipping over `LONDINIUM`, right-edge
clipping of `SELEUCIDS`, and harsh large-label halos. Medium findings remain:
low-readability sea labels, muddy overlapping territory washes, tiny city
icons/labels, no obvious selected entity, and sparse/no visible 3D campaign
pieces in the overview. The next overview pass should target cloud distribution
and label/marker LOD before claiming whole-map parity.

Whole-map faction labels now get a deterministic inward screen offset near the
map's east/west edges, fixing the visible `SELEUCIDS` right-edge clipping
without changing Campaign Label Zoom. Campaign Whole Map moves from `0.23252`
full / `0.24128` crop to `0.23458` full / `0.24343` crop, a small metric
tradeoff for the visible label fix; Campaign Label Zoom stays at `0.17429` /
`0.23263`. Fresh unprimed critique no longer flags right-edge label clipping,
but still blocks overview acceptance on top-toolbar clipping over `LONDINIUM`,
bottom-edge label crowding, city/faction label collisions around Gaul and
Macedon, heavy halos, low-contrast sea labels, blotchy edge fog, muddy stacked
territory tints, and tiny pasted-on city markers.

The same deterministic label-edge policy now covers the north/south map edges:
city and faction labels near the top are nudged below the toolbar, and southern
labels are nudged upward before they clip at the viewport bottom. Campaign
Whole Map moves from `0.23458` full / `0.24343` crop to `0.23783` full /
`0.24685` crop; Campaign Label Zoom stays at `0.17429` / `0.23263`. Fresh
unprimed critique confirms no major settlement or faction label is clipped by
the top toolbar, and bottom labels are close but not visibly clipped. Remaining
high-confidence blockers are now label collisions (`CARTHAGE` over a North
Africa city label, `MACEDON` over `CONSTANTINOPOLIS`), plus lower-confidence
sea-label readability, fog softness, territory blob seams, and label-weight
mismatch.

The overview darkness complaint is now tracked directly in the comparison
helper via `avgLuminanceCurrent`, `avgLuminanceCandidate`, and
`avgLuminanceDelta` for both full-frame and world-crop rows. A sea/territory
palette trial reduced the visible luminance gap but was rejected because it
worsened Campaign Whole Map to `0.25649` full / `0.26631` crop. The accepted
route-specific fix raises only the real-map `CampaignCloudPass` parchment/cloud
alpha scale from `1.45` to `1.75`, moving Campaign Whole Map from `0.23783` full
/ `0.24685` crop to `0.23102` full / `0.23976` crop while leaving Campaign
Label Zoom unchanged at `0.17429` / `0.23263`. The world crop luminance delta
is now `-2.53214` in the JSON metric, and a near-black-excluded manual check
put the crop at about `150.0` versus archived `153.1`, down from a roughly
`-5.2` gap before this pass.

Fresh unprimed critique on the accepted brightness candidate no longer frames
the right-hand WebGPU overview as globally too dark, but still blocks visual
acceptance. High-confidence findings remain: right-side cloud blur patches wash
out lower corners, small city labels/icons are hard to read, `MACEDON` crowds
Greece/Aegean labels, `SELEUCIDS` still feels edge-cramped, sea labels are
decorative but weak, `LONDINIUM` remains close to the toolbar, and the sea is
dark/saturated against pale land/fog. Next passes should target cloud shape,
sea-label readability, marker/icon scale, and faction/city label collisions.

The latest overview pass raises the real-map cloud/parchment scale again and
switches sea labels to a pale fill with a dark halo. Campaign Whole Map moves
from `0.23102` full / `0.23976` world crop to `0.22694` full / `0.23549` world
crop, and the world-crop luminance delta improves from `-2.53214` to
`-1.99825`; Campaign Label Zoom stays unchanged at `0.17429` / `0.23263`. Fresh
critique still rejects the overview as accepted parity: it flags missing old
campaign flag/unit markers, city/faction label collisions, tiny city labels,
smeared edge fog, muddy territory stacking, weak sea-label readability, heavy
faction shadows, and noisy land texture. A circle-marker experiment was pruned
instead of committed because it did not read as the old flag/icon map language.

The old overview marker language is now partially restored through the raw
WebGPU marker pass: tier-gated city squares and army pennants are constant
screen-size quads anchored to world positions, matching the retired overlay's
LOD semantics instead of using world-radius circles. This intentionally trades
the Campaign Whole Map metric from `0.22694` full / `0.23549` crop to `0.22827`
full / `0.23687` crop, while a fresh unbiased comparison judged the new
candidate more complete/readable because map markers, roads/rivers, city
labels, and geographic labels are clearer. The same review says the pair is
still not close style parity: terrain detail density, sea text treatment,
overall sharpness, label hierarchy, fog, and faction overlay style remain
distinct.

Sea labels now use the retired overlay's uppercase antique-chart treatment:
spaced italic Georgia text with the old blue fill and dark halo. Campaign Whole
Map improves from `0.22827` full / `0.23687` crop to `0.22426` full / `0.23266`
crop, and the full-frame luminance gap improves from `-1.97970` to `-1.84539`.
Fresh unbiased review again judged the WebGPU candidate more complete/readable
because it exposes roads, city labels, markers, and terrain structure more
clearly. The remaining overview gap is style parity rather than missing content:
Image B is still more information-dense/sharp than the archived renderer, and
the review says the pair is not close to full visual parity.

The overview darkness complaint is now handled with the narrowest atmosphere
knob instead of repainting the map. A trial that lifted map/territory colors
made the whole-map luminance nearly exact but worsened structural parity, so it
was rejected. Raising only the real-map cloud/parchment scale from `1.9` to
`2.05` moves the Campaign Whole Map luminance delta from `-1.84539` full /
`-1.99877` crop to `-0.82644` full / `-0.94522` crop; the score tradeoff is
small (`0.22426` / `0.23266` to `0.22443` / `0.23285`) and controlled close
campaign remains unchanged.
Fresh unprimed critique on this candidate says Image B no longer reads darker;
it reads lighter/hazier overall. Acceptance is still blocked by opaque edge
fog/cloud wash, black land speckle, small busy city labels, noisy internal
province/river lines, ambiguous tiny markers, flatter coastlines, and label
collisions. The next overview pass should keep the luminance gain while making
the cloud/fog distribution less opaque and restoring coast/label readability.
