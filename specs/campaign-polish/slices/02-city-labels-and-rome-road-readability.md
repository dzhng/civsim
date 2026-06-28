# City Labels And Rome Road Readability

## Contract

Campaign labels use the old text/icon style but sit much closer to their city
icons/models. Around Rome, city labels, the garrison/army label, and roads must
not erase or obscure each other.

## API Seam

- `packages/game-renderer/src/campaign/mapPass.ts` label atlas and collision
  logic
- `web/src/campaign/rendererWebGPU.ts` campaign label construction
- `web/scenes/campaign-webgpu-lod.mjs` visible-label and road probes

## Human Review

Use `assets/user-feedback/01-rome-ostia-label-road.png` and
`assets/user-feedback/02-city-label-distance-tibur.png`. Labels should sit about
one label/icon height from their icon/model. Ostia/Portus and its road must
remain visible in the close Rome view.

## Verification

- Add a label-distance probe for city labels in close/regional views.
- Keep a named assertion for `city:OSTIA/PORTUS` visibility.
- Keep road pixel probes on the Roma to Ostia/Portus route.
- Run screenshot critique on close Rome after any label or road change.

## Done

- [ ] City label margin is about one label/icon height in the target crops.
- [ ] Ostia/Portus label remains visible.
- [ ] Roma to Ostia/Portus road remains visible.
- [ ] Garrisoned army/city label stays readable without hiding nearby cities.
