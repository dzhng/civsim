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
- `web/scenes/campaign/campaign-webgpu-lod.mjs` visible-label and road probes for the
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

## Status (2026-06-29)

**Label margin — relief-aware.** Root cause: city *labels* project at the flat
z=0 ground anchor (`projectScreen` in `mapPass.ts:387`, no height term) while
city *models* sit at terrain height (`world3dToScreen` adds `wz`). So an inland
city's model rides up over its raised ground and the old `baseSize*1.30/1.45`
offset left two-to-three label heights of empty grass under it (Tibur 7.9 km,
Reate 16 km of relief; Tibur measured ~3.5 label heights). Fix in
`cityLabelOffset` (`web/src/campaign/rendererWebGPU.ts`): target a constant
`~one label height` gap and *subtract* the model's screen rise
`reliefPx = h*zoom/depth` (`cityReliefRisePx`), so the offset goes negative for a
perched city (name climbs to the model's foot) and stays positive for a
coastal-flat one. `depth` floored at 1 so near-camera foreshortening doesn't
over-yank a flat coastal city (Ostia) up into the capital's garrison label.

**Roma→Ostia/Portus road probe added.** The gap review flagged that
`CENTRAL_ITALY_ROAD_PAIRS` omitted that pair; it is now probed in
`campaign-webgpu-lod` (continuous, on land). The `polish-road-continuity`
workbench (slice 1) gates Rome-south continuity on the fixture first.

Baselines re-blessed across all labeled campaign scenes (20 shots: lod,
map-alignment, polish-*, tiny-*, ui-*). The regional diff is label-only (every
red mark is a name moving up to its city; terrain/roads/water unchanged) and
re-runs at 0 px. Real-map stat checks (Ostia label visible + not culled, road
continuity, green floor, terrain density) still pass.

Unbiased `screenshot-critique` (fresh agent, full close-Rome frame + Tibur /
cluster / Ostia crops + the pre-change Ostia for reference): label-to-city
spacing "consistent and reasonable," Tibur/cluster "just right," and the
OSTIA/PORTUS-next-to-1ST-LEGION case judged a **net improvement** in
readability. No high-confidence issues.

## Done

- [x] City label margin is about one label/icon height in the target crops.
- [x] Ostia/Portus label remains visible.
- [x] Roma to Ostia/Portus road remains visible.
- [x] The Rome south route remains continuous until it reaches the next city.
- [x] Garrisoned army/city label stays readable without hiding nearby cities.
- [x] The fake road-continuity workbench passes before the full campaign scene
  is accepted.
- [x] A fresh screenshot critique has reviewed label distance and road
  continuity crops.
