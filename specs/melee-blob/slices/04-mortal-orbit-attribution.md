# Slice 04 — Why does mortality unlock the orbit? (attribution round 2)

**Resliced 2026-07-02 after slice 03.** The original contract here (bound the
seam band) is retired: the band was KILLED as a symptom — sustained p95 ≈ 1–2
rank-spacings even under full vibe noise, inside David's ≤3 budget. The
standoff-double-push rider moves to the backlog check in slice 08 (its 1v1
pin is still worth writing, but no fix hangs on it). What remains from slice
03 is one sharp open question, and no fix code should be written until it
closes: immortal grinds oscillate at 4–9° forever, mortal grinds ramp
21°→62°. Name the mechanism that converts casualties into sustained pair
rotation.

## Contract

A measured verdict naming the mortal-unlock mechanism, with the deciding
numbers, plus activation of the already-green band rail. Instrumentation
only; default behavior byte-identical; golden unchanged.

## Questions (each gets CONFIRMED/KILLED + numbers)

1. **Cap-clips-the-spring:** the slice 03 torque budget shows SpeedCap and
   PivotSpring as huge canceling terms (+160k vs −150k per 25s window). Using
   the cap's pre/post records, measure whether the per-soldier speed cap
   preferentially clips the *restoring* (counter-tilt) component of steering
   on mortal runs — i.e. the spring pushes back, the cap eats it, the drift
   survives. Compare cap-clip direction distributions mortal vs immortal.
2. **Off-axis mass chase:** per tick, the angle between each unit's frozen
   facing and the bearing to the foe's *alive-mass* centroid, vs rotation
   rate. Casualties are asymmetric (wrap corners eat first); if the frozen
   facing chases an off-axis mass, orbit is the geometry. Correlate
   kill-position asymmetry (kill histogram in the unit frame) with the
   rotation sign per seed.
3. **Ratchet timing:** between re-dress beats, does orientation drift and
   spring back (beats legalize accumulated tilt: the ratchet), or does the
   step happen AT the beat (re-dress itself rotates the lattice)? Correlate
   per-beat `lattice_orientation_deg` steps with the rotation increments
   between beats, on the mortal 5-seed sweep.
4. **Forward-close feed:** does `compact_columns`' forward closing shift
   alive mass laterally toward the wrap side after corner kills (measure
   lateral alive-mass offset before/after casualty repair events)?

## Also in this slice (cheap, measured green already)

Un-ignore `a_long_grind_keeps_the_seam_band_bounded` as an active protective
rail (slices 02/03 measured it green at ≤3 rank-spacings sustained; it pins
today's acceptable churn so no later fix regresses it silently). Keep the
other three pins ignored — they are targets, not rails, until their fixes.

## Verification

Default golden unchanged; `./scripts/test-mechanics` green including the
newly-active band rail; probes ignored + env/feature gated. Verdicts appended
to the README table with reproduce commands; raw numbers at the bottom of
this file.

## What would change this slice

If all four questions come back ambiguous, that is foundation-trigger (a) in
the README Risks — the engaged-steering equilibrium itself — and slice 05
becomes the deliberate rebuild with David, not another patch probe.

## Raw numbers (2026-07-02, slice 04)

All commands run from the repo root in this worktree. Default behavior remained
contained; the probes are ignored except for the active seam-band rail.

### Cap-clips-the-spring

Command:
`cargo test -p sim --test force_trace --features force-trace blob_probe_slice04_cap_clips_spring -- --ignored --nocapture`

Values decompose each SpeedCap removal (`pre - post`) against that soldier's
same-tick PivotSpring vector. `parallel_frac_of_signed` =
parallel / (parallel + antiparallel); `parallel_frac_of_total` =
parallel / total cap removal magnitude.

| variant | unit | window | rotation | samples | total removed | parallel | antiparallel | parallel signed | parallel total |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|
| immortal | 0 | 300-325s | 8.69 -> 4.32 | 173272 | 79375.930 | 55759.430 | 6995.437 | 0.889 | 0.702 |
| immortal | 1 | 300-325s | 8.69 -> 4.32 | 172352 | 71522.234 | 48353.891 | 6967.732 | 0.874 | 0.676 |
| immortal | 0 | 325-350s | 4.36 -> 6.06 | 173131 | 78486.984 | 54755.410 | 7043.956 | 0.886 | 0.698 |
| immortal | 1 | 325-350s | 4.36 -> 6.06 | 172090 | 72956.305 | 50688.207 | 6894.054 | 0.880 | 0.695 |
| immortal | 0 | 350-375s | 6.12 -> 8.98 | 172701 | 72656.969 | 50006.805 | 6867.363 | 0.879 | 0.688 |
| immortal | 1 | 350-375s | 6.12 -> 8.98 | 172985 | 76153.508 | 52541.648 | 7082.051 | 0.881 | 0.690 |
| immortal | 0 | 375-400s | 8.99 -> 6.28 | 172867 | 73884.633 | 50935.602 | 7044.688 | 0.878 | 0.689 |
| immortal | 1 | 375-400s | 8.99 -> 6.28 | 172771 | 72500.508 | 48962.012 | 7185.048 | 0.872 | 0.675 |
| mortal | 0 | 300-325s | 21.48 -> 46.87 | 82830 | 31370.230 | 24541.771 | 1472.746 | 0.943 | 0.782 |
| mortal | 1 | 300-325s | 21.48 -> 46.87 | 84214 | 31187.176 | 23752.521 | 1735.824 | 0.932 | 0.762 |
| mortal | 0 | 325-350s | 46.83 -> 53.92 | 67424 | 17110.232 | 10152.812 | 2046.598 | 0.832 | 0.593 |
| mortal | 1 | 325-350s | 46.83 -> 53.92 | 66245 | 19246.488 | 13286.059 | 1424.978 | 0.903 | 0.690 |
| mortal | 0 | 350-375s | 53.93 -> 61.92 | 50100 | 21596.203 | 16988.055 | 1137.017 | 0.937 | 0.787 |
| mortal | 1 | 350-375s | 53.93 -> 61.92 | 46613 | 34243.129 | 31063.494 | 527.581 | 0.983 | 0.907 |
| mortal | 0 | 375-400s | 61.90 -> 37.65 | 36572 | 14691.527 | 12171.118 | 509.655 | 0.960 | 0.828 |
| mortal | 1 | 375-400s | 61.90 -> 37.65 | 35899 | 16285.405 | 13914.240 | 423.683 | 0.970 | 0.854 |

Summary: mortal avg `parallel_frac_of_signed=0.933`,
`parallel_frac_of_total=0.775`; immortal avg `0.880` and `0.689`.

### Off-axis mass chase

Command:
`cargo test -p sim --test mechanics_melee blob_probe_slice04_off_axis_mass_chase -- --ignored --nocapture`

`avg_foe_mass_angle300_400` is signed in each unit's frozen facing frame, with
positive matching positive engagement rotation. `kill_balance` is
`(right-left)/(right+left)` averaged across the two victim units.

| seed | rot300 | rot400 | rate 300-400 | avg foe-mass angle | sign match | kill balance all | kill balance late |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | -13.41 | +11.80 | +0.2521 | -14.317 | 0 | -0.017 | +0.032 |
| 1 | -15.15 | +1.69 | +0.1683 | -16.988 | 0 | -0.097 | -0.108 |
| 2 | -19.87 | -20.25 | -0.0039 | -20.182 | 1 | -0.263 | -0.233 |
| 3 | -12.85 | -22.05 | -0.0920 | -21.299 | 1 | -0.092 | -0.190 |
| 4 | +37.23 | +52.05 | +0.1483 | +36.869 | 1 | +0.136 | +0.120 |

Kill-position histograms:

| seed | unit | all L/R | all front/rear | late L/R | late front/rear |
|---:|---:|---|---|---|---|
| 0 | 0 | 69/61 | 89/41 | 29/25 | 37/17 |
| 0 | 1 | 71/75 | 101/45 | 25/33 | 48/10 |
| 1 | 0 | 75/63 | 102/36 | 31/27 | 47/11 |
| 1 | 1 | 88/71 | 111/48 | 43/32 | 52/23 |
| 2 | 0 | 80/45 | 83/42 | 25/18 | 34/9 |
| 2 | 1 | 76/46 | 79/43 | 28/15 | 27/16 |
| 3 | 0 | 71/69 | 100/40 | 26/28 | 43/11 |
| 3 | 1 | 79/56 | 86/49 | 34/14 | 27/21 |
| 4 | 0 | 84/116 | 139/61 | 40/51 | 71/20 |
| 4 | 1 | 83/104 | 122/65 | 33/42 | 49/26 |

### Ratchet timing

Command:
`cargo test -p sim --test mechanics_melee blob_probe_slice04_ratchet_timing -- --ignored --nocapture`

Per beat, `interbeat_lattice` is the lattice drift from the previous beat's
post-reassign state to the current pre-reassign state; `beat_step` is the
current reassign step itself.

| seed | beats | mean abs interbeat lattice | mean abs beat step | mean abs pair-rotation interbeat | beat step exceeds interbeat | step/rotation sign match |
|---:|---:|---:|---:|---:|---:|---:|
| 0 | 264 | 17.137 | 17.037 | 1.129 | 134/264 | 149/264 |
| 1 | 256 | 17.365 | 17.254 | 1.088 | 120/256 | 135/256 |
| 2 | 273 | 17.895 | 17.807 | 1.022 | 134/273 | 154/273 |
| 3 | 260 | 17.611 | 17.504 | 1.252 | 121/260 | 137/260 |
| 4 | 206 | 15.689 | 15.574 | 1.566 | 98/206 | 125/206 |

Totals: beat step exceeded interbeat drift in 607/1259 beats; step sign matched
pair-rotation interbeat sign in 700/1259 beats.

### Forward-close feed

Command:
`cargo test -p sim --test mechanics_melee blob_probe_slice04_forward_close_feed -- --ignored --nocapture`

`signed_*_delta` multiplies the lateral shift by current engagement-rotation
sign, so positive means toward the wrap side.

| seed | events | mean signed physical delta | toward-wrap physical | mean signed slot delta | toward-wrap slot |
|---:|---:|---:|---:|---:|---:|
| 0 | 19 | -0.00222 m | 7/19 | -0.00312 m | 5/19 |
| 1 | 23 | -0.00066 m | 14/23 | +0.00050 m | 8/23 |
| 2 | 8 | +0.00008 m | 4/8 | -0.00000 m | 0/8 |
| 3 | 13 | +0.00060 m | 10/13 | +0.00000 m | 2/13 |
| 4 | 74 | -0.00155 m | 44/74 | -0.00438 m | 7/74 |

Totals: 137 events, mean signed physical shift -0.0012 m/event with 79/137
toward-wrap; mean signed slot-target shift -0.0027 m/event with 22/137
toward-wrap.
