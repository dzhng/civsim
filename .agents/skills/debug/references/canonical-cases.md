# Canonical debugging cases

Worked examples behind the rules in `SKILL.md`. Read the one whose pattern
matches what you're staring at.

## The `reassign_slots` cliff (small perturbation, big effect)

`reassign_slots` re-forms a unit by sorting living men by depth, chunking into
ranks, and packing onto slots `0..alive_count`. The original sorted from
scratch with **no memory**. That is a cliff: two men at nearly equal depth,
jittered 6 cm by the fidget, flip their sort order and **swap slots** — a full
spacing (~0.7 m) of pointless motion that cascades down the ranks and, the
moment a charge lands, flips whether it tramples through or stalls. A 6 cm
cause, a 0.7 m effect.

The instructive part is the **fixes that were wrong**:

1. **Sticky back-fill** (keep your slot unless shoved past a radius): killed
   the jitter but made lines unnaturally *rigid* — displaced men clung to old
   slots and pushed back into a charge, stopping 400 horse with a 2-deep line.
   One unrealistic behavior traded for another.
2. **Quantize the sort keys** (snap depth/lateral to a grain coarser than the
   fidget): robust to jitter, but it *also* damps real combat-displacement
   churn — stiffens dense scrums and tips matchups (HAR-vs-PIK at one grain,
   CAV-vs-HVY at another). **It passes more tests by quietly distorting
   combat.** That is the hack trap: any stabilizer touching geometry a fight
   reads is changing combat to pass tests.

The **right fix removes the perturbation at its source, exactly**: the steer
pass records each man's idle-sway offset in `fidget_offset[i]`;
`reassign_slots` subtracts it before sorting. A fighting man carries zero
offset, so the re-form is byte-for-byte the clean-formation sort — no combat
geometry is touched — yet idle jitter can never reach the ranks. Cliff gone,
combat untouched. The proof: `golden_state_hash_stable` passes unchanged.

## The `min_range` cliff (monotonicity violation)

Raising cavalry `block` made it **lose** to heavy infantry. Trajectory: more
block → the cav's front rank *survived* contact → it stayed pinned deeper in
the press → crowded *inside its lance's `min_range`* → dropped to its weak
sidearm → offense collapsed → ground down. The bug was a **weapon `min_range`
cliff**: a hard dead zone making weapon effectiveness depend on crowding,
which depended on survival, which depended on block.

The wrong move was rationalizing it ("cavalry is a striker not a tank, the sim
correctly punishes a tanky horse") — a just-so story for why a buff hurt. The
fix removed the dead zone (a melee lance works couched or shortened), so being
crowded no longer disarms the rider; now more block monotonically helps —
which is what finally let block be *raised* the way it always should have.
Guard: `more_block_never_makes_cavalry_worse` sweeps block over {0.2..0.6} and
asserts the survival margin doesn't fall.

## The long-sword inert lever (measure the signal first)

Goal: a unit *strong attacking, weak defending* via a "pressure sensitivity"
knob — physically reasonable (a great sword can't sweep when pressed).
Measuring the candidate signals first, before tuning, killed it in minutes:

- The `vice` (`pressure − |net push|`) is ~0 in a frontal clash — it only
  spikes when *wedged between opposing masses* (surrounded). A lever on vice
  was inert in any head-on duel. Right instinct ("loses when pressed"), wrong
  signal: vice measures *surround*, not *contact*.
- Total received pressure was **identical** attacking vs defending: 0.39 /
  0.39 / 0.36 across charge-offense / cautious / held-defense. The proposed
  reach-holding stance never created a weapon-length standoff, so there was no
  offense/defense differential for *any* pressure lever to exploit.

Conclusion the measurement forced: the knob can't work until a deeper mechanic
(a real standoff that bleeds less contact pressure) creates the differential.
Measuring turned "add a stat and tune it" into "the premise doesn't hold yet —
here's the prerequisite," avoiding an inert lever. Measure the signal, *then*
decide if the lever can exist.

## The "surrounded" screenshot (eyeball the geometry)

A "long sword surrounded" measurement looked decisive (kills ~0), but the
screenshot showed the long swords deployed as a 40-wide *thin line* with the
"surrounding" units merely flanking its ends — not an envelopment at all.
Re-running with the block deepened to a ~13×13 square ringed on four sides was
a *different* (correct) scenario. Trusting the numbers would have drawn the
wrong conclusion about what "surrounded" does. The `?battle=surround` sandbox +
`shots/surround-{deploy,mobbed}.png` are both the gut-check bench and the
regression pin.
