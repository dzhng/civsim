# Slice 05b — Collapse the legacy 2.5D projector engine-wide

**STATUS: DONE (committed 2026-07-02, `e86f68dd`) — the camera spine (`01`–`05`)
is COMPLETE.** The legacy 2.5D projector is deleted engine-wide; the renderer
reads as designed for a real perspective camera from scratch. The verified record:

- **One projector:** `projectReal` took the canonical name **`projectWorld`**
  (`cameraWgsl.ts`); `projectGround`/`projectWorld3d`/`cameraSpace`/`perspectiveDepth`/
  `worldDepth3d`/`civsim*WorldDepth3d` deleted. Every per-pass `real` compile flag and
  every `realProjection(...)` WGSL rewriter is gone — the real WGSL body is the source
  text. Grep-proof: zero repo references to any legacy name (not even comments).
- **One depth convention:** `GPU_DEPTH_FORMAT = depth32float`, clear 0, reverse-Z;
  `gpuWorldDepthStencil` IS the reverse-Z contract (defaults `greater`/`greater-equal`);
  `gpuReverseZDepthStencil`, the `depth24plus` path, `chooseDepthFormat`, the caps
  depth probe, and `FrameShellOptions.reverseZ` deleted. `renderGraph` compares
  flipped to `greater`/`greater-equal`.
- **Camera uniform re-packed (48 floats / 192 B, layout documented in
  `cameraUniform.ts`):** matrices first, then the documented **survivor scalars** —
  `focus` (vec2, ground view centre; distance-keyed effects: terrain haze, water shore
  ramp, glint), `width`/`height` (label/marker screen offsets), `zoom` (chart-scale
  detail gate: campaign sea shimmer), `tilt` (= sin(camera3d pitch), replaces `cosP`
  in the shimmer tilt gate — value re-derived from the rig inside `cameraUniformData`),
  `time`, `zfar`, `sunAz`/`sunEl`. `cosP`/`cosYaw`/`sinYaw`/`perspective` are gone;
  `CameraSnapshot.camera3d` is REQUIRED and the CPU
  `worldToScreen`/`world3dToScreen`/`screenToWorld` are camera3d-only.
- **Fog/meadow axis pinned:** battle ground/grass fog + meadow ramps were keyed on
  legacy `cameraSpace(world).y`, which under the real battle camera (yaw = view
  azimuth) is the view's **screen-right** axis, not view-forward. Kept
  value-identical via the shared `chartDepthDist` WGSL helper (reconstructed from
  eye→focus) so blessed battle baselines stay byte-identical; re-aiming those ramps
  along true view-forward is a deliberate look change left to battle polish /
  `battle-map-reference`.
- **Lab surfaces migrated (nothing parked):** new `chartCamera3d(spec,
  viewportHeightPx)` in `camera3d.ts` resolves the chart-style framing (`{x, y,
  zoom px/world, pitch tilt-from-top-down, yaw}`) every renderer-lab route uses into
  real `Camera3DParams`; `createConfiguredShell` + all direct-shell routes go through
  it. The lab pick harness (`pickingDebug.ts` + `routeBattleInput`) converts
  css↔world through the SAME `chartCamera3d` (ray-cast
  `unprojectToPlaneZ`/`projectPoint`), and `__gpuBattleInput.project(x,y)` exposes
  the harness projection so the verification scene no longer hand-copies camera
  math. `fixtures/nested3d`, `terrainPass`, `particlePass` flipped to `projectWorld`.
- **Ownership visible:** `PROJECTION_IDENTITY = 'camera3d-viewProj-reverse-z'`
  (`cameraUniform.ts`) is published by `FrameShellStats.projection` and by every
  `__rendererLabStats` envelope; the `renderer-lab-routes` scene asserts every route
  reports the same identity, and `_renderer-contract.mjs` reads it (and the depth
  format) from source.
- **`minimapPass` stays 2D by design** (its own top-down `project()`, screen overlay)
  — the one recorded intentional exception from the legacy-collapse inventory.
- **Lab fixture gates re-derived for the real camera** (the fake projection drew
  world-Z at full scale at ANY pitch — geometrically impossible — so review
  fixtures tuned under it needed honest re-derivation, not blind re-blessing):
  soldier/entity/prop review routes moved to oblique chart pitches (1.0–1.26);
  occlusion samples are now DERIVED from the drawn fixtures (crowd-anchored ring
  azimuth for the army gate, canopy-centred tree control, `ModelShotGroundDepthPass`
  gives the campaign model shots a real ground depth-fill mirroring production so
  "hidden garrison" means occluded, not painted-over); the scene color bins gained
  `foliage`/`navy` (shaded canopy/cloth read outside the sunny-top-down bins);
  the grass model sheets re-framed (zoom 260/128) with deep-blade floors
  re-measured; the `campaign-ui` click test's fixture pick raced city-vs-road at
  Roma's node — city picks now scan city nodes directly (root cause, threshold
  untouched). The impossible-by-construction `bladeInstances >= 80` pin (1
  authored tuft × 13 blades) was re-pinned to the fixture.

## Contract unlocked

The migration seam opened in `02`–`05a` is deleted: **one** projection owner
(`camera3d` / `projectReal`), **one** depth convention (reverse-Z
`depth32float`), zero `real` flags, zero painter-depth helpers. The renderer
reads as designed for a real perspective camera from scratch (the
clean-architecture invariants in the README).

## Why this was resliced out of 05a

05a flipped the production campaign renderer (every world-depth pass atomic on
one reverse-Z shell, camera3d picking/labels, contract re-derived). The collapse
was sized during that pass and it is NOT a mop-up: 23 files still consume the
legacy projector, and several of them are whole *surfaces* that must flip before
the legacy path has zero consumers:

- **renderer-lab campaign review routes** (`apps/renderer-lab/src/router.ts`)
  still build campaign passes (map/territory/scenery/entity/label/…) on a
  legacy `depth24plus` shell with `real` unset. They must construct reverse-Z
  shells + `real` passes (or better: the flag dies and they just work), and the
  `renderer-lab-routes.mjs` scene contract re-verified.
- **lab battle pick harness** (`routeBattleLive` + `web/src/battle/pickingDebug.ts`
  with `cssToBattleWorld` / `RendererBattlePickCamera`) is still the legacy 2.5D
  CPU camera. **Owned by `04b` sub-item `04g-lab-harness`**
  (`slices/04b-battle-polish.md`) — this slice requires it done first or does it
  here; don't do it twice.
- **`terrainPass` / `particlePass` / `fixtures/nested3d`** (lab-only surfaces)
  still call `projectGround`/`projectWorld3d`; particle billboarding interacts
  with the `04b` billboard work — decide whether to flip-as-is (flat quads under
  `projectReal`) or land billboards first.

This slice executes the **legacy-collapse inventory** in the README's
clean-architecture invariants (grep every `projectGround`/`projectWorld3d`/
`worldDepth3d`/`civsim*WorldDepth3d`/`gpuWorldDepthStencil` call site and account
for each; **intentional exception: `minimapPass`** — its own top-down 2D
`project()`, stays 2D by design).

## The work (order matters)

1. **Flip the remaining lab surfaces** onto camera3d/reverse-Z (lab campaign
   routes, `routeBattleLive`+`pickingDebug`, terrain/particle/nested3d
   fixtures). Verify each lab route's scene under SwiftShader; re-bless its
   shots deliberately.
2. **Delete the legacy path** once `grep projectGround|projectWorld3d|worldDepth3d|civsim.*WorldDepth3d`
   has no consumers:
   - `cameraWgsl.ts`: delete `projectGround`/`projectWorld3d`/`cameraSpace`/
     `perspectiveDepth`/`worldDepth3d`/`civsim*WorldDepth3d`; `projectReal` takes
     the canonical name (or keep the name — one projector either way).
   - `pipelineContracts.ts`/`depthContract.ts`/`frameShell.ts`: delete
     `gpuWorldDepthStencil` + the `depth24plus` path + `FrameShellOptions.reverseZ`
     (reverse-Z becomes the only depth; update `hasBattle/CampaignWorldDepthContract`
     and any scene reading `GPU_DEPTH_FORMAT`).
   - Remove every per-pass `real` flag / `realProjection(...)` WGSL rewriter
     (battle passes from 04a, campaign passes from 05a, water from 02) — the
     real WGSL body becomes the source text.
   - `cameraUniform.ts`: delete the legacy `worldToScreen`/`world3dToScreen`/
     `screenToWorld` branches; `CameraSnapshot.camera3d` becomes required.
3. **The 12 legacy uniform scalars are NOT all dead — grep first.** Known live
   consumers: campaign `MAP_WGSL` fragment reads `cam.zoom`/`cam.cosP` for the
   sea-shimmer zoom gate; label WGSL reads `cam.width`/`cam.height`; grass/haze
   read `zoomT` CPU-side. Re-express these from the real camera (e.g. shimmer
   gate from distance/fovY) or keep the specific scalars deliberately — but
   delete the fake-projection ones (`cosP`/`perspective`/`zoom`-as-projection).
4. **Re-verify BATTLE + campaign + lab**: full battle scene suite (flag removal
   touches battle pass compilation — battle shots must stay byte-identical or be
   consciously re-blessed), campaign suite (should be byte-identical: the real
   path's WGSL text must not change when the flag is removed), renderer-lab
   routes, `battle-terrain-elevation` tripwire, typecheck + unit tests.

## Must stay green

- `cargo test --workspace`; zero `crates/**` edits; campaign sim/economy
  untouched.
- Battle + campaign scene suites; picking round-trip unit tests
  (`battlePicking`/`campaignPicking`).
- Publish the (now single) projection/depth identity in `__rendererLabStats`
  and assert every surface reports the same one (README invariant).

## Notes from 05a (recorded observations, not this slice's work)

The unprimed critique of the flipped campaign flagged pre-existing look items
(also present in the old 2.5D baselines): label anchors sit below-left of city
models, ROMA renders as an army sub-label not a city label, selection ring is
low-contrast, roads pass through city models, glowing beach rim, faint sea
streaks. These belong to the photoreal ladder (slice `13` campaign surfaces),
not the collapse.
