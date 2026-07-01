# Slice 03 — Zoom → camera rig (pure curve, battle + campaign)

## Contract unlocked

Zoom-coupled framing expressed as **real camera params**: near-top-down when zoomed
out, cinematic vista when zoomed in — replacing `cameraForZoom`'s fake
`{pitch,targetOffset,perspective,zoomT}` output. Pure, deterministic, testable; no
GPU. This is where "playable is the only bar" is tuned.

## API seam

**Package:** `web` (`src/battle/cameraRig.ts`) with the curve itself lifted into
`renderer-core` so battle and campaign share it.

- Rewrite `cameraForZoom(zoom, zoomRange, bounds): { distance; pitch; fovY;
  target: Vec2; zoomT }` (was `{pitch,targetOffset,perspective,zoomT}` — delete the
  fake `perspective` term). The user's `zoom` stays the control; the rig derives
  `distance` from `zoom` + `bounds`.
- Add a **campaign sibling** (or parameterize): campaign is a near-top-down chart —
  a gentler fovY curve, stays flatter longer.
- Keep exporting `zoomT` (grass density in `battle-map-reference`, haze depth read
  it).
- **Legibility curve (from Total War research):** min-zoom → high pitch-down +
  narrow FOV (tactical reads survive); max-zoom → low pitch + wide FOV (vista). If a
  single curve can't keep mid-zoom formations legible, clamp FOV at a mid-zoom
  "RTS-mode" threshold rather than widening — record that as the fallback.

## What the human can run / see

`/renderer/camera3d-probe?stops=zoom` (from `01`) driven by the rig → a contact
sheet **top-down → mid → vista**. Later `/renderer/world-camera` and
`battle-camera-zoom.mjs` exercise it live once `04` lands.

## Verification

- **Vitest** (extends the existing `web/tests/cameraRig.test.ts`, which already
  pins monotonicity/clamping/determinism): pitch monotonic in zoom; **fovY**
  monotonic in zoom; near-top-down band at min zoom, vista band at max; continuous,
  clamped past both ends; same zoom → same rig. No GPU.
- The `01` probe contact sheet is a 2D-canvas render; if snapshotted, run
  `screenshot-critique` as the last check.

## Must stay green

- Presentation/input only — **no sim**, no `crates/**`, no `terrainHeightAt`.
- `bun run --cwd web test`, `cargo test --workspace`.

## Human feedback that would change this slice

The curve endpoints (how top-down "out", how low/wide "in") and easing — this is the
explicit tuning knob the human owns (mirrors the feedback section of
`specs/battle-map-reference/slices/01-zoom-coupled-camera.md`). **Non-blocking:**
open the contact sheet with `preview-shots`, ~5 min, else pick the monotonic-curve
default and record it. The real dolly *feel* is confirmed later at the `04`
play-test.
