# Slice 05 — Flip campaign to the real camera + campaign picking

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
