# 19 — Campaign Map Renderer

## Contract

The campaign map world surface is raw WebGPU: parchment terrain, sea, water
glint, foam, roads, borders, territory washes, clouds, fog, labels, and camera
zoom/tilt behavior render without the current campaign renderer.

Campaign map parity includes the previous 3D renderer's board framing, terrain
relief, water/grass readability, tree/rock density, road treatment, and
map-label typography/icons. A flat parchment-only approximation is a temporary
scaffold, not final parity.

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
