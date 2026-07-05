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

## Landed (2026-07-05) — checkpoint accepted, two debts recorded

- `genmap/landform.rs`: macro corridor/ridge mask x domain-warped
  derivative-damped fBm, ridged flank shaping; corridor +/-6 m, flank peaks
  107-121 m across seeds; aprons flattened; corridor amplitude clamped.
  Certificates + hand-map pins green over the sweep; seed-7 hash re-pinned
  (0x3138cbc0087fc0cd).
- Verified live: smoke scene green (real render shows eroded flank masses
  inside the grid, rolling corridor, flat aprons); elevation tripwire green;
  clay scene green twice with synthetic hillshade snaps (top-down +
  pseudo-vista).
- **Debt 1 (next G-pass):** the clay scene renders a SYNTHETIC height-sampled
  hillshade, not the real pipeline at the locked camera - the silhouette
  family verdict and the horizon-0.50 promotion wait for a real-pipeline clay
  (ride slice 03's mask scene or a clay route param).
- **Debt 2 (fix in slice 03 pass):** the deployment-apron flattening leaves a
  stamped oval dish imprint in the corridor hillshade - smooth the apron
  mask's falloff.
## Feedback that would change it

"The flanks read as bumps, not walls" → amplitude/ridge parameters, possibly
feeding slice 14's vista-apron decision early. Open clay shots with
preview-shots (non-blocking).

## Landed 2026-07-05 (code/cargo; browser pending)

- `crates/sim/src/genmap/landform.rs` now owns generated height: a guaranteed
  low central corridor, north/south deployment apron flattening, east/west ridge
  feet inside the playable grid with crests placed beyond the boundary in the
  `vista_extent = 2.0` domain, one domain warp, derivative-damped fBm, and
  ridged flank shaping. No droplet erosion.
- Key constants: corridor half-width `390 m`, transition `230 m`, ridge foot
  `520 m`, ridge crest `1320 m`, corridor detail budget `5.0 m`, flank detail
  `7..17 m`, apron detail multiplier `0.36`.
- Slice 01 speed/tint passability writes remain unchanged: crag-circle E/W
  seals still write `speed=0`, `rough=0`, `tint=2`; all other cells stay
  speed-passable. Rough keeps the slice 01 value-noise formula.
- Seed sweep stats pinned by cargo for seeds 1..4:
  - seed 1: corridor `-6.47..5.27 m`, flank peaks `115.17..119.72 m`
  - seed 2: corridor `-5.47..6.28 m`, flank peaks `107.78..120.77 m`
  - seed 3: corridor `-6.55..5.34 m`, flank peaks `112.62..115.69 m`
  - seed 4: corridor `-6.34..4.16 m`, flank peaks `111.18..116.36 m`
- New generated seed-7 terrain hash: `0x3138cbc0087fc0cd`. Hand-map hashes
  stayed pinned:
  `RiverAndCrags=0x1d65c06afbab0eca`,
  `WalledPlain=0x864fe11f35ddf30c`,
  `CoastalScrub=0x020ad95c550af7b6`.
- New scene: `web/scenes/battle/battle-genmap-clay.mjs`. It boots
  `?map=gen&seed=7`, samples `window.__game.heightAt`, and writes neutral-clay
  synthetic vista/topdown snaps without renderer changes. Horizon measurement
  records the browser-run value and whether it hits `0.50±0.03`; promote it to
  a hard target assert after the orchestrator records the measured pin.
- Orchestrator TODO: rebuild wasm, run `battle-genmap-smoke`,
  `battle-genmap-clay`, and `battle-terrain-elevation`; bless/inspect the new
  clay baselines; record the clay horizon value here; run screenshot critique /
  compare-screenshots against the topdown inspiration for landform only.
