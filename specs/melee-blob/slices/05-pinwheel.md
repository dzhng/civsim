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
