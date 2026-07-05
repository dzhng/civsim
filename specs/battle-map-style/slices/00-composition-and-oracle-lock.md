# 00 — Composition + oracle lock

Pin the judging apparatus before any art exists, so no later slice can move
the camera or bend the metrics to hide a problem.

## Contract unlocked

Every V-track slice judges its crop through this slice's locked camera, band
crops, and calibrated oracle. The camera and crops are code, not prose.

## API seam

- New scene `web/scenes/battle/battle-map-style.mjs`: the locked vista camera
  on the photoreal battle route. Horizon at **0.50 ± 0.03**, measured from the
  far terrain perimeter (never from sky color, so fog work cannot game it).
  Named band crops exported as constants: `near-grass`, `mid-field`,
  `flank-cliff` (west and east), `sky-haze`, plus a `close-gate` camera where
  a nominal blade projects to ≈12 px (the vista projects ≈4.5 px — blades are
  never ratified there; that split is recorded salvage wisdom).
- Carry `battle-map-reference-grass-legibility-lib.js` **verbatim** from
  `git show pr-3-review:web/scenes/battle/battle-map-reference-grass-legibility-lib.js`
  into `web/scenes/battle/` (rename to `battle-map-style-legibility-lib.js`).
  Recalibrate the `ORACLE` thresholds once, here, against the new target
  crops.
- Calibration scene: the reference target crop **must pass**; a grass-off
  control and at least two named false-positives from the rejection ledger
  (stipple carpet, smooth painted meadow) **must fail** with their named
  failure modes. Positive and negative anchors always ship together.

## Human can run

`node scene.mjs battle-map-style` — full-frame snap plus each band crop as its
own snapshot. The calibration scene prints the oracle verdict table.

## Verification

- snapCheck baselines for the camera frame and band crops (these ARE the
  contract).
- Calibration assertions as above.
- Run screenshot-critique on the composed frame once — not to judge beauty
  (there is no art yet) but to confirm the crops isolate what they claim to.

### Locked values (accepted 2026-07-04, live-verified)

- Scene: `web/scenes/battle/battle-map-style.mjs`; snapshots under
  `web/shots/battle/battle-map-style/`.
- Both cameras are the REAL production rig. Vista:
  `/renderer/photoreal-battle?map=A&ref=1&env=overcast-foggy&t=0&ticks=60&zoom=7.76&cx=0&cy=-650&camYaw=-1.5707963267948966`
  -> rig resolves pitch `0.305`, distance `197.7`, eye `~59 m`, facing north
  along the corridor. Close gate: same with `zoom=7.86` -> pitch `0.263`,
  distance `75.7`, eye `~20 m`.
- **Camera-truth trap (recorded the hard way):** the route's `?pitch`/`?yaw`
  params only patch the reported stats snapshot -- they do NOT move the render
  camera. The scene uses the new `?camYaw` param (a real camera rotation) and
  measures only the live `stats.camera.camera3d`. Never judge a shot through
  the patched snapshot.
- **Horizon deferral decision:** on a flat hand map the terrain-seated rig
  cannot center the far ground line (it forces pitch -> 0, a grasshopper
  camera). Measured live geometric north-edge line: `horizonYRatio = 0.187`,
  pinned as regression (+/-0.02). The style contract's `0.50 +/- 0.03` target
  binds from slice 02's clay scene onward, where generated relief gives the
  camera a hill to stand on (`Camera.params()` seats the target on
  `groundHeight`).
- Blade projection split, measured on the live rig: close gate `11.43 px`,
  vista `4.39 px` (nominal 1.0 m blade at the camera target).
- Band crops, normalized to the 1280x800 frame:
  `near-grass={x:0,y:0.56,w:1,h:0.38}`, `mid-field={x:0.12,y:0.38,w:0.76,h:0.18}`,
  `flank-cliff-west={x:0,y:0.25,w:0.26,h:0.34}`,
  `flank-cliff-east={x:0.74,y:0.25,w:0.26,h:0.34}`,
  `sky-haze={x:0,y:0.02,w:1,h:0.25}`. On the hand map the flank-cliff bands
  frame mostly haze (blockers swallowed by overcast-foggy) -- their meaning
  fills in on generated maps; the crops are frozen now so the camera cannot
  move later.
- Oracle crop: the `near-grass` crop of `assets/target-battle-map.png`.
  Thresholds: `rawEdgeMax=8`, `retention4Min=0.35`, `down4ContrastMin=5`,
  `tile4Occupancy3Min=0.78`, `tile4CvMin=0.62`, `tile4CvMax=0.9`,
  `down4VerticalEdgeRatioMin=1.25`, `verticalRunP90HeightMin=0.22`,
  `verticalRunTallColumnMin=0.08`. Calibration: target=pass; grass-off=fail
  [low-structure-occupancy, bad-structure-spread]; stipple-carpet=fail
  [raw-edge-stipple, low-downsample-retention, bad-structure-spread,
  isotropic-confetti, short-vertical-runs, sparse-tall-runs];
  smooth-painted-meadow=fail [bad-structure-spread].
- Live verification: scene green twice against blessed baselines; PNGs
  inspected (vista: tuft plain receding into haze from a 59 m eye; close
  gate: individual tufts legible -- the honest pale-speckle baseline slice 10
  must beat).

### Amendment (2026-07-05, slice 10 pass): oracle re-anchored to the CLOSE target

The first calibration used the vista reference's near-grass band — meadow-mass
texture with no resolvable blades — and REJECTED the true close-up target
(`assets/target-close-grass.png`, the archived close-lab hero crop) with the
same failures as any real blade render. Recalibrated: target = the close crop;
anisotropy is a MAX at close range (parallel strands make X-transitions
dominate — smooth meadow, grass-off, and stipple all score HIGHER than real
grass); a raw fine-detail FLOOR separates real strands from their blur; the
two vertical-run checks keep their anti-stipple role (stipple ~0.04/0.0) at
0.08/0.3 rather than demanding the painting's soft-mass 0.57 — a crisp
real-time render tops out near 0.1 because columns cross many blade/gap
boundaries. Anchor pairing holds: target passes, all three controls fail with
named modes. Calibration lives in the scene and reruns every pass.

## Stays green

Everything — this slice changes no renderer or sim code.

## Feedback that would change it

David rejecting the camera framing (height, pitch, horizon placement). That is
exactly why this lands first: reframing after slice 13 would invalidate every
accepted crop. Open the frame with preview-shots (non-blocking, ~5 min
window); if silent, accept on evidence and record the decision here.
