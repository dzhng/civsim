# 20 — Campaign Entities And Panels

## Contract

Campaign cities, armies, flags, selection rings, movement previews, diplomacy
readouts, city panels, class builder, recruitment/replenish controls, and
neutral/foe/friend semantics compose correctly over the WebGPU campaign map.

The old 3D campaign city/town clusters, army standard/representative-figure
marker, shadows, flags, and label icons are the migration target. Procedural
flat seals or billboards are acceptable only while the raw-WebGPU pass is being
built; they do not satisfy final visual parity.

This slice is blocked from final acceptance until campaign entities are true
3D objects in the shared depth-tested render graph from slice 13. A city flag is
not a separate overlay and not a taller billboard: the pole and cloth must be
physically planted inside the settlement model, with the front roofs/walls
occluding the lower standard according to camera depth. The same foundation must
support future garrisons: an army can occupy the city volume and be partially or
fully hidden by the city without special-case painter-order hacks.

## API Seam

- `packages/game-renderer/src/campaign/entityPass.ts`
  - current checkpoint: WebGPU city/army markers, colored by faction livery
    with a separate allegiance accent. Next checkpoint: port the old 3D
    settlement clusters and army-standard/figure markers into raw WebGPU.
  - final checkpoint: depth-tested city/army meshes using the shared 3D camera
    and graph attachment contract, including nested child/occupant transforms
    for city standards and garrisoned armies.
- `packages/game-renderer/src/campaign/sceneryPass.ts`
  - true 3D campaign props share the same campaign world-depth helper as
    cities and armies. Trees, rocks, and mountains may be type-batched for draw
    efficiency, but they must not define their own depth scale or pass-local
    ordering truth.
- `packages/game-renderer/src/campaign/selectionPass.ts`
  - current checkpoint: WebGPU city/army selection footprints in the campaign
    selection language.
  - final parity checkpoint: selection rings are ground-plane world geometry
    that foreshorten with the campaign perspective camera. A perfect screen
    circle or flat orthographic oval is a regression at close campaign zoom.
- `web/src/campaign/webgpuUiLayer.ts`
  - deliberately retains dense campaign panels in DOM for this slice while
    reporting the WebGPU-vs-DOM ownership split for screenshot/cutover audit.
- `web/src/campaign/rendererWebGPU.ts`
  - production adapter path that composes WebGPU city/army glyphs and selection
    rings with the normal campaign DOM panels and live wasm views.

## Playable Deliverable

- `/webgpu/campaign-ui`
- `/?campaign=test`
- archived migration captures for legacy comparison, not a live renderer route
- Controlled test campaign with our city, neutral city, road army, selected
  army, diplomacy states, class builder, city panel, and replenish toggle.
- Current checkpoint uses procedural WebGPU terrain for the controlled fixture;
  `/webgpu/campaign-map` remains the real-map texture upload checkpoint.

## Verification

- `web/scenarios/webgpu-lab-routes.mjs` opens `/webgpu/campaign-ui` and checks
  route stats, WebGPU entity/selection pixels, retained panel DOM, and army/city
  labels.
- The scenario clicks the projected army marker and city marker through real
  mouse events, then asserts the selected army/city and `lastPick` state.
- `web/scenarios/campaign-webgpu-production.mjs` repeats the click-selection
  and panel checks through the normal campaign scene rather than the lab-only
  fixture.
- `web/scenarios/campaign-webgpu-visual.mjs` owns the controlled production
  WebGPU screenshots for our city, neutral city, road army, diplomacy, class
  builder, city panel, and replenish toggle.
- Additional model-level screenshots must isolate city/town markers, army flags
  attached to units, selection rings, label icons, and representative figures
  before the whole-scene visual report can accept this slice.
- Nested-model screenshots must isolate:
  - city flag planted through the city core, with the city occluding the lower
    pole/cloth.
  - army outside city, partially garrisoned in city, and fully hidden inside
    city using the same model/depth path.
  - selected city and selected army rings on the ground plane, with city/army
    geometry occluding the portions underneath their footprints.
- Selection-ring screenshots must show the ring sitting outside the city/army
  shadow footprint and projected with the same perspective as the terrain.

## Must Stay Green

- Campaign ownership/livery semantics stay intact.
- Save/load data format is untouched.
- Battle handoff remains disabled in visual-only fixtures.
- The retained DOM layer is explicit and transitional; WebGPU owns the map,
  entity glyphs, roads, and selection footprints for this checkpoint.
- Any city/flag/army overlap fix that works only by changing triangle append
  order is temporary debt and must not be recorded as final parity.
- Any prop-over-flag or ring-over-soldier fix that works by tuning per-pass
  depth constants is temporary debt. The accepted path is shared world-depth
  helpers plus explicit background/world/decal/overlay pass categories.

## Human Feedback

Review whether campaign markers are clear at strategic zooms; do not optimize
for hero-detail soldiers at the cost of map readability.

Current production model gates prove the required depth behavior for the city
standard and for an army occupant inside the city, but the visual acceptance bar
is still open. Fresh critique of the garrison gate flags the flag/pole mounting,
roof/banner layering, selection-ring contrast, soft shadows, noisy terrain, and
test-tile context. Treat those as campaign entity polish blockers before this
slice can claim parity with the old renderer.

Latest checkpoint: city and army standards now include visible hoist/crossbar
geometry and the city mast has a small roof collar so the marker is less purely
cloth-over-roof. This preserved the nested-object pixel gates and improved the
close campaign parity metric, but unprimed critique still flags the flags as
physically wrong, with missing contact/cast shadows and weak selection/label
readability. The next entity slice should improve sockets, shadows, ring
contrast, and label spacing before claiming campaign marker parity.

Follow-up checkpoint: campaign entities now emit local contact-shadow footprints
for city buildings, standards, and individual army soldiers, and the selection
shader balances a stronger selected-state ring against the unprimed critique's
"too neon/flat" finding. The visual report and model gates regenerated with
Campaign Label Zoom at `0.19910` full / `0.26555` crop, slightly better than the
previous `0.19952` / `0.26605` while keeping the ring readable. This still does
not accept the slice: fresh critique continues to flag flag/pole clipping,
insufficient grounding, ambiguous road depth at the selected army, merged army
silhouettes, confusing city massing, small army-count text, noisy close terrain,
and hard board-edge framing.

Architecture checkpoint: campaign true-3D buckets now share one campaign
world-depth helper from `packages/webgpu-core/src/cameraWgsl.ts`. Entity meshes,
scenery meshes, roads, and ground selections render in the depth world pass with
explicit write policy: entities/scenery write depth, while roads/selections are
ground decals that test depth but do not reserve occlusion. Type buckets remain
for batching only. They are not allowed to make a tree visually win over a
nearer flag, or a selection ring float above soldiers, by using a private depth
formula. The scenery authoring pass also consumes explicit city/army footprint
reservations from the current entity frame and reserves controlled road
corridors for all prop kinds, not just rocks/mountains, so deterministic trees
are not planted into the same readable footprint as standards. Army reservations
cover the raised standard silhouette, not just the soldiers' ground footprint,
because tall trees behind the unit can otherwise project into the flag column
at campaign pitch.

Fresh screenshot critique after this architecture checkpoint confirms the
tree-over-standard artifact is removed from Campaign Label Zoom, but it does not
accept the visual. The next blocker list is: road/selection/unit stacking lacks
a clear over-under read; the selected ring is too neon for the palette; the
army label and count are cramped; army and city flag joins still read weak or
blocky; army shadows blend into the road/ring; soldier/pole ordering is still
stripe-like; city roofs/walls need stronger depth separation; the board edge
still reads artificial; terrain features are soft; and the raised road texture
is blurry/repetitive. Treat these as follow-up architecture/art tasks before
campaign close-view parity can be accepted.
