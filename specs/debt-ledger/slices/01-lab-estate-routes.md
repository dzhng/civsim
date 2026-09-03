# 01 — lab-estate-routes

**Contract unlocked:** every lab route, scene, script, and baseline that existed
only to exhibit the bespoke battle look is gone. No package code changes yet;
this slice makes the importer count of the estate modules provably zero so
slice 02 can delete them by typecheck.

## Seam

Pure deletion. Files:

- `apps/renderer-lab/src/router.ts`: remove route table entries and bodies for
  `battle-live` (4483-4610), `battle-ui` (4610-4760), `battle-input`
  (4818-5121), `camera3d-probe` (5121), `campaign` (2065), `battle-terrain`,
  `battle-terrain-features`, `battle-terrain-3d`, `shared-grass-models`,
  `render-graph` (3618), `battle-ground-cue-depth` (1775),
  `battle-effect-overlay`, `perf` (2036). Delete `livingMeadowRoute.ts`,
  `meadowAudioRoute.ts`, and `routePhotorealShadowProbe` in
  `photorealRoutes.ts:147`.
- `web/scenes`: delete `shared-grass-models`, `battle-terrain-3d`,
  `battle-terrain-blockers`, `battle-terrain-elevation`,
  `battle-terrain-features`, `water-coastal`, `water-open-sea`.
- `web/shots`: delete `battle/terrain-3d/`, `terrain-blockers/`,
  `terrain-elevation/`, `terrain-features/`, `water-coastal/`, `water-open-sea/`,
  `models/shared/grass/`.
- `web/shots/models/scripts/grass-wind.mjs` (targets a route that does not
  exist; already broken).
- `web/package.json`: drop those scene names from `scene:renderer`; delete
  `shots:models:grass`, `shots:models:grass:anim`, and their link in
  `shots:models`.
- `web/scenes/system/renderer-lab-routes.mjs`: delete the gate rows for every
  route above (`battle-terrain?fixture=*`, `battle-live`, `battle-ui`,
  `battle-input`, `shared-grass-models?gate=tuft`, `render-graph`,
  `battle-effect-overlay`, `perf?count=900`, `campaign` at :170,
  `battle-ground-cue-depth` at :89-110).

Keep: `world-camera` (uses `nested3d`), `card-bar` (uses `UnitCardsReact`),
`campaign-ui` (drop only its `CampaignUiLayer` shim in slice 02),
`campaign-map`, `campaign-models`, `skinned-*`, `lod`, `battle`, `frame-shell`,
`capabilities`, `device`, `fault-injection`, `asset-workbench`, all
`photoreal-*`, `shared-prop-models`, `shared-standard-models`,
`battle-ground-turf`, `blade-field`.

## Re-home before deleting (same slice, first commit)

Three doomed scenes pin invariants that are not about the bespoke look; the
invariants survive on the owner that computes them, the scenes die.

- **Seating on the shared height field** — `battle-terrain-elevation.mjs`
  asserts `soldierElevationMatches`, `soldierElevationSpan > 0.5`, and
  "soldiers render over the ground" across four maps (`shore-and-crags`,
  `highland-vale`, `wooded-pass`, `generated-seed-7`) via the bespoke route.
  The photoreal world already publishes the same contract
  (`battleWorld.ts:452, 1081, 1466` → `stats().seating`) and
  `battle-photoreal-parity.mjs:69-70` asserts it for one map. Extend
  `battle-photoreal-parity` (or add `battle-seating` on
  `/renderer/photoreal-battle?map=…`) to loop the same four maps with the same
  three checks and its own baselines. The 3d-perspective-renderer README
  (line ~170) names this tripwire; it keeps holding, on the production
  renderer.
- **Terrain data-builder invariants** — `battle-terrain-blockers.mjs` and
  `battle-terrain-features.mjs` assert `heightSpan`, `heightMaxStep`,
  `sealedEdges`, `edgeMismatches`, `inBounds`, `terrainCell`, `groundCover`,
  `featureCounts`, `featureTotal`, `intentionallyFlat` — values the router
  computes from the CPU builders in `terrainFeatures.ts` (KEEP). Move them to
  `web/tests/terrainFeatures.test.ts` (vitest, no GPU) over the map catalog,
  asserting the same thresholds. Where photoreal `battleWorld.ts` already
  publishes one of them (4 hits), the parity scene may assert it too.
- **`water-coastal` / `water-open-sea`** — read what they assert. If it is the
  bespoke water plane (dies with the GPU chain) → delete. If it is the shared
  Gerstner / shore-ramp CPU math → a vitest beside `photorealSea.test.ts`, or
  the existing `photoreal-sea` / `sea-rhythm` scenes.

Gate for this commit: the new checks green at HEAD before any deletion.

## Decisions resolved here

- `render-graph`, `battle-ground-cue-depth`, `battle-effect-overlay`, `perf`,
  `/renderer/campaign` die (README, planning decisions). Before deleting the
  `battle-ground-cue-depth` row, confirm the `campaign-ui` row still asserts
  `hasFrameDepthPass(..., "campaign-ui-selection", "read")` and
  `hasFramePassRole(..., "world-decal", ...)`; it does at HEAD (:224-228).
- Deleted scenes' baselines are removed, never re-blessed.

## Delegated to the implementer

Commit granularity (one commit or two: routes+scenes, then scripts+gate rows).

## Runnable / visible

`bun run --cwd web scene -- --list` shows no deleted scene; `bun run --cwd web
scene:renderer` runs the pruned list green.

## Verification

- G0 — typecheck will still pass because the package modules are untouched.
- G-lab, G-verify, G-camp.
- `git status` clean after the scene run (no orphan `-actual` PNGs).
- Grep proof, recorded in the commit message:
  `grep -rl "grassPass\|terrainPass\|minimapPass\|renderGraph" apps web/src web/scenes packages` returns only the package files themselves.

## Must stay green

Every surviving scene at its HEAD status (record pre-existing reds first).

## Feedback that would change this slice

David wanting any deleted route as a future exhibit → it comes back under
photoreal with its own gate, never as bespoke code.
