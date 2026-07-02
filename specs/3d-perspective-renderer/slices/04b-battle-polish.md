# Slice 04b — Battle polish under the real camera (deferred from `04`)

## STATUS: CANCELLED (2026-07-02) — superseded by the photoreal ladder

Every item this slice contained is owned elsewhere after the `06` substrate
verdict, and its remaining bespoke targets are passes `08b` orphans — polishing
them would be dead work (flagged to David twice with a cancel recommendation; no
objection):

- **decal depth-bias (04b)** → the bespoke battle decal pipelines are orphaned at
  `08b`; the photoreal overlay decals land depth-correct in `08a` by construction.
- **particle/marker billboards (04c/04d)** → re-homed to `08a` (camera-facing TSL
  billboards are part of the overlay ports).
- **LOD screen-size (04e)** → absorbed by `14b` (with explicit per-instance
  frustum culling).
- **lab pick-harness migration (04g)** → already landed in `05b`
  (`chartCamera3d` + ray-cast `pickingDebug`).

Campaign's bespoke decals (selection rings) stay as-is until `16`; no z-fighting
has been observed there (flat chart camera). If any appears before `16`, reopen
just that item.

## Contract unlocked (original, for the record)

The battle renderer's secondary surfaces are *correct citizens* of the real 3D
camera, not survivors of the flip: decals never z-fight on slopes, particles and
markers face the camera, LOD is driven by real projected size, and the lab pick
harness runs the same ray-cast as production. These were resliced out of `04a`
(the projection/depth flip) as clean follow-ups — the projection is done; this is
polish on top.

**Sequencing:** land AFTER `05`'s legacy-projector collapse. These items touch the
same pass files the collapse rewrites (`soldierShadowPass`, `particlePass`,
`frameShell` markers, `lod.ts`) — doing them first would make the collapse diff
noisier for no gain.

## Sub-slices (one variable each; each independently verifiable)

- **04b-decals** — add pipeline `depthBias`/`depthBiasSlopeScale` to the
  shadow/ground-cue/selection decal pipelines so they seat on tilted terrain
  without z-fighting (today they read fine via the +0.015/+0.02 z-lift under
  reverse-Z; bias is the belt-and-braces that survives steeper photoreal terrain).
  Route: `/renderer/battle-ground-cue-depth`, `/renderer/battle-effects`.
  Visual variable: decal-on-slope stability (no shimmer/stitching).
- **04c-particles** — `particlePass` quads become camera-facing billboards from
  `cam.eye` + view right/up (placement is already correct; orientation is not).
  Route: `/renderer/battle-effects`. Visual variable: dust/blood puffs face the
  camera at oblique pitch.
- **04d-markers** — `frameShell` marker quads + far-LOD impostors likewise.
  Route: `/renderer/lod`. Visual variable: markers/impostors upright at vista.
- **04e-lod** — `packages/crowd-runtime/src/lod.ts assignCrowdLodsByDistance`
  still uses `zoom×distance`; replace with real projected screen-height (∝ clipW)
  with a **min-size floor** (deliberate non-physical clamp so distant units stay
  readable). Re-derive the `lod-tiers` monotonicity assertion for perspective
  distance. Route: `/renderer/lod-tiers`. Unit-tested (monotonic coarsening,
  floor holds).
- **04g-lab-harness** — migrate the lab `routeBattleLive` + `pickingDebug.ts`
  (`cssToBattleWorld`/`RendererBattlePickCamera`) off the legacy 2.5D camera onto
  camera3d, so the lab pick harness exercises the SAME ray-cast as production
  `Camera`. This is also a **blocker for `05`'s legacy deletion** if not already
  handled there — see the README legacy-collapse inventory.

## Verification

- Per sub-slice: the named route under SwiftShader (`VERIFY_GPU=1 node scene.mjs`),
  one visual variable per shot, `screenshot-critique` as last check;
  `compare-screenshots` vs the pre-polish look where a prior look exists.
- `04e`: unit tests in `web/tests/` (`bun run --cwd web test:unit`).
- Battle scene suite + seating tripwire (`battle-terrain-elevation` `match=true`)
  stay green throughout.

## Must stay green

- `cargo test --workspace` (untouched); zero `crates/**` edits.
- Campaign scenes (post-`05` state) stay green.

## Human feedback that would change this slice

LOD floor size (how small distant units may get) and decal bias constants are
taste knobs — non-blocking checkpoint via `preview-shots`, ~5 min, then decide on
the evidence and record here.
