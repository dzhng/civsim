# Slice 01 — zoom-coupled camera

## Contract unlocked

The battle camera's pitch and framing are driven by zoom: **fully zoomed out → a
top-down tactical view; zooming in → the camera tilts and looks further out over the
horizon; fully zoomed in → the low oblique vista framing of the reference shot.**
This is a gameplay feature in its own right, and it gives the rest of the spec its
judging frame: every later visual slice is critiqued at the zoom level that matters,
and the Slice 08 master comparison is simply the map captured at full zoom-in.

It also exports a normalized **`zoomT`** (0 = zoomed out, 1 = zoomed in) that
zoom-reactive detail (grass density in Slice 03, haze depth in Slice 06) can read,
so the foreground gets lush + hazy as you push into the vista and clears for
legibility as you pull back to top-down.

## API seam

A **pure, unit-testable curve** plus a thin wiring change — no new GPU work:

1. **Pure curve (the tiny library):** `cameraForZoom(zoom: number, zoomRange: { min; max }, bounds): CameraRig`
   in a new `web/src/battle/cameraRig.ts`, where
   `CameraRig = { pitch; height; targetOffset; zoomT }`. Deterministic, no GPU/DOM.
   - `zoomT = 0` at `zoomRange.min` (max zoom-out) → `pitch ≈` straight-down
     top-down; `targetOffset ≈ 0` (look at the formation from above).
   - `zoomT = 1` at `zoomRange.max` (max zoom-in) → `pitch ≈` the reference's low
     oblique (camera lifted, looking out toward the horizon), `targetOffset` pushed
     **forward** so the framing looks *out over* the valley rather than tilting in
     place.
   - Monotonic and eased between the ends; no discontinuity; clamped past both ends.
2. **Wiring:** replace the fixed `camera.pitch = renderer.pitch` in
   `web/src/battle/scene.ts` with `cameraForZoom(currentZoom, …)` driving pitch,
   height, and target. Publish `zoomT` (and the resolved pitch) on the
   renderer/camera and into `window.__rendererLabStats` for verification, and expose
   `zoomT` to the world passes that want it.

## What the human can run / see

Load any existing map and scroll the zoom: the camera dollies from a top-down
tactical view, through an angled mid view, to a horizon-looking vista at full
zoom-in. A new scene `web/scenes/battle/battle-camera-zoom.mjs` drives the zoom
through fixed stops and emits a **contact sheet** (top-down → mid → vista) plus the
`renderer/battle-terrain-3d` route at each stop.

## Verification

- **Pure-curve unit tests (cheap, no GPU):** `zoomT=0` → pitch in the top-down band;
  `zoomT=1` → pitch in the reference-oblique band; pitch monotonic in zoom; the curve
  is continuous and clamped; same zoom → same rig (deterministic, so snapshots are
  reproducible).
- **Behavioral scene gate:** `battle-camera-zoom.mjs` drives N zoom stops and asserts
  the published `pitch`/`zoomT` match the curve at each stop; snapshot the contact
  sheet.
- **Playability guard:** at the *mid* zoom band where units are actually
  micro-managed, pitch stays in a usable RTS range (not so flat that the formation
  collapses to a line).

## Screenshot-critique

**Required:** does the progression read as a smooth dolly from tactical top-down to
cinematic horizon vista — and does the *full-zoom-in* frame land on the reference's
camera angle (low, looking out over the horizon), not merely a tilted top-down?

## Must stay green

- `battle-renderer-visual` and any camera/control tests — the new default pitch must
  keep gameplay legible across the playable zoom band.
- Existing battle snapshots captured at the old fixed pitch will move; **re-bless
  deliberately** (via `change-report`) for the new default framing — don't blanket-
  overwrite.
- `cargo` — the camera is presentation/input only; **no sim change** (no effect on
  pathing, ranges, or `terrainHeightAt`).

## Human feedback that would reshape this slice

The pitch curve endpoints (how top-down is "out", how low is "in"); the easing
(linear vs. eased) and the zoom band the transition spans (e.g. a broad playable
mid-band with top-down/vista only at the extremes); how far the target pushes out at
full zoom-in.
