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
