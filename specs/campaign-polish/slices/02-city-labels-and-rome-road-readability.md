# City Labels And Rome Road Readability

## Contract

Campaign labels use the old text/icon style but sit much closer to their city
icons/models. Around Rome, city labels, the garrison/army label, and roads must
not erase or obscure each other. Roads leaving Rome must render continuously to
their destination cities at the close campaign camera.

## API Seam

- `packages/game-renderer/src/campaign/mapPass.ts` label atlas and collision
  logic
- `web/src/campaign/rendererWebGPU.ts` campaign label construction
- road geometry generation/projection shared by the WebGPU campaign renderer
- a road-continuity fake scene: two city markers, a terrain plane, a road spline,
  and selectable draw-order/camera conditions
- `web/scenes/campaign-webgpu-lod.mjs` visible-label and road probes for the
  real close Rome camera

## Human Review

Use `assets/user-feedback/01-rome-ostia-label-road.png` and
`assets/user-feedback/02-city-label-distance-tibur.png` for label placement.
Use `assets/user-feedback/04-rome-south-road-cutoff.png` for road continuity.
Labels should sit about one label/icon height from their icon/model.
Ostia/Portus and the roads leaving Rome must remain visible in the close Rome
view.

## Verification

- Add a label-distance probe for city labels in close/regional views.
- Keep a named assertion for `city:OSTIA/PORTUS` visibility.
- Keep road pixel probes on the Roma to Ostia/Portus route.
- Add a named road-continuity probe for the Rome south route shown in
  `04-rome-south-road-cutoff.png`.
- Verify the road-continuity fake scene before touching the real map.
- Run screenshot critique on close Rome and the road-continuity crop after any
  label or road change.

## Done

- [ ] City label margin is about one label/icon height in the target crops.
- [ ] Ostia/Portus label remains visible.
- [ ] Roma to Ostia/Portus road remains visible.
- [ ] The Rome south route remains continuous until it reaches the next city.
- [ ] Garrisoned army/city label stays readable without hiding nearby cities.
- [ ] The fake road-continuity workbench passes before the full campaign scene
  is accepted.
- [ ] A fresh screenshot critique has reviewed label distance and road
  continuity crops.
