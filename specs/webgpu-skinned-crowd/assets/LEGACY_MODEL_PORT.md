# Legacy Model Port Contract

## Purpose

The WebGPU port retires Babylon/WebGL as runtime architecture, but it does not
discard the previous game's strongest visual work. The old 3D towns, campaign
props, terrain treatment, soldier silhouettes, and animation references are the
first parity target. WebGPU can replace them only when the replacement is
measurably equal-or-better and intentionally accepted.

## Authoritative References

- `web/shots/baseline/models/*.png`: turntable/model baselines for unit classes.
- `web/shots/baseline/models-ingame/*.png`: in-game soldier model readability
  references.
- `web/shots/anim/*.gif`: existing pose/animation references for walk, run,
  attack, hit, and death.
- `web/shots/baseline/campaign-3d.png`, `campaign-natural.png`,
  `campaign-political.png`, `tiny-army-*.png`, and `ui-city-panel.png`:
  campaign model, road, terrain, city, and army references.
- `web/src/campaign/icons.ts`, `web/src/campaign/status.ts`, and existing
  campaign label screenshots: label icon silhouettes, allegiance colors,
  Cinzel/Georgia typography, and text/icon composition references.
- `specs/webgpu-skinned-crowd/visualizations/current-renderer/*.png`:
  archived full-surface migration captures.
- Git-history source references:
  - `web/src/battle/renderer3d.ts`
  - `web/src/battle/turntable.ts`
  - `web/src/campaign/terrain3d.ts`
  - `web/src/shared/soldierModel.ts`

## Port Targets

- Soldiers: preserve class silhouettes, equipment language, faction accents,
  stance readability, mounted/unmounted distinction, and existing animation
  beats before adding new art.
- Cities and towns: preserve the old clustered 3D settlement language, roof
  masses, towers, ownership flags, shadows, and selected-city footprint.
- Army markers: preserve standards attached to the army, representative figures,
  shadows, and selection ring behavior. Flags must not detach or collapse to a
  shared origin.
- Terrain: preserve camera tilt, board framing, relief, grass/stone/water
  readability, and old terrain caveats as caveats, not as permission to regress.
- Roads, trees, rocks, and props: preserve their screen-space density and
  perspective relationship to the terrain at campaign gameplay zoom.
- Fonts and label icons: preserve city/army/faction/sea font choices, halos,
  colors, icon silhouettes, and icon placement next to label text. Bare text is
  not a parity replacement for the old icon+text labels.

## Required Screenshot Gates

Add WebGPU screenshot gates for:

- soldier model turntable/contact sheets versus `web/shots/baseline/models/`
- in-game soldier readability versus `web/shots/baseline/models-ingame/`
- animation pose/GIF reference frames versus `web/shots/anim/`
- campaign city/town model close-up
- campaign army marker with attached flag and representative figures
- road segment with city endpoints
- tree and rock clusters
- terrain relief/water/fog samples
- campaign label typography and icon samples for city, army, faction, and sea
  labels
- full `Campaign Label Zoom` and `Battle Selection DPR2` parity comparisons

For disputed comparisons, run the `compare-screenshots` metric helper and a
fresh unbiased visual subagent review. A whole-scene screenshot can support a
release decision only after the relevant model-level gates exist.

## Acceptance Rule

Temporary placeholders are allowed only to unblock renderer architecture. They
do not satisfy visual parity. A model family is accepted when WebGPU has:

- a dedicated screenshot/reference gate,
- parity metrics when a comparable reference image exists,
- visual inspection that names old-renderer caveats separately from WebGPU
  regressions,
- no obvious missing content, detached flags, debug lines, random squares, or
  hidden performance brute force.
