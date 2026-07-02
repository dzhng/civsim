# Slice 05 — Kill the orbit (priority 1 after the reslice)

One variable: the mortal-unlock mechanism slice 04 names. Depends on 04.
Slice 03 already KILLED the chirality seed (slide/tiebreak) and measured the
constraint the fix must satisfy: with the engaged re-dress disabled, 4/5
mortal seeds spin to ±180° — so the re-dress is currently arresting a deeper
orbit while also ratcheting orientation 10–15°/beat. The fix must make the
underlying equilibrium settle (driving force → zero at a settled seam), not
just remove the ratchet: removing it alone is measured to make things WORSE.

## Contract

|`engagement_rotation_deg`| < ~10° over 300 s immortal symmetric grind,
across the seed sweep; the seam stays ~spawn-axis-aligned to the end of the
mortal vibes. Deliberate asymmetric envelopment still works.

## Mechanism candidates (04 picks; containment order)

1. **Cap-clips-the-spring:** if the per-soldier speed cap preferentially eats
   the pivot spring's restoring component on mortal runs, the first-principles
   fix is in how the cap composes with restoring steering (a cap firing on a
   state it shouldn't — the anti-X smell), not a new force.
2. **Off-axis mass chase:** if frozen-facing units chasing an off-axis alive
   mass is the orbit geometry, the driving force must go to zero at
   equilibrium — e.g. the engaged advance drive keys off the contact seam,
   not the foe centroid, so a settled seam produces no tangential chase.
   Explicitly NOT a facing servo tracking the foe centroid (that IS the swirl
   — the rejected contact-lock path).
3. **Ratchet shaping (with David):** only as the residual after 1–2 — make
   the re-dress orientation-preserving (resort within the unit's remembered
   frame) while keeping its measured-width and orbit-arrest roles;
   `column_contact_width_stays_near_its_deployed_footprint` and the
   deep-reform-off blow-up case must BOTH hold through the change.

Explicitly NOT: a facing servo tracking the foe centroid mid-grind (that IS
the swirl — sim.rs contact-lock comment), and NOT pivot lateral damping
(column-closing dead end: damp the lever's length, never its lateral
component).

## New pin

`a_symmetric_grind_does_not_pinwheel` un-ignored, green (immortal fakes,
seed-swept).

## Must stay green

Everything in slice 04's list, plus `phalanx_and_heavy_clash_without_swirling`
(the asymmetric-class swirl pin), `holding_phalanx_backline_does_not_lateral_buzz`,
`rear_ranks_do_not_crab_sideways_while_engaged_casualties_close`. Mounted
walls untouched; if the change is foot-only, golden should move only via foot
matchups — a leak means you are not contained.

## Human can run / see

Heavy-both at t300+: seam still axis-aligned, two held bodies. Side-by-side
old/new GIF; before/after rotation curve added to the visualization.
`compare-screenshots` + unprimed `screenshot-critique`; non-blocking
preview-shots checkpoint for David.


## Dead ends (measured, 2026-07-02 — first fix attempt)

Budgeted composition at a fixed saturated total is a dead end in BOTH
directions (full sweep diff archived by the orchestrator; failures measured,
not guessed):

- Full restoring-priority after cruise kills the mortal orbit but starves the
  chase terms whenever the cap binds: wrap, trample, pressure, weave contact,
  and disengage all break.
- Allocation at the original cap site stays contained but does not fix the
  orbit, and mid-strength variants fail survivability (HP2/HP1 read 2.80x vs
  the 1.7-2.3x band) while only 2/5 seeds met the pinwheel rail.

Conclusion: do not re-attempt reallocation of a saturated sum. The upstream
question is why a settled mortal grind saturates the per-soldier cap AT ALL —
a chase channel whose driving force fails to go to zero at equilibrium.
Measure which channel carries capped soldiers' demand, then shrink that
demand at ITS equilibrium.


## Dead ends, continued (2026-07-02/03 — orchestrator attempts, all measured)

- **Total fighting-tempo cap** (blade contact bounds the whole stride,
  radius = fighting flag's reach+0.3, mult 1.25): survivability executioner —
  HP2/HP1 hit 2.59x (band 1.7-2.3) — while the orbit persisted (rates up to
  +0.49 deg/s). Restricting front-two-rank circulation stretches the mid-HP
  grind.
- **Tangential fighting-tempo cap** (only the component crossing the nearest
  enemy's front, blade-lock radius 0.55m, mult 1.0): HP2/HP1 improved to the
  knife edge (2.31x) but HP4/HP1 blew out (6.75x > 6.0), and the orbit
  persisted (seed 3 +0.30 deg/s). Even tangential restriction near enemies
  stretches the long grind. The machinery (nearest_enemy/nearest_enemy_d
  persistence, FightingTempoCap channel, TEMPOCAP/TEMPORADIUS knobs) is kept
  default-disabled (mult = INFINITY) for future probes.
- **Deployed-width corridor** (corridor half-width from deployed files, not
  files_eff; DEPLOYEDCORRIDOR knob): rotation numbers byte-identical to
  baseline — files_eff does not shrink at all at these probes' casualty
  levels (240 men / 24 files shrink only below 72 alive), so corridor WIDTH
  is not the couple's source. Falsified.

**Open lead for the next pass:** the corridor is centered on `v.center()`,
which drifts with casualty-biased mass. Two corridors sliding in opposite
senses unblock one flank each — the couple with no width change. Instrument
the chain link by link before any further fix: per-seed kill-side asymmetry →
unit center lateral drift (vs pair axis) → corridor coverage of the foe's
flank columns → per-unit net forward-thrust direction, over the ramp windows,
correlated with rotation sign. Every link is a harness/state read. If the
chain confirms, the fix question becomes: what is the honest corridor
reference for a formation still holding its footprint (the slot-grid frame,
not the casualty-weighted mass)? If it does not confirm, foundation trigger
(b) fires with three measured dead ends as evidence.


## Measurement correction (2026-07-03, couple-chain probe) — READ FIRST

`blob_probe_slice05_couple_chain` killed the offset-couple hypothesis AND
exposed a detector conflation:

- Frame centers stay pinned at x=0.00 all run; ~0% of either unit is ever
  outside the foe's corridor; per-unit net lateral thrust is noise; kill
  positions show no consistent lateral bias. No couple exists in the
  controlled probes.
- Yet centroid-pair "rotation" still wanders to -26 deg — with silhouettes
  at 0.8+. With frames pinned, the pair bearing tilts from CASUALTY
  GEOGRAPHY alone (who died where moves the alive-mass centroids), no body
  rotation required. The controlled-probe rotation metric conflates death
  geography with motion — metric-encodes-the-wrong-thing, round two.
- The visual pinwheel in the vibes occurs with FREE frames (latch/pursue
  active, morale on, micro_rough on) — a configuration the pinned controlled
  probes do not reproduce (controlled rot300 ~10-25 deg noisy-sign vs
  vibe-like 40 deg one-signed with silhouette 0.62).

Next measurement (before ANY further fix): a cohort rotation detector —
track the SAME surviving soldiers' positions and fit the rigid rotation of
that cohort per unit (body motion only, dead men excluded from both
endpoints), alongside the centroid-bearing number, on (a) the controlled
probe and (b) the vibe-like config. If cohort rotation is ~0 controlled but
real vibe-like, the whole fix target moves to the frame/order layer (latch,
pursue, anchor chase under casualties) and the target pins get rebuilt on
the cohort detector. The a_symmetric_grind_does_not_pinwheel pin must NOT be
un-ignored until the detector split lands.


## Detector round 3 + the circulation discovery (2026-07-03)

`blob_probe_slice05_cohort_split` (now integrating 1s rigid fits — long-window
fits decorrelate into full-circle noise, see the probe comment):

- The integrated fit reads a near-constant ~3.2 deg/s SAME-SIGN rotation for
  BOTH units in EVERY config — controlled and vibe-like, frozen facings,
  stable silhouettes. 3.5 full turns per run is visually impossible: the
  Kabsch fit measures net angular CIRCULATION of the cohort about its
  centroid, not orientation. **Men cycle through the crowd like a tank tread
  while the shape stands still.** Orientation-of-shape and circulation-of-
  mass are different observables in a formation men flow through.
- **Discovery, follow up:** the press has a coherent internal circulation at
  ~3 deg/s, same sign for both units within a run, sign varying by seed/config
  (controlled seeds 0-3 positive, seed 4 negative; vibe-like all negative).
  This is a real transport phenomenon (possible deep cause of the slow shape
  tilt: circulation asymmetry over time), and a possible chirality connection
  — instrument its source (which channels drive the loop: slide? weave? comp?)
  with the force-trace harness.
- **The honest verdict metric for the visual pinwheel is SHAPE ORIENTATION:**
  per-unit PCA major-axis angle of living positions, tracked with axis-sign
  continuity (hysteresis), plus the seam-interface angle. It reads the tilted
  rectangle David sees, immune to churn circulation, and honest about death
  geography (if casualties tilt the shape, it LOOKS tilted — that is still
  the visual truth). Rebuild the rotation target pin on this detector, then
  re-run the controlled-vs-vibe-like split to name the fix layer.

Detector scorecard so far: centroid-pair bearing (conflates death geography),
long-window rigid fit (decorrelates), integrated short-fit (measures
circulation). Shape orientation is round 4 and matches the visual definition
of the symptom.


## Detector round 4 — shape orientation split (2026-07-03)

Detector added test-side only in
`crates/sim/tests/mechanics_melee.rs::shape_orientation_detector_reads_settled_and_synthetic_rotation`
and `blob_probe_slice05_shape_orientation_split`: per-unit PCA major-axis angle
of living positions with 180deg axis continuity/hysteresis, plus a PCA seam
axis from near-contact pair midpoints. Controls: settled block reads ~0deg;
synthetic 31deg rotated copy reads 31deg; 180deg branch continuity preserved.

Reproduce:
`cargo test -p sim --test mechanics_melee shape_orientation_detector_reads_settled_and_synthetic_rotation -- --nocapture`
and
`cargo test -p sim --test mechanics_melee blob_probe_slice05_shape_orientation_split -- --ignored --nocapture`.

| config | seed | t | unit0 shape | unit1 shape | seam | live centroid bearing | silhouette | frame center bearing | unit facings |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| controlled | 0 | 100s | +26.46 | +27.38 | +27.94 | +3.66 | 0.99 | -0.05 | +90.1 / -90.0 |
| controlled | 0 | 200s | +27.93 | +27.68 | +28.18 | -6.38 | 0.98 | -0.05 | +90.1 / -90.0 |
| controlled | 0 | 300s | +26.73 | +29.42 | +28.40 | -13.23 | 0.94 | -0.04 | +90.1 / -90.0 |
| controlled | 0 | 400s | +4.77 | +5.32 | +4.54 | +11.66 | 0.95 | -0.01 | +90.1 / -90.0 |
| controlled | 1 | 100s | +28.86 | +27.36 | +28.72 | +0.04 | 0.98 | -0.08 | +90.1 / -90.0 |
| controlled | 1 | 200s | +26.85 | +25.78 | +27.16 | +4.18 | 0.98 | -0.08 | +90.1 / -90.0 |
| controlled | 1 | 300s | +28.02 | +28.25 | +29.08 | -14.95 | 0.94 | -0.08 | +90.1 / -90.0 |
| controlled | 1 | 400s | +5.70 | +5.57 | +5.44 | +3.23 | 0.95 | -0.07 | +90.1 / -90.0 |
| controlled | 2 | 100s | +26.53 | +27.74 | +27.76 | +0.42 | 0.99 | -0.05 | +90.1 / -90.0 |
| controlled | 2 | 200s | +27.99 | +26.74 | +28.50 | -0.56 | 0.98 | -0.05 | +90.1 / -90.0 |
| controlled | 2 | 300s | +30.24 | +29.26 | +30.89 | -19.62 | 0.90 | -0.05 | +90.1 / -90.0 |
| controlled | 2 | 400s | +17.66 | +16.12 | +16.62 | -20.28 | 0.88 | -0.06 | +90.1 / -90.0 |
| controlled | 3 | 100s | +27.66 | +27.47 | +28.42 | -0.77 | 1.00 | -0.07 | +90.1 / -90.0 |
| controlled | 3 | 200s | +29.24 | +28.35 | +29.85 | -7.17 | 0.97 | -0.07 | +90.1 / -90.0 |
| controlled | 3 | 300s | +32.24 | +31.89 | +31.71 | -12.67 | 0.90 | -0.07 | +90.1 / -90.0 |
| controlled | 3 | 400s | +7.85 | +9.80 | +8.07 | -22.35 | 0.96 | -0.07 | +90.1 / -90.0 |
| controlled | 4 | 100s | -27.86 | -28.09 | -28.91 | +7.92 | 0.98 | -0.05 | +90.1 / -90.0 |
| controlled | 4 | 200s | -35.51 | -35.03 | -37.55 | +19.88 | 0.94 | -0.04 | +90.1 / -90.0 |
| controlled | 4 | 300s | -37.22 | -37.80 | -40.39 | +37.19 | 0.86 | -0.03 | +90.1 / -90.0 |
| controlled | 4 | 400s | -28.52 | -25.04 | -23.29 | +51.88 | 0.74 | -0.02 | +90.1 / -90.0 |
| vibe_like | 0 | 100s | -29.19 | -28.53 | -29.88 | +6.96 | 0.98 | -0.16 | +90.0 / -89.9 |
| vibe_like | 0 | 200s | -30.23 | -30.01 | -31.34 | +8.13 | 0.96 | -0.17 | +90.0 / -89.9 |
| vibe_like | 0 | 300s | -38.72 | -37.44 | -42.33 | +37.66 | 0.83 | -0.20 | +90.0 / -89.9 |
| vibe_like | 0 | 400s | -23.29 | -22.41 | -20.05 | +25.91 | 0.82 | -0.39 | +90.0 / -89.9 |
| vibe_like | 1 | 100s | -29.39 | -29.04 | -30.17 | +7.02 | 0.96 | -0.09 | +90.0 / -89.9 |
| vibe_like | 1 | 200s | -29.36 | -28.31 | -30.23 | +4.00 | 0.96 | -0.10 | +90.0 / -89.9 |
| vibe_like | 1 | 300s | -30.83 | -31.84 | -33.40 | +24.82 | 0.87 | -0.13 | +90.0 / -89.9 |
| vibe_like | 1 | 400s | -16.50 | -21.79 | -19.78 | +31.14 | 0.89 | +16.71 | +90.0 / -89.9 |
| vibe_like | 2 | 100s | -27.37 | -27.13 | -27.56 | -1.04 | 0.98 | -0.12 | +90.0 / -89.9 |
| vibe_like | 2 | 200s | -31.47 | -30.11 | -31.62 | +10.77 | 0.95 | -0.11 | +90.0 / -89.9 |
| vibe_like | 2 | 300s | -27.77 | -26.01 | -26.60 | +46.51 | 0.75 | -0.09 | +90.0 / -89.9 |
| vibe_like | 2 | 400s | -14.99 | +0.54 | -6.89 | +3.25 | 0.94 | +3.02 | +90.0 / -89.9 |
| vibe_like | 3 | 100s | -29.58 | -29.87 | -30.52 | +6.59 | 0.97 | -0.14 | +90.0 / -89.9 |
| vibe_like | 3 | 200s | -33.02 | -32.26 | -35.93 | +12.19 | 0.92 | -0.15 | +90.0 / -89.9 |
| vibe_like | 3 | 300s | -38.99 | -40.75 | -41.79 | +36.33 | 0.84 | -0.11 | +90.0 / -89.9 |
| vibe_like | 3 | 400s | -35.02 | -4.80 | -102.93 | +11.75 | 0.69 | +10.67 | +90.0 / -89.9 |
| vibe_like | 4 | 100s | -28.50 | -29.40 | -29.27 | +0.92 | 0.99 | -0.14 | +90.0 / -89.9 |
| vibe_like | 4 | 200s | -32.61 | -32.35 | -34.61 | +13.61 | 0.94 | -0.17 | +90.0 / -89.9 |
| vibe_like | 4 | 300s | -31.34 | -30.60 | -31.77 | +22.45 | 0.89 | -0.21 | +90.0 / -89.9 |
| vibe_like | 4 | 400s | -13.83 | -12.09 | -10.70 | +8.43 | 0.95 | -0.26 | +90.0 / -89.9 |

Verdict: shape tilt is real in both controlled and vibe-like configs; the
visual pinwheel lives in the living body/seam shape layer, not in frame wheel
(`u.facing` stays frozen and `u.center()` bearing stays ~0 through the held
grind, with only late rout/collapse excursions in a few vibe-like 400s rows).
