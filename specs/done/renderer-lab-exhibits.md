# Renderer lab exhibits — RETIRED

Retired in the commit titled `slice 02: lab-estate-modules`; the last tree where
the estate lived intact was `08d8c5fe`. Git history is its archive. None of it was
relocated, hidden behind a flag, or preserved through a compatibility shim.

## Why it was retired

The 3D renderer decision made the ownership boundary permanent: battle is the
three.js photoreal world, while campaign remains the bespoke WGSL painted chart.
The campaign photoreal spike ended in a 16a NO-GO because a physically rendered
campaign destroyed the antique-map register rather than improving it. The retired
raw-WebGPU battle estate therefore had no production owner; it rehearsed a battle
renderer that will not ship.

That estate included the combinatorial grass experiment (19×6×4×5 families that
no caller selected), bespoke terrain and battle utility passes, the render-graph
and performance-report skeletons, the field/open-sea GPU chain, and the dormant GPU
halves beside the shared ground and horizon builders. It also included the copied
live-battle and probe routes, their seven visual cases and baselines, and the web
HUD wrappers. The associated frame-shell terrain, backdrop, and marker pipelines
are the remaining edge of the same retirement boundary; campaign's live frame/depth
machinery is not part of that boundary.

The important value was never those battle shaders. It was the frame-phase, depth,
camera, decal, and overlay contract they helped expose. Those rules are now pinned
where the production campaign renderer honours them: `frameGraphContract.ts`, the
`frame-shell` and `world-camera` routes, the `campaign-*` routes, and the
`skinned-*` routes.

## What survives

The CPU terrain, grass-field, scenery, and horizon builders survive because they
are inputs to `packages/photoreal-renderer`. The Gerstner wave baker, shore ramp,
and water palette survive for the photoreal sea and campaign map. The `nested3d`
fixture survives as the hostile-order world-camera case. `UnitCardsReact` survives
because the card-bar route exercises the production component.

The invariant is strict: a lab route exists only to pin a contract honoured by a
production renderer. A pass with no production consumer is deleted, not exhibited;
a new look ladder belongs under photoreal with its own gate.

## Where the contracts live

- Terrain seating is pinned across four maps by `battle-seating`, using production
  photoreal-world statistics.
- Terrain-builder invariants live in `web/tests/vitest/terrainFeatures.test.ts`.
- Decal depth-read is asserted by the `campaign-ui` gate row.
- Frame phases and depth roles live in the `frame-shell` route and
  `packages/renderer-core/src/frameGraphContract.ts`.

The renderer choice and the historical kept-list this record supersedes are in
[`3d-perspective-renderer/README.md`](3d-perspective-renderer/README.md). The
camera-following grass-ring rationale remains in
[`meadow-polish.md`](meadow-polish.md), and the water investigation remains in
[`water/README.md`](water/README.md).
