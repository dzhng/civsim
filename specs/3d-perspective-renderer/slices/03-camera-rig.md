# Slice 03 — Zoom → camera rig (pure curve, battle + campaign)

## STATUS: DONE (committed 2026-07-02, `88d45d0f`)

The zoom→camera rig landed as a pure, deterministic curve mapping zoom → real
`Camera3DParams` framing. **Purely additive** (refinement over this file's "rewrite
`cameraForZoom`"): the legacy `cameraForZoom` + `scene.ts` 2.5D path stayed
UNTOUCHED (battle byte-identical) and remained wired until `04a` swapped `scene.ts`
onto the new rig and deleted `cameraForZoom`. Two rigs coexisted only across that
short migration seam — collapsed at `04a`.

- **New in `web/src/battle/cameraRig.ts`:** `battleCameraRig(zoom, zoomRange,
  bounds)` and `campaignCameraRig(...)`, both returning `ZoomCameraRig
  { target:[x,y,z]; distance; pitch; fovY; zoomT }` (camera3d convention: pitch π/2
  = top-down, small = oblique; **pitch/distance DECREASE with zoom, fovY increases**
  — opposite sign to the legacy flat-convention `cameraForZoom` pitch). `yaw`/
  `aspect`/`near` are the caller's to fill at wire-time (`04`); `target` is a forward
  look-ahead offset along −X (the yaw-0 view direction) added to the ground
  view-centre by the caller. `zoomT` still exported (grass/haze read it).
- **Chosen curve endpoints (the human tuning knob):**
  battle pitch **1.35 → 0.28 rad** (~77°→16° down), fovY **0.50 → 0.85 rad**
  (~29°→49°), distance **2.0·min(w,h) → 0.6·min(w,h)**, forward look-ahead
  **0 → 0.30·min(w,h)**. Campaign is flatter/narrower and lingers near top-down:
  pitch **1.42 → 0.55**, fovY **0.45 → 0.65**, `easeBias` **1.8** (vs battle 1.0) so
  it stays a near-top-down chart past the midpoint. One `smoothstep(zoomT)^easeBias`
  eased parameter drives every axis → monotonic + continuous by construction.
- **Single-curve legibility:** the monotonic curve kept mid-zoom legible in the probe
  contact sheet, so the **RTS-mode fovY clamp fallback was NOT needed** (recorded as
  available if a play-test finds mid-zoom too wide).
- **Verified:** `web/tests/cameraRig.test.ts` extended (+9 tests, 37 total green) —
  pitch/fovY/distance monotonic, near-top-down band out / vista band in, continuous,
  clamped past both ends, deterministic, campaign-flatter-than-battle. `typecheck`
  green. Probe extended additively to accept `targetX/targetY/targetZ` (was fixed
  `[0,0,0]`). Contact sheet (top-down→mid→vista) captured via the
  `/renderer/camera3d-probe` route; screenshot-critique verdict: reads as a smooth
  dolly from tactical top-down to cinematic horizon vista.

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
