# Slice 05b — Collapse the legacy 2.5D projector engine-wide

**STATUS: DONE (committed 2026-07-02).** One projector (`projectWorld`, camera3d
viewProj), one depth convention (reverse-Z `depth32float`, `gpuWorldDepthStencil`),
zero `real`/`reverseZ` flags, camera uniform re-packed (48 floats, survivors
documented), lab routes/pick harness/fixtures on `chartCamera3d`, projection
identity published via `__rendererLabStats`. See the README Next Agent Prompt
for the verified record.

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
