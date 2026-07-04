# 02 — Landform: the highland corridor shape

One heightfield whose naked clay silhouette reads as the reference family:
rolling floor, tall flank walls, open N/S aprons.

## Contract unlocked

`genmap/landform.rs` produces the true-meter heightfield every later G-slice
derives from and every V-slice renders.

## API seam

- **Macro control map × detail noise** (the Total War low-frequency-map
  pattern): a parametric macro mask — E/W edge-cliff ramps, a guaranteed
  low-lying central corridor, N/S deployment aprons — plus warped fBm detail
  whose **amplitude budget is clamped inside the corridor** so noise can never
  spawn a wall where the certificate needs passage.
- **The height function's domain is the full vista extent** (playable × 2 per
  axis — slice 14 samples the surround coarsely). Design consequence: the E/W
  ridge masses straddle the playable boundary — feet inside the grid, bulk
  outside — so the walls read as mountains the map sits against, not berms at
  the fence. This slice only *samples* the playable center; the vista mesh is
  slice 14's job.
- Flank walls use ridged shaping (sharpness blending toward the edges) and
  analytical-derivative slope damping for the eroded look; **no droplet
  erosion** (sub-Nyquist at 4 m cells; recorded research decision). An
  optional thermal relaxation pass at the passable talus angle may run inside
  the corridor mask.
- True meters: corridor swells ±5–8 m, flank walls of order 40–120 m. The
  render handshake: generated maps carry `reliefScale = 1.0` in the
  descriptor; `BATTLE_RELIEF_EXAGGERATION` (1.6) becomes the hand-maps-only
  value behind one per-source field. Passability (slice 03) derives from the
  same meters the renderer draws — this kills the salvage ledger's
  exaggerated-surface flaw by construction.
- Height only: `speed`/`rough`/`tint` untouched this slice (map fully
  passable).

## Human can run

`battle-genmap-clay.mjs`: heights rendered neutral-clay — grass, fog, tint,
water all OFF — at the slice-00 locked camera, plus a top-down clay ortho.

## Verification

- Cargo: height-statistic bounds per seed sweep (deployment-apron mean |slope|
  under threshold; flank ridge heights over threshold; interior relief inside
  the rolling band).
- Elevation seating tripwire green with `reliefScale=1.0` (soldiers seated on
  true meters).
- **Judged crop:** the clay vista N→S and the W-flank band from slice 00.
  compare-screenshots against the reference's *landform only*; unprimed
  screenshot-critique as the last check.
- **Out of scope wrongness:** color, texture, grass, water, haze — a gray
  world is correct here.

## Stays green

Slice-01 determinism hashes (re-pin deliberately — the field changed), hand
maps untouched, elevation tripwire.

## Feedback that would change it

"The flanks read as bumps, not walls" → amplitude/ridge parameters, possibly
feeding slice 14's vista-apron decision early. Open clay shots with
preview-shots (non-blocking).
