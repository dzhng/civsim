# Campaign Polish

## Goal

Polish the WebGPU campaign experience until the main campaign map feels playable,
legible, and better than the previous renderer. This spec is deliberately narrow:
campaign visuals, campaign LoD/readability, and campaign life. The WebGPU
foundation is already closed in
[../done/webgpu-skinned-crowd-foundation/README.md](../done/webgpu-skinned-crowd-foundation/README.md).

## Starting Feedback

The first review target is the three user-provided screenshots in
[`assets/user-feedback/`](assets/user-feedback/README.md):

- [Rome/Ostia label and road](assets/user-feedback/01-rome-ostia-label-road.png)
- [Tibur label distance](assets/user-feedback/02-city-label-distance-tibur.png)
- [Mountains, roads, and missing trees](assets/user-feedback/03-mountains-roads-trees.png)

Specific blockers:

- Double-check the bottom-left coastal city near Rome, Ostia/Portus: its label
  and road must remain visible.
- City labels sit far too far from their city icons/models. The margin should be
  about one label/icon height.
- Natural ground reads brown instead of green compared with the previous
  campaign renderer.
- Mountains look chunky, cover or compete with cities and roads, and need better
  placement/scale/style.
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

## Review Scenes

- Close Rome with selected army/city: labels, road spokes, Ostia/Portus, Roma,
  selection ring, city/army composition.
- Central Italy natural: green terrain, road continuity, cities, forests,
  mountains, labels.
- Central Italy faction view: same camera, proving overlays do not distort
  terrain/road/city alignment.
- Mountain/forest crop: Apennines with cities and roads nearby.
- Road-life crop: deterministic carts or road traffic on real campaign roads.
- Fog crop: hidden flags/labels/markers absent, border fog preserved.

## Slices

1. [Feedback Baselines And Scene Harness](slices/01-feedback-baselines-and-scene-harness.md)
2. [City Labels And Rome Road Readability](slices/02-city-labels-and-rome-road-readability.md)
3. [Natural Terrain Color](slices/03-natural-terrain-color.md)
4. [Landforms Forests And Clearance](slices/04-landforms-forests-and-clearance.md)
5. [Road Life](slices/05-road-life.md)
6. [Campaign Acceptance Pass](slices/06-campaign-acceptance-pass.md)
