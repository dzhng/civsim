---
name: debug-battle-behavior
description: How to debug emergent battle behavior and decide whether a red test is a real regression or an exposed-fragility — instrument the trajectory, treat tiny perturbations as a litmus test, never distort combat or revert a more-realistic change just to go green. Use when a sim change shifts combat outcomes, a contract goes red, or behavior "feels off".
---

# Debugging battle behavior

The sim's whole design is maximum emergence from the simplest physics: formulas
read measured physical state (men, mass, motion), and behavior falls out. That
means when something looks wrong, the bug is almost never where the symptom is —
a charge that stalls, a line that routs early, a duel that flips. This skill is
how to find the real cause and how to judge what to do about it. Pairs with
[write-tests](../write-tests/SKILL.md) (how to measure) and
[balance-unit](../balance-unit/SKILL.md) (class stats).

## The ultimate judge is realism, not the test

This is the rule everything else serves. When a change makes a test go red, the
question is **NOT "how do I make it green again"** — it's **"which behavior is
the more realistic first-principles result?"** Then you keep that one, whatever
it does to the test.

- **Never revert a more-realistic change to pass a test.** If you catch yourself
  undoing a better mechanism (or worse, writing a comment that rationalizes the
  undo) so the suite goes green, stop — that's the tell. Example from the field:
  `mark_at_ease` was changed from centre-to-centre distance to extent-aware
  (edge-to-edge), which is correct — a 200-wide line whose flank a column nearly
  touches is NOT at ease even if the centroids are far. The feint test went red.
  Reverting to centre distance "to fix the test" was wrong; the right move was
  to keep extent-aware and re-judge the test.
- **Tests are not written in stone.** A red test after a behavior change can mean
  the NEW behavior is *more* realistic and the test was wrong — a positive
  emergent property you just discovered. Gut-check it: *is this result actually
  realistic? does it have historical precedent?* Example: with the stable
  re-form, 80 horse bog down in an 800-man, 8-deep block instead of riding clean
  through. That's correct (deep formations stop cavalry; the test asserting
  ride-through was the bug). Carrhae, pike-vs-horse, testudo-vs-archers — the
  historical record is a real input to the judgment.
- When the realism call is genuinely a design decision (a balance pillar, an
  intended counter), it's David's to make. Bring it to him with the trajectory
  and the historical angle, don't silently pin a new number. See
  [write-tests](../write-tests/SKILL.md) "Anchor tests to design contracts".

## Regression, or exposed latent fragility?

Before "fixing" a red test, decide which of these it is — the fix is completely
different:

- **Regression**: your change made a genuinely-correct behavior worse. Fix the
  change.
- **Exposed latent fragility**: the behavior was *always* this fragile/wrong;
  your change just knocked it off a lucky perch. Fix the fragility (or the test),
  not your change.

**How to tell them apart: run the scenario across several seeds.** A test that
passes at one seed and the "true" value that's chaotic across seeds means the
test was passing by *seed-luck* — that's latent, not a regression. Field example:
`light_horse_tramples` asserts the light-horse/heavy-horse butchery ratio is in
[0.3, 0.7]. Across seeds 11-15 with the perturbation OFF the ratio was
0.35/0.24/0.19/0.28/0.36 — true value ~0.28 ± 0.08, sitting right on the 0.3
floor. The test passed only because SEED=11 happened to land at 0.35. No change
"regressed" it; a tiny perturbation just exposed that it was a knife-edge test
all along. The fix is a robust measurement (average seeds, calibrate the band to
the real ~0.28), not a physics change.

Also compare your suspected cause ON vs OFF: if the test fails the same way with
the suspected mechanism disabled, that mechanism isn't the cause. (Softening the
trample gate "to fix" the trample tests changed *nothing* — hard vs soft gate
gave identical numbers — which proved the gate was never the cause.)

## Balance issue, or mechanics issue?

The other classify-before-you-fix question, and it decides *what file you
touch*:

- **Mechanics issue**: the physics/logic is wrong — a cliff, a bad formula, a
  missing or miswired interaction. The fix is in the sim (`combat.rs`,
  `collision.rs`, `morale.rs`, `sim.rs`).
- **Balance issue**: the mechanism is correct but the *numbers* — a stat
  (ammo, damage, mass, reach) or a tunable — produce an unrealistic outcome.
  The fix is in the class table / `tunables.rs`, never in the physics.

Wrong diagnosis wastes the effort and often makes things worse: re-tuning a stat
to paper over a broken mechanism bakes the bug into the balance, and rewriting a
mechanism to hit a number a stat should own distorts every *other* matchup that
mechanism touches. Ask first. Example: horse archers beating a phalanx frontally
looked like a balance problem (too much ammo / damage), but the trajectory
showed the horse *closing to melee* and winning the grind — a mechanics question
(does the pike reach / impale stop a light horse closing in?) wearing a balance
costume. The same scenario can hide both layers; separate them.

**Write mechanics tests to isolate the mechanism from the stats.** The cleanest
way to prove a mechanism — a flank bonus, a rear-arc vulnerability, a press
crush, a depth advantage — is a **mirror match: the SAME unit on both sides**, so
no stat difference can confound the result; the only variable is the mechanic
(facing, depth, position) you're flipping. Reach for different classes only when
the matchup *itself* is the thing under test (a balance contract like "pikes stop
horse"). A mechanics test that uses two different units is measuring mechanism
and balance at once, and you won't know which one moved when it goes red. See
[write-tests](../write-tests/SKILL.md) "Control your variables".

## A stat increase must never make a unit WORSE (monotonicity)

If raising a stat — more armour, more block, more health, more damage — makes a
unit perform *worse*, that is a **bug**, full stop. Mechanics must not be coupled
to a stat such that improving it degrades the outcome. **Do NOT rationalise a
monotonicity violation as "emergent realism"** — I did exactly that with the
horse below ("cavalry is a striker not a tank, the sim correctly punishes a tanky
horse") and it was wrong. Emergence explains *which* unit wins a fair fight; it
never excuses *more of a good stat losing*. When you catch yourself writing a
just-so story for why a buff hurt, stop — you're papering over a stat-coupled
mechanic.

**Test it by sweeping the stat.** Runtime `BalanceConfig` (`cfg.set(class, stats)`
+ `Sim::with_balance`) lets you sweep a stat across N values with no recompile;
`run_over_seeds` aggregates each rung. Assert the outcome is non-decreasing —
`more_block_never_makes_cavalry_worse` sweeps ShockCavalry block over
{0.2..0.6} and asserts the survival margin doesn't fall. A monotonicity
regression test is the cheapest guard against a whole class of these.

The canonical case: raising cavalry `block` made it LOSE to heavy infantry.
Trajectory: more block → the cav's front rank *survived* the contact → it stayed
pinned deeper in the press → crowded *inside its lance's `min_range`* → it
dropped to its weak sidearm → its offense collapsed and it was ground down. The
bug was a **weapon `min_range` cliff** — a hard dead zone that made weapon
effectiveness depend on crowding, which depended on survival, which depended on
block. The fix removed the dead zone (a melee lance works couched or shortened),
so being crowded no longer disarms the rider — and now more block monotonically
helps, which is what let block finally be *raised* the way it always should have.

## The fidget is a litmus test for non-robust logic

There is a deliberate idle "fidget" — a small, deterministic (`stagger01`, no
RNG) sway that drifts a minority of standing men ~6 cm off their slot. Beyond
liveliness, **it is a permanent litmus test: if a 6 cm sway swings a combat
outcome dramatically, the logic is not robust — and the fix is to make the logic
robust, never to silence the fidget.**

- **Do NOT make the fidget a tunable you zero inside contract tests.** That hides
  the fragility instead of fixing it — the same sin as reverting a good change.
- **Do NOT "fix" it by shrinking the perturbation.** A smaller sway papers over
  the cliff; the fragility remains for any other raggedness source (combat
  shoving, terrain). Find and remove the *amplifier*.
- A small perturbation should produce a small, proportionate effect. If it
  produces a big one, there's a **cliff** somewhere — a hard threshold that a
  hair of input flips. Hunt the cliff.

## The reassign_slots cliff — the canonical case

`reassign_slots` re-forms a unit by sorting living men by depth, chunking into
ranks, and packing onto slots `0..alive_count`. The original did a from-scratch
positional sort with **no memory**. That is a cliff: two men at nearly equal
depth, jittered 6 cm, flip their sort order and **swap slots** — a full spacing
(~0.7 m) of pointless motion that cascades down the ranks and, at the moment a
charge lands, flips whether it tramples through or stalls. A 6 cm cause, a
0.7 m effect: the fidget screamed about it.

The instructive part is the FIXES THAT WERE WRONG:

1. **Sticky back-fill** (keep your slot unless shoved past a radius): killed the
   jitter but made lines unnaturally *rigid* — displaced men clung to old slots
   and pushed back into a charge, stopping 400 horse with a 2-deep line. Trading
   one unrealistic behavior for another.
2. **Quantize the sort keys** (snap depth/lateral to a grain coarser than the
   fidget): robust to jitter, but it *also* damps real combat-displacement churn
   — it stiffens dense scrums and tips matchups (HAR-vs-PIK at one grain,
   CAV-vs-HVY at another). **It passes more tests by quietly distorting combat.**
   That is the hack trap: any "stabilizer" that touches the geometry a fight
   reads is changing combat to pass tests.

The RIGHT fix removes the perturbation **at its source, exactly**: the steer pass
records each man's idle-sway offset in `fidget_offset[i]`; `reassign_slots`
subtracts it before sorting. A fighting man carries zero offset, so the re-form
is byte-for-byte the clean-formation sort — **no combat geometry is touched** —
yet idle jitter can never reach the ranks. Cliff gone, combat untouched.

**The proof of combat-neutrality is the golden hash.** A faithful stabilization
leaves every engaged/moving unit byte-for-byte identical, so `golden_state_hash_stable`
passes unchanged. If your "stabilizer" moves the golden hash, it is reshaping
combat — that's the quantize hack, not the exact fix. Use the golden hash as the
oracle: *does this change touch a fight, or only idle men?*

## Measure the signal BEFORE you add or tune a lever

A lever (a per-class knob, a sensitivity multiplier, a new term) is only a
multiplier on some underlying signal. **Before you build it or spend a session
tuning it, measure that signal in the exact conditions you want it to
discriminate.** If the signal doesn't differ across those conditions — or is
already floored/saturated at the baseline — the lever is *inert*, and no value
of it will work. The lever's dynamic range is bounded by the signal's. Three
checks, all answerable with a throwaway probe over `BalanceConfig` +
`run_over_seeds`:

1. **Does the signal actually differ across the conditions you mean to split?**
   Print it (e.g. mean over the front rank) in condition A vs B. Same number →
   dead lever.
2. **Is there headroom at the baseline?** A choke that already saturates (or a
   term already ~0) leaves nothing for a multiplier to move.
3. **Are you keying on the right component?** Total vs the directional vs the
   cancelling part of a vector signal are different things.

Field example (long-sword offense/defense). The goal was a unit *strong
attacking, weak defending* via a "pressure sensitivity" knob — physically
reasonable: a great sword can't sweep when pressed. Measuring the candidate
signals first, before tuning, killed it in minutes instead of hours:
- The `vice` (`pressure − |net push|`) is ~0 in a frontal clash — it only
  spikes when *wedged between opposing masses* (surrounded). A lever on vice was
  inert in any head-on duel. (Right instinct — "loses when pressed" — wrong
  signal: vice measures *surround*, not *contact*.)
- Total received pressure (`self.pressure[i]`) was **identical** attacking vs
  defending: charge-offense 0.39, fence-offense 0.39, held-defense 0.36. The
  `Fence` stance doesn't actually hold a unit at weapon's length, so there is no
  offense/defense pressure *differential* for **any** pressure lever to exploit.

Conclusion the measurement forced: the knob couldn't work until a deeper
mechanic (Fence enforcing a standoff that bleeds less contact pressure) creates
the differential. Measuring turned "add a sensitivity stat and tune it" into
"the premise doesn't hold yet — here's the prerequisite," and avoided committing
an inert lever. Don't add the lever, *then* discover it does nothing; measure
the signal, *then* decide if the lever can exist.

## Method: instrument the trajectory, don't theorize

Battle outcomes are integrals over a chaotic process; reasoning about them from
the formulas is how you talk yourself into a wrong cause (twice). **Print the
per-tick trajectory and read the mechanism off it.** Throwaway `examples/` are
the tool — `cargo run -p sim --example <name>` against the public API
(`spawn_class`, `set_attack_order`, `setup_duel`, …):

- Trample stalling? Print, per half-second: attacker centroid, `mass_advance`,
  engaged counts, defender dead. You'll SEE whether the horse rode through (cav-Y
  climbs past the line) or stalled at contact (cav-Y pins, `mass_advance` craters)
  — the difference between "rides over" and "bogs down", which no kill count
  alone tells you.
- Duel flipped? Print the gap, ammo, both strengths, morale each second. That's
  how we learned a head-on HorseArchers-vs-Phalanx isn't kiting at all — the
  horse closes to melee, and the quiver (168 s of arrows) never empties before
  the 78 s decision, so "outlasts the quiver" never even fires.
- Morale death-spiral? Print morale, fear_adapt, and at-ease ticks per lap to see
  if it asymptotes (habituation working) or marches to a break (a real leak).

Delete the example when done (don't commit throwaways). The trajectory is the
ground truth; the formula is just your hypothesis about it. This is the same
spirit as "watch it in the renderer" — observe the actual behavior over time,
numerically or visually, before you trust any model of it.

## ALWAYS screenshot the scenario and eyeball the geometry

Numbers hide geometric facts. Before trusting a measurement of a scenario,
**render it and look** — the picture catches setup bugs the numbers can't.
Field case: a "long sword surrounded" measurement looked decisive (kills ~0),
but the screenshot showed the long swords deployed as a 40-wide *thin line*
with the "surrounding" units merely flanking its ends — not an envelopment at
all. Re-running with the block deepened to a ~13×13 square ringed on four sides
was a *different* (correct) scenario. Had I trusted the numbers, I'd have drawn
the wrong conclusion about what "surrounded" does.

- Spin a scenario up as a sandbox (`setup_sandbox` kind + a `?battle=<name>`
  URL) and drive it with the `__game` hooks (`attackOrder`, `advance`,
  `freeze`) via Playwright; screenshot deploy AND a few seconds in.
- **Look at it yourself** (open the PNG), the way the `screenshot-regression`
  skill demands for any visual claim — confirm the geometry is what you think
  you measured.
- **Keep the shots.** A scenario sandbox + its committed screenshots double as
  a **visual-regression baseline** (`web/shots/`): the same picture that gut-
  checks the physics today catches the day a change quietly reshapes it. The
  `?battle=surround` sandbox + `shots/surround-{deploy,mobbed}.png` are exactly
  this — a vibe-check bench and a regression pin in one.

## Fragile metrics flip on any breeze

Several red tests are not behavior bugs at all — they measure a real mechanism
through a noisy proxy, and the fidget (or a seed) tips them:

- **Mean over mostly-untouched bodies**: `cavalry_mass_shoves` averaged
  displacement over 360 men while 120 plowed a narrow corridor through them — the
  idle drift of the untouched majority *is* the signal floor. Measure the men in
  the path (peak / corridor / percentile), not the mean over everyone.
- **Tiny integer counts**: `attack_from_behind` summed 3-4 kills in a 10 s
  window over 5 seeds — counting to 4 flips on anything. Measure hits/damage
  landed (the actual claim: rear blows aren't blocked), a large smooth number.
- **Knife-edge ratios / break times**: average over seeds and assert the central
  tendency with a band that reflects the real scatter, or measure a less
  borderline scenario. See [write-tests](../write-tests/SKILL.md) "Measure the
  mechanism, not the noise".

The mechanism is fine; the measurement isn't. Fixing the measurement is
legitimate — you're not changing the claim, you're reading it where the signal
is strong. (This is distinct from gaming a test: you're making the test measure
its OWN stated claim better, not weakening the claim to fit the code.)
