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

Use `MODEL_SCREENSHOT_GATES.md` as the concrete inventory. At a minimum, the
gate set must include all of the following families.

Add WebGPU screenshot gates for:

- every individual soldier class/model as a named turntable/contact-sheet frame
  versus `web/shots/baseline/models/`
- every in-game soldier class/model readability frame versus
  `web/shots/baseline/models-ingame/`
- every existing animation beat by reference frame and GIF-derived frame sample
  versus `web/shots/anim/`: idle/at-ease, walk, run, attack windup, attack
  strike, hit/recoil, death/crumple, mounted movement, and ranged firing
- campaign city and town model close-ups, including roof masses, towers, flags,
  selection footprint, and shadows
- campaign army marker close-up with attached flag, representative figures,
  faction livery, selection footprint, and no detached center-origin banners
- road segment with city endpoints and a road-only close-up
- every campaign prop family as its own image: broadleaf tree, conifer/tree
  variant, mountain massif, rock/boulder cluster, cart/traffic if present,
  shoreline/water, fog/cloud layer, and terrain relief sample
- terrain material samples for grass, scrub, stone, coast/water, fogged terrain,
  and zoomed label-terrain context
- campaign label typography and icon samples for city, army, faction, and sea
  labels, including icon color, halo, text font, and icon/text spacing
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
