# Slice 05 — Flip campaign to the real camera + campaign picking

## STATUS: DONE — 05a (committed 2026-07-02, `a90177fd`); 05b (legacy collapse) in `05b-collapse-legacy-projector.md`

The production campaign renderer is flipped onto the real 3D perspective camera +
reverse-Z, mirroring 04a's pattern:

- **Per-pass `real` flag on every campaign world-depth pass**, flipped atomically on
  one `reverseZ: true` shell: `mapPass` (map surface `write`, world-lines/roads
  `read`), `territoryPass`, `entityPass`, `selectionPass`, `sceneryPass` (04a's flag),
  `skinnedPipeline` + `soldierShadowPass` campaign instances. Overlay passes
  (markers/labels/fog/clouds — no depth attachment) swap projection only; the label
  shader's `projectScreen` becomes `projectReal` → NDC → device pixels, matched by
  the CPU cull (`visibleLabels` → `cameraUniform.worldToScreen`).
- **CPU:** `cameraUniform.worldToScreen`/`world3dToScreen`/`screenToWorld` delegate to
  camera3d when `CameraSnapshot.camera3d` is set (aspect pinned to live w/h).
  `CampaignRenderer.cameraParamsFor` wires `campaignCameraRig`: **the rig owns
  pitch/fovY/zoomT; `distance` derives from `cam.scale`** (vertical ground span at the
  target = height/scale device px) so the chart scale keeps its meaning — the rig's
  bounds-relative distance curve only spans 2.4× across campaign's ~28× zoom range and
  framed the whole continent at "close" zoom (caught by the campaign-lod gates). Screen
  centre = (cam.x, cam.y) exactly (no vista look-ahead); `yaw = −π/2` keeps north-up.
  `clampCam`/`nearestLoc`/city-panel flow untouched (only the projection under them).
  `cityReliefRisePx` projects z=0 vs z=h through the real camera (CSS px).
- **Verified:** typecheck + 38 unit tests green (new `web/tests/campaignPicking.test.ts`:
  ground round-trips <0.4 px at 5 zoom stops, chart-scale px/km pin, north-up
  orientation, city click→nearest-loc pick). `hasCampaignWorldDepthContract` re-derived
  to `GPU_DEPTH_FORMAT_REVERSE`. Full campaign suites green under SwiftShader
  (alignment/visual/lod/production/handoff/save-load/conquest/reinforcements/polish/
  water-sea/menu-renderer-shell), incl. the real-canvas click→army-select and
  click→city-panel checks on the real camera. `campaign-lod`'s regional fixture +
  Apennine crops re-derived (same world geography reprojected; all 13 anchor cities
  on screen; gate floors untouched). 23 campaign/ui baselines re-blessed after
  eyeballing. Critique: "coherent tilted plane, labels individually legible";
  compare vs old look: content preserved (edge-energy ratio 0.98), real perspective
  gained. **Battle byte-identical** (battle-camera-zoom + 3 terrain-elevation
  snapshots 0.0000% diff, seating tripwire `match=true`).
- **Pre-existing look items flagged by critique** (present in old baselines too;
  they land by name in photoreal slice `16d`): label anchors below-left of models,
  ROMA as army sub-label, low-contrast selection ring, roads pass through city
  models, glowing beach rim.

## Contract unlocked

The campaign renderer is on the same real perspective camera + real depth; labels,
roads, borders, and markers project correctly; army/city picking is a 3D ray-cast.
After this, **the entire engine is on a real camera, sim untouched, playable** — the
milestone that opens the photoreal ladder.

## API seam

**Packages:** `game-renderer/campaign` (`mapPass`, `entityPass`, `sceneryPass`,
`atmospherePass`, `selectionPass`, `territoryPass`) + `web/src/campaign/renderer.ts`.

- Campaign passes already call the shared `projectGround`/`projectWorld3d`, so they
  inherit the real matrix from `04`'s body flip. Flip the campaign shell's depth to
  reverse-Z (its own `frameShell` instance / depth cluster, separate from battle).
- Wire the **campaign camera rig** (`03` sibling — gentler, flatter, top-down
  longer). `mapPass` raster becomes a real ground plane.
- Fix `campaign/mapPass.ts` `worldToScreen` (label/road placement) and
  `web/src/campaign/renderer.ts` `screenToWorld` (army/city picking, `nearestLoc`)
  onto the `camera3d` CPU projection.
- Campaign sea shimmer in `mapPass` is raster (no displacement) — geometry flip
  only. Keep the water-spec invariant: campaign snapshots frozen at `fixedTime=0`.

## What the human can run / see

`/renderer/campaign`, `/renderer/campaign-map`, `/renderer/campaign-ui`.

## Verification

- **Unit:** label screen-projection round-trip; `nearestLoc` / army-pick round-trip
  at several campaign zoom stops.
- **Visual variable = label-on-city alignment** (do labels/borders stay pinned and
  legible under perspective, not smeared?). Crop = a labelled city cluster.
  `screenshot-critique` **required last check**; `compare-screenshots` vs the prior
  campaign look ("legible, not broken").
- **Re-bless** `web/shots/campaign/**` deliberately (`campaign-map-alignment`,
  `campaign-visual`, `campaign-lod`).
- Keep the campaign **"still chart at altitude, alive up close"** principle (water
  spec) — verify labels/borders read from strategic zoom.

## Must stay green

- `cargo test --workspace`; no `crates/**` edits; campaign sim/economy untouched.
- Battle scenes (flipped in `04`) stay green.

## Human feedback that would change this slice

Campaign readability at strategic zoom vs close. **Non-blocking:** open with
`preview-shots`, ~5 min; if silent, decide on alignment round-trip + critique,
record here, proceed. Feedback that the chart reads too "3D"/tilted at strategic
zoom → flatten the campaign rig's pitch/fovY curve (a `03` knob).
