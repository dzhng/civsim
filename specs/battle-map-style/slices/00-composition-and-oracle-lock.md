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

## Stays green

Everything — this slice changes no renderer or sim code.

## Feedback that would change it

David rejecting the camera framing (height, pitch, horizon placement). That is
exactly why this lands first: reframing after slice 13 would invalidate every
accepted crop. Open the frame with preview-shots (non-blocking, ~5 min
window); if silent, accept on evidence and record the decision here.
