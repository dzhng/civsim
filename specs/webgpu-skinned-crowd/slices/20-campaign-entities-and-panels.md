# 20 — Campaign Entities And Panels

## Contract

Campaign cities, armies, flags, selection rings, movement previews, diplomacy
readouts, city panels, class builder, recruitment/replenish controls, and
neutral/foe/friend semantics compose correctly over the WebGPU campaign map.

## API Seam

- `packages/game-renderer/src/campaign/entityPass.ts`
  - current checkpoint: WebGPU city seals and army pennants, colored by faction
    livery with a separate allegiance accent.
- `packages/game-renderer/src/campaign/selectionPass.ts`
  - current checkpoint: WebGPU city/army selection footprints in the campaign
    selection language.
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

## Must Stay Green

- Campaign ownership/livery semantics stay intact.
- Save/load data format is untouched.
- Battle handoff remains disabled in visual-only fixtures.
- The retained DOM layer is explicit and transitional; WebGPU owns the map,
  entity glyphs, roads, and selection footprints for this checkpoint.

## Human Feedback

Review whether campaign markers are clear at strategic zooms; do not optimize
for hero-detail soldiers at the cost of map readability.
