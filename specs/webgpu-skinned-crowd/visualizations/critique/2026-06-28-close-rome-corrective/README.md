# Close Rome Corrective Critique

## Captures Reviewed

- `web/shots/scenes/campaign-lod-rome-close.png`
- `web/shots/scenes/campaign-lod-selected-army-city.png`
- `web/shots/scenes/campaign-lod-regional-italy-natural.png`
- `visualizations/campaign-entities/close-rome-ostia-label-road-3x.png`
- `visualizations/campaign-entities/selected-rome-garrison-label-3x.png`
- `visualizations/campaign-roads/roma-road-hub-3x.png`
- `visualizations/campaign-roads/tibur-road-join-3x.png`

## Accepted Progress

- Close Rome natural views now render green terrain instead of inheriting the
  brown political wash.
- Ostia/Portus remains visible in close Rome and selected Roma garrison views.
- The Roma-Ostia/Portus road is visible again.
- Composed Roma garrison labels no longer cull unrelated nearby city labels.
- Road/city/terrain alignment and green terrain are covered by scenario probes.

## Open Findings

- Roma selection ring is too low-contrast and competes with the road hub/shadow.
- Roma road hub still reads messy where roads enter the city footprint.
- Tibur road geometry remains jagged/kinked.
- Close labels are blurry/heavy-haloed and the Roma/Ostia label cluster is crowded.
- Regional top-edge labels can clip under the HUD.
- Mountain-region labels collide around Asculum/Castrum Truentinum.
- City shadows are too flat and heavy.
- Some flag poles still feel weakly attached to roofs.
- Water dash artifacts and strong coastline glow remain visible.
- Regional model scale needs another pass for scan clarity.

This critique accepts the corrective checkpoint as progress, not final campaign
visual parity.
