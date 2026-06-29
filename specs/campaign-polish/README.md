# Campaign Polish

## Goal

Polish the WebGPU campaign experience until the main campaign map feels playable,
legible, and better than the previous renderer. This spec is deliberately narrow:
campaign visuals, campaign LoD/readability, and campaign life. The WebGPU
foundation is already closed in
[../done/renderer-skinned-crowd-foundation/README.md](../done/renderer-skinned-crowd-foundation/README.md).

## Starting Feedback

The first review target is the user-provided screenshots in
[`assets/user-feedback/`](assets/user-feedback/README.md):

- [Rome/Ostia label and road](assets/user-feedback/01-rome-ostia-label-road.png)
- [Tibur label distance](assets/user-feedback/02-city-label-distance-tibur.png)
- [Mountains, roads, and missing trees](assets/user-feedback/03-mountains-roads-trees.png)
- [Rome south road cutoff](assets/user-feedback/04-rome-south-road-cutoff.png)

## Gap-Review Anchors (2026-06-29)

A multi-agent gap review of the closed WebGPU foundation confirmed every campaign
blocker maps to an existing slice here, and pinned each to concrete code. The
underlying systems exist; the work is acceptance plus two genuinely-missing
features (carts, city-aware clearance). Use these as slice starting pointers:

- **Slice 02 (labels/road):** label offset math lives at
  `web/src/campaign/renderer.ts:575-579` (spacing unverified); the
  `Roma`–`Ostia/Portus` road probe is absent — `CENTRAL_ITALY_ROAD_PAIRS`
  (`web/scenes/campaign/campaign-lod.mjs:27-39`) omits that pair, and the
  Rome-south road-continuity workbench scene does not exist yet. Label
  *visibility* is already safeguarded (`campaign-lod.mjs:159,181-182`).
- **Slice 03 (terrain color):** grass defaults tan at
  `packages/game-renderer/src/campaign/mapPass.ts:192`, only greening above
  moisture 0.55 (`mapPass.ts:184-224`).
- **Slice 04 (clearance/forests):** mountain height grading is range-edge chamfer
  only with no city-aware clearance — `web/src/campaign/terrain.ts:159-170` gets
  city positions but never uses them; only 3D scenery models are cleared
  (`renderer.ts:930-931`), leaving raised terrain over cities. Trees
  generate but are LOD-culled at threshold 0.45 vs initial zoom 0.18
  (`renderer.ts:752-771,953-957`).
- **Slice 05 (road life):** carts are entirely unimplemented — no model in
  `packages/game-renderer/src/campaign/campaignEntityModels.ts:3-93`, not in the
  `CampaignSceneryKind` union (`campaign/sceneryPass.ts:6`), no spawn/path-follow
  logic (`renderer.ts:679-779`).

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
- When a new 3D model is created, generate its static model sheet with the
  `write-model-sheet` workflow and add animation review GIFs with `write-anim`
  when it moves. Future campaign flags, army banners, carts, trees, and soldiers
  should all have an animation review path.

## Next Agent Prompt

You are picking up campaign polish. Last updated: 2026-06-29 (Slice 6 landed —
**all six slices done; spec complete**).

Current status: **All slices (1–6) done.** Slice 6 was the acceptance pass: the
full campaign WebGPU bundle is green (38 checks, 0 fails), all four feedback
images have before/after notes with durable crops in
[`assets/acceptance/`](assets/acceptance/), and a final unbiased critique returned
GOOD on labels, Ostia/Portus, road continuity, green terrain, forests, carts, and
fog. One non-blocking flag is recorded in slice 6: at regional zoom the
Alba Fucens–Corfinium cities read as near the bare Apennine massif — a tight crop
confirms the icons stay legible at the mountain foot (not the embedded failure
from feedback 03), so it is logged as optional future polish (widen the green
apron / break up that bare massif), not a blocker. The faction-overlay tint the
critic noted is the intended political wash over identical geometry. **If you are
picking this up, the remaining open item is purely that optional Apennine-massif
polish; everything in the original feedback set is resolved.**

Slice 5 added road life: a small ox-less trade
cart (`buildCartMesh`, `models/shared/sceneryPropModels.ts`) rides every real
campaign road as a deterministic, frozen-time prop. Placement lives in
`campaignRoadCarts` (`renderer.ts`): it smooths each `edge.via` with
`smoothRoadVia` (the same 0.72/0.14/0.14 weighting `mapPass` draws with, so carts
sit on the rendered centerline), drops a cart every `CART_SPACING_KM`, faces it
down the road via the per-instance `yaw` slot from slice 4, skips the road-
clearance cull (carts belong on the road) but skips the last ~7 km into each city
and obeys fog. `'cart'` is fully plumbed through `sceneryPass.ts` (buffers, draw,
shadows, `sceneryStats.carts`). Determinism is byte-identical on double-run. The
`campaign-polish-roads` and `campaign-lod` rome-close scenes gate on
`sceneryStats.carts >= 1`; all cart-affected baselines re-blessed. Critique:
unanimous HIGH-confidence positive ("reads as intended, executes cleanly").

Slice 4 reworked landforms: the chunky cone
mountains became broad multi-hump massifs with per-instance yaw rotation
(`sceneryPass.ts` free instance slot), thinner+lower placement, wide city/road
clearance (no embedded cities), and forests that actually render in wet regions
(Cisalpine/Po/Gaul) while Latium stays grassland. Critique: mountains "decisive
improvement, geological not geometric"; forests "definitely forested." Relief
was evaluated first (stripping props leaves a flat tan plain — relief is too
gentle alone, so restyled props over rock-shaded terrain is the answer). Slice 3 enriched the grass in
`naturalCampaignColor` (`mapPass.ts`) — greens earlier, richer endpoint, a
low-freq `meadow` patch term — taking the critique from "anemic/flat" to "ship
with confidence" (close-Rome greenRatio 0.76→0.85). Mountain crop floors in
`campaign-lod.mjs` were recalibrated (old warm-stone classifier counted
tan plains as mountain) and the greenRatio floor raised to 0.55. Workbench scenes `campaign-polish-roads`
(`?campaign=alignment`) and `campaign-polish-markers` (`?campaign=test`) exist
with pixel probes. City labels now sit ~one label height under their models via
relief-aware offset in `cityLabelOffset`/`cityReliefRisePx`
(`web/src/campaign/renderer.ts`); the Roma→Ostia/Portus pair is now in the
real-map road probe. All labeled baselines re-blessed (20 shots) and critique-
accepted. Remaining live offenders: **mountains are chunky stacked cone props**
(the `alignment` fixture is buried in them — see `polish-road-continuity.png`;
`buildMountainMesh` is three brown cones), **no visible trees/forests** at the
gameplay camera (generated but LOD-culled — gap review: `renderer.ts`
tree min-scale 0.45 vs zoom 0.18), **no city-aware terrain clearance** (relief
ignores city positions, `terrain.ts:159-170`), and **no carts** (slice 5; cart
model would live in `campaignEntityModels.ts`, kind union `sceneryPass.ts:6`).

Next pickup: nothing required — the spec is complete. The only optional follow-up
is the Apennine-massif polish noted above (slice 6): the large bare landform
behind Alba Fucens–Corfinium could get a wider green apron or a broken-up
silhouette so a zero-context viewer doesn't read those hill-towns as "in the
mountains." If you take it on, do it as a focused slice-4-style clearance/terrain
tweak with a fresh critique, and re-bless the affected `campaign-lod`
regional baselines.

How this pass runs the harness on this machine: dev server on a free port
(`npx vite --port 5179 --strictPort` from `web/`), then
`VERIFY_URL=http://localhost:5179 VERIFY_GPU=1 node scene.mjs <scene>`.
Re-bless intentional changes with `UPDATE_SHOTS=1`. Device is swiftshader
headless; snaps carry a documented sub-percent raster wobble.

Active warning: the harness is green, but most campaign-polish visual issues are
not solved yet. Do not mark a slice done until its focused scene and real
campaign crop both pass an unbiased `screenshot-critique` review.

Before ending any future pass, update this section with the new status, next
pickup point, blockers, and checklist state.

Global TODO:

- [x] Slice 1: feedback baselines and focused campaign workbench scenes exist.
- [x] Slice 2: city label spacing and Rome road continuity pass in fixture and
  close Rome campaign scene.
- [x] Slice 3: natural terrain color passes fixture and real Central Italy crop.
- [x] Slice 4: terrain relief, forests, and clearance pass fixture and real
  campaign crop.
- [x] Slice 5: deterministic road-life/cart fixture and campaign crop pass.
- [x] Slice 6: final campaign acceptance pass has current screenshots, crops,
  and unbiased screenshot critique for every slice.

## Slices

1. [Feedback Baselines And Scene Harness](slices/01-feedback-baselines-and-scene-harness.md)
2. [City Labels And Rome Road Readability](slices/02-city-labels-and-rome-road-readability.md)
3. [Natural Terrain Color](slices/03-natural-terrain-color.md)
4. [Landforms Forests And Clearance](slices/04-landforms-forests-and-clearance.md)
5. [Road Life](slices/05-road-life.md)
6. [Campaign Acceptance Pass](slices/06-campaign-acceptance-pass.md)
