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
Treat screenshot metrics as diagnostics, not a target score. They should flag
missing content, camera drift, accidental darkness, or debug artifacts; they do
not override a fresh review that says WebGPU is more complete/readable than the
archived renderer.

## Current WebGPU Visual Blockers

The 2026-06-27 unprimed screenshot critique of the city, town, road, and
Campaign Label Zoom captures identified these open blockers:

- City and town selection footprints are projected with the world camera and sit
  outside the shadow footprint, but they still read too thick, too flat, and too
  visually dominant in close model gates.
- City and town flags/poles are centered on the settlement and no longer collapse
  to the wrong origin, but the poles are too thin and the cloth still reads like a
  flat marker unless a real depth/occlusion pass proves it is integrated.
- Road color has moved toward pale stone with dark side shadows, but road/city
  transitions still look layered and clipped; roads need a real raised-terrain or
  depth-integrated connection into settlements.
- Campaign Label Zoom is missing or underscaling environmental models versus
  the archived renderer; trees, rocks, mountains, and relief density are still
  below parity.
- Labels preserve the font/icon language, but current placement collides with
  army/city geometry and can duplicate nearby city names.
- Contact shadows are below the city models now, but they still read as muddy
  blobs instead of coherent directional contact shadows.
- Whole-world lighting remains washed out and low contrast versus the archived
  renderer; model scale relationships also need tightening.
- The map plane edge is too exposed as a rectangular slab in black void; this is
  acceptable for model gates but not for final campaign framing.
- Model gates and the campaign surface have inconsistent depth language: labels
  are screen-facing, roads are flat strips, buildings are isometric blocks, and
  rings are translucent overlays. The next renderer slice needs a real depth
  buffer or an equivalent ordered pass plan before accepting these surfaces.
- The 2026-06-27 campaign geometry checkpoint improved the Campaign Label Zoom
  parity distance from `0.37215` to `0.37081`; the rejected faction-label hiding
  experiment scored `0.37748` and must not be revived as a parity shortcut.

## Acceptance Rule

Temporary placeholders are allowed only to unblock renderer architecture. They
do not satisfy visual parity. A model family is accepted when WebGPU has:

- a dedicated screenshot/reference gate,
- diagnostic metrics when a comparable reference image exists,
- visual inspection that names old-renderer caveats separately from WebGPU
  regressions,
- no obvious missing content, detached flags, debug lines, random squares, or
  hidden performance brute force.
