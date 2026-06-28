# Feedback Baselines And Scene Harness

## Contract

Every campaign-polish issue has a named scene or crop that can be regenerated
and compared against the feedback image. The first checkpoint is evidence, not
art tuning. It must also create small fake-scene workbenches for the risky
visual seams before the real campaign map is changed.

## API Seam

- `web/scenes/campaign/campaign-webgpu-lod.mjs`
- a new campaign-polish scene/workbench module if the current scene file becomes
  too broad
- the `write-scene` skill for scene shape, deterministic fixtures, snapshot
  ownership, and focused visual/flow separation
- campaign debug hooks exposed through `window.__campaign`
- screenshot assets under `specs/campaign-polish/assets/user-feedback/`

## Human Review

Open the generated close Rome, central Italy, mountain/forest, and Rome south
road crops beside the feedback images. The reviewer should also be able to open
the fake-scene workbenches and understand the single visual contract each one
tests without loading the full campaign.

## Verification

- Add or update scene outputs for the attached feedback views.
- Add fake-scene outputs for:
  - city label spacing around a known marker,
  - continuous road spline between two markers,
  - green natural terrain swatch/plane,
  - raised terrain ridge with city/road clearance,
  - forest/tree density with clearance,
  - cart-on-road placement.
- Store only the focused review crops in this spec if they are used for
  judgment.
- Keep full generated snapshots in the normal `web/shots` harness location.
- Run `screenshot-critique` on the full scene and crops before accepting the
  harness itself.

## Done

- [ ] The three feedback images are referenced by a scene/crop checklist.
- [ ] The Rome south road cutoff image is referenced by a road-continuity
  scene/crop checklist.
- [ ] Fake-scene workbenches exist for every later slice that needs one.
- [ ] Close Rome verifies Ostia/Portus label and road visibility.
- [ ] Central Italy natural verifies green terrain, mountain/forest visibility,
  and label spacing.
- [ ] A fresh screenshot critique has reviewed the harness outputs and its
  actionable findings are recorded here or in follow-up slices.
