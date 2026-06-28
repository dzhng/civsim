# Campaign Polish

## Goal

Polish the WebGPU campaign experience until the main campaign map feels playable,
legible, and better than the previous renderer. This spec is deliberately narrow:
campaign visuals, campaign LoD/readability, and campaign life. The WebGPU
foundation is already closed in
[../done/webgpu-skinned-crowd-foundation/README.md](../done/webgpu-skinned-crowd-foundation/README.md).

## Starting Feedback

The first review target is the user-provided screenshots in
[`assets/user-feedback/`](assets/user-feedback/README.md):

- [Rome/Ostia label and road](assets/user-feedback/01-rome-ostia-label-road.png)
- [Tibur label distance](assets/user-feedback/02-city-label-distance-tibur.png)
- [Mountains, roads, and missing trees](assets/user-feedback/03-mountains-roads-trees.png)
- [Rome south road cutoff](assets/user-feedback/04-rome-south-road-cutoff.png)

Specific blockers:

- Double-check the bottom-left coastal city near Rome, Ostia/Portus: its label
  and road must remain visible.
- The road leaving Rome to the south must remain continuous until it reaches the
  next city; no segment should disappear under terrain, city footprints, or
  scene ordering.
- City labels sit far too far from their city icons/models. The margin should be
  about one label/icon height.
- Natural ground reads brown instead of green compared with the previous
  campaign renderer.
- Mountains look chunky, cover or compete with cities and roads, and need better
  placement/scale/style. One feedback crop shows a city visibly embedded in the
  mountain mass; this should be treated as a clearance failure.
- Trees/forests are missing from acceptance views.
- Carts or other small road-life props are missing.

## Principles

- Previous campaign behavior on `main`/`origin/main` is the business-logic
  baseline whenever map data, visibility, roads, labels, or LoD rules are
  unclear.
- Cities and roads are ground truth. Do not move cities to satisfy terrain or
  water; fix the shared campaign coordinate/projection contract instead.
- Natural terrain and faction overlays are different views. Green terrain must
  be judged with faction view off.
- Visual evidence belongs in this spec. Whenever new user screenshot feedback
  arrives, copy it into `assets/user-feedback/<date-or-topic>/` or the nearest
  stable folder here, then update the relevant slice.
- Metrics are guardrails, not goals. Use screenshots, crop checks, critique, and
  human review to decide whether a scene is accepted.
- Keep this spec small. Do not copy generated report folders, visual-diff
  outputs, or broad WebGPU release artifacts into it unless they are directly
  used for campaign polish review.
- Prefer campaign terrain relief and biome treatment for mountain ranges over
  scattering battle-style rock/mountain props on top of the map. Individual
  3D rock/mountain props may still be used as small accents, but the campaign
  map should get its range shape, road/city clearance, and depth ordering from a
  single terrain surface.
- Every slice must finish with an unbiased `screenshot-critique` pass using the
  current full screenshot plus tight 2x-4x crops for the exact feature under
  review. Record any actionable critique in the slice before calling it done.

## Review Scenes

Use the [write-scene](../../.agents/skills/write-scene/SKILL.md) skill when
adding or restructuring these harness scenes. New campaign polish scenes should
live under `web/scenes/campaign/`, write baselines under `web/shots/campaign/`,
and use focused fixture worlds before full-map acceptance.

- Close Rome with selected army/city: labels, road spokes, Ostia/Portus, Roma,
  selection ring, city/army composition.
- Road continuity workbench: a fake terrain plane, two city markers, and a road
  spline that crosses city/terrain boundaries without getting clipped.
- Central Italy natural: green terrain, road continuity, cities, forests,
  mountains, labels.
- Central Italy faction view: same camera, proving overlays do not distort
  terrain/road/city alignment.
- Terrain relief workbench: one raised mountain ridge, one nearby city, one road
  crossing foothills, and no prop stack hiding roads or labels.
- Mountain/forest crop: Apennines with cities and roads nearby.
- Forest/tree density workbench: one forest biome patch with many campaign-scale
  trees and a neighboring road/city clearance zone.
- Road-life workbench: a cart model moving deterministically along a known road
  spline before it appears in the full campaign map.
- Road-life crop: deterministic carts or road traffic on real campaign roads.
- Fog crop: hidden flags/labels/markers absent, border fog preserved.

## Asset Ownership

- Campaign-only 3D model definitions belong under
  `packages/game-renderer/src/models/campaign/`.
- Battle-only 3D model definitions belong under
  `packages/game-renderer/src/models/battle/`.
- Reusable assets such as soldiers, trees, rocks, flags, banners, carts, and
  shared props belong under `packages/game-renderer/src/models/shared/`.
- New model review baselines belong under `web/shots/models/{campaign,battle,shared}/`.
  Animation GIFs live in the matching model owner's `anim/` folder.
- When a new 3D model is created, generate its static turntable with the
  `write-turntable` workflow and add animation review GIFs with `write-anim`
  when it moves. Future campaign flags, army banners, carts, trees, and soldiers
  should all have an animation review path.

## Next Agent Prompt

You are picking up campaign polish. Last updated: 2026-06-29.

Current status: the visual harness/source ownership cleanup is complete.
Scenes, shots, UI captures, model turntables, model animations, vibe timelines,
and weave timelines have been regenerated from scratch against the WebGPU
pipeline.

Next pickup: start Slice 1 by adding the focused campaign workbench scenes with
the `write-scene` skill, using the existing regenerated WebGPU baselines as the
review floor.

Active warning: the harness is green, but the campaign-polish visual issues in
the user-feedback screenshots are intentionally not solved yet. Do not mark a
slice done until its focused scene and real campaign crop both pass an unbiased
`screenshot-critique` review.

Before ending any future pass, update this section with the new status, next
pickup point, blockers, and checklist state.

Global TODO:

- [ ] Slice 1: feedback baselines and focused campaign workbench scenes exist.
- [ ] Slice 2: city label spacing and Rome road continuity pass in fixture and
  close Rome campaign scene.
- [ ] Slice 3: natural terrain color passes fixture and real Central Italy crop.
- [ ] Slice 4: terrain relief, forests, and clearance pass fixture and real
  campaign crop.
- [ ] Slice 5: deterministic road-life/cart fixture and campaign crop pass.
- [ ] Slice 6: final campaign acceptance pass has current screenshots, crops,
  and unbiased screenshot critique for every slice.

## Slices

1. [Feedback Baselines And Scene Harness](slices/01-feedback-baselines-and-scene-harness.md)
2. [City Labels And Rome Road Readability](slices/02-city-labels-and-rome-road-readability.md)
3. [Natural Terrain Color](slices/03-natural-terrain-color.md)
4. [Landforms Forests And Clearance](slices/04-landforms-forests-and-clearance.md)
5. [Road Life](slices/05-road-life.md)
6. [Campaign Acceptance Pass](slices/06-campaign-acceptance-pass.md)
