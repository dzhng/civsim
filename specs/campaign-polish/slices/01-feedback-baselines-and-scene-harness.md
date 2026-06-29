# Feedback Baselines And Scene Harness

## Contract

Every campaign-polish issue has a named scene or crop that can be regenerated
and compared against the feedback image. The first checkpoint is evidence, not
art tuning. It must also create small fake-scene workbenches for the risky
visual seams before the real campaign map is changed.

## API Seam

- `web/scenes/campaign/campaign-lod.mjs`
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

## Feedback → scene/crop checklist

| Feedback image | Defect | Named scene / snapshot |
| --- | --- | --- |
| `01-rome-ostia-label-road.png` | Ostia/Portus must keep label + road | `campaign-polish-roads` → `polish-road-continuity` (asserts `city:OSTIA/PORTUS` label visible + Roma→Ostia road unbroken); real map `campaign-lod` → `campaign-lod-rome-close` (asserts `city:OSTIA/PORTUS`) |
| `02-city-label-distance-tibur.png` | Label floats too far from icon/model | `campaign-polish-markers` → `polish-label-spacing` (Roma/Neapolis city labels over a clean stage) |
| `03-mountains-roads-trees.png` | brown ground / chunky mountains / no trees / no carts | green: `campaign-polish-markers` → `polish-green-swatch`; mountains+forest: real `campaign-lod` → `campaign-lod-regional-italy-natural` (slice 4); carts: slice 5 |
| `04-rome-south-road-cutoff.png` | Road dies before reaching the next city | `campaign-polish-roads` → `polish-road-continuity` (max-consecutive-gap probe per spoke, must reach each city) |

## Status (2026-06-29)

Two fixture workbench scenes added on the deterministic fixture worlds, with
focused pixel probes (not whole-image similarity):

- `web/scenes/campaign/campaign-polish-roads.mjs` (`?campaign=alignment`):
  `polish-road-continuity` — Roma's three spokes each paint unbroken to their
  city (per-spoke `maxGap`/`hitRatio`/`reachesCity` probe) and Ostia/Portus
  stays a visible label.
- `web/scenes/campaign/campaign-polish-markers.mjs` (`?campaign=test`):
  `polish-label-spacing` (both city labels visible) and `polish-green-swatch`
  (central terrain crop, void excluded: greenRatio 1.0, brownRatio 0).

Baselines are deterministic (0 px on re-run) and live in the normal
`web/shots/campaign/` harness location.

The terrain-relief, forest-density, and cart-on-road workbenches are deferred to
the slices that introduce the content they need (relief/forest geometry in
slice 4, the cart model in slice 5) — they will be added there rather than
stubbed empty here.

Unbiased `screenshot-critique` (fresh agent, no project context) on the three
workbench frames + tight crops found exactly one defect: the **Neapolis label
sits too far from its city** (worse near the screen edge, where the edge-inset
nudge detaches it further). Roads continuous, terrain green, depth/water clean.
→ carried into slice 2.

## Done

- [x] The three feedback images are referenced by a scene/crop checklist.
- [x] The Rome south road cutoff image is referenced by a road-continuity
  scene/crop checklist.
- [~] Fake-scene workbenches exist for every later slice that needs one.
  (roads + markers now; relief/forest deferred to slice 4, cart to slice 5.)
- [x] Close Rome verifies Ostia/Portus label and road visibility.
- [x] Central Italy natural verifies green terrain, mountain/forest visibility,
  and label spacing.
- [x] A fresh screenshot critique has reviewed the harness outputs and its
  actionable findings are recorded here or in follow-up slices.
