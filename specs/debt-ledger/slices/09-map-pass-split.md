# 09 — map-pass-split

**Contract unlocked:** `mapPass.ts` owns the five campaign map pass classes
and their WGSL, nothing else. Road geometry, sea-label data, and label layout
each have a nameable home.

## Seam (pure move)

- Stay in `packages/game-renderer/src/campaign/mapPass.ts`: `CampaignMapPass`,
  `CampaignWorldLinePass`, `CampaignRoadPass`, `CampaignMarkerPass`,
  `CampaignLabelPass` and their WGSL (153-537, 618-1253). The
  `renderer-lab-routes.mjs:1076-1096` regexes match these class names and
  their `draw(pass: ...)` signatures **in this file path**; they cannot move.
- `roadGeometry.ts`: 1254-1566 with its six constants
  (`ROAD_WATER_BRIDGE_KM`, `ROAD_SURFACE_SAMPLE_KM`, …).
- `seaLabels.ts`: 1567-1803, the hard-coded sea-name data and eleven fitting
  constants. Data, kept as TS.
- `labelLayout.ts`: 1804-2629 — atlas, occupancy, placement, `ScreenRect`,
  `rectsOverlap`, `bestPlacement` (live at 1672 → un-export, keep),
  `PlacementVerdict`.
- Un-export the 13 interfaces used only in-file.

Consumers: `web/src/campaign/{renderer,scene,surface}.ts`, `territoryPass.ts:5`,
lab `campaign-map` / `campaign-ui` routes. Stats read by scenes
(`seaLabelFits`, `roadJunctionCaps`, `labelCollisionCulledLabels`,
`labelAtlas`, `visibleLabelRects`) keep their names.

## Decisions resolved here

Move data and constants first, compare exported draw buffers byte-for-byte,
then move the layout engine.

## Delegated to the implementer

Exact file names; whether `worldLinePass` geometry helpers get their own file.

## Verification

- G0. G-camp at **0 px** (`campaign-lod`, `campaign-polish-roads`,
  `campaign-collision` pin road and label geometry; `campaign-visual`,
  `campaign-map-alignment`).
- `mapPass.ts` ≤ 1,300 lines.

## Must stay green

Campaign scenes byte-identical.

## Feedback that would change this slice

None.
