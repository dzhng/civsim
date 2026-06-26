---
name: debug
description: Diagnose hard bugs, regressions, and "feels off" behavior. Build a tight red loop before theorizing, hypothesise, instrument the trajectory, fix behind a regression test. For sim work, the judge is realism not a green test — classify regression-vs-fragility and balance-vs-mechanics before touching anything. Use when something is broken/throwing/slow, a test goes red, or battle behavior looks wrong. Pairs with [tweak-mechanics](../tweak-mechanics/SKILL.md) (the physics fix), [write-tests](../write-tests/SKILL.md), and [balance-unit](../balance-unit/SKILL.md).
---

# Debug

A discipline for hard bugs. The spine is a **tight red loop** — a fast,
deterministic signal that goes red on *this* bug. With it, hypotheses and
instrumentation just consume the loop and the cause falls out. Without it,
staring at code is how you talk yourself into the wrong cause.

For this sim, one rule sits above the loop: **the judge is realism, not the
test.** A red test can mean the new behavior is *more* correct. Find the real
cause first; decide what to do about it second.

## 1. Build a tight red loop

This is the skill; everything else is mechanical. Spend disproportionate
effort here — be relentless.

Construct one, roughly in this order of preference:

1. **Failing test** at whatever seam reaches the bug (`cargo test`).
2. **Throwaway `examples/` harness** against the public API
   (`cargo run -p sim --example <name>`; `spawn_class`, `setup_duel`, …) —
   the workhorse for sim behavior.
3. **Sandbox + Playwright**: a `?battle=<name>` sandbox driven by `__game`
   hooks, screenshotting deploy and a few seconds in.
4. **Differential / seed sweep**: same input through old-vs-new or across
   seeds (`run_over_seeds`, `BalanceConfig`), diffing outputs.
5. **Replay / bisection** when the bug appeared between two known states.

**Tighten** the loop like a product: faster (narrow scope, skip init),
sharper (assert the *exact* symptom, not "didn't crash"), deterministic (pin
seed; for flaky bugs raise the reproduction rate until debuggable).

**Done when** you can name one command you have *already run* that goes red
on the user's exact symptom and green when fixed. No red command, no
hypotheses — jumping to a theory before the loop exists is the exact failure
this skill prevents. If you genuinely cannot build a loop, say so and ask for
an artifact or access; do not proceed on vibes.

## 2. Reproduce + minimise

Run the loop, watch it go red, confirm it's the *user's* failure mode (not a
nearby one). Then shrink to the smallest scenario that still goes red — cut
inputs, callers, config one at a time, re-running after each. Done when every
remaining element is load-bearing.

## 3. Hypothesise

Generate **3–5 ranked, falsifiable hypotheses** before testing any — a single
hypothesis anchors you on the first plausible idea. Each states a prediction:
"if X is the cause, disabling Y makes the bug vanish." Show the ranked list to
David before testing; he often re-ranks instantly. Don't block if he's AFK.

**Compare the suspected cause ON vs OFF.** If the loop fails the same way with
the mechanism disabled, that mechanism isn't the cause — proven, not guessed.

## 4. Instrument the trajectory, don't theorize

Battle outcomes are integrals over a chaotic process; reasoning from the
formulas is how you reach a wrong cause. **Print the per-tick trajectory and
read the mechanism off it** — centroid, `mass_advance`, engaged counts, gap,
ammo, morale per half-second. The trajectory is ground truth; the formula is
just your hypothesis about it.

- Each probe maps to one Phase-3 prediction; change one variable at a time.
- Prefer a debugger/REPL or **tagged** logs (`[DBG-a4f2]`, killed by one grep)
  over "log everything and grep". For perf, measure a baseline and bisect —
  logs are the wrong tool.
- **ALWAYS screenshot the scenario and eyeball the geometry.** Numbers hide
  setup bugs (a "surrounded" block that's really a thin line flanked at the
  ends). Open the PNG yourself ([screenshot-regression](../screenshot-regression/SKILL.md));
  keep shots as a `web/shots/` regression pin.

## 5. Fix + regression test

Write the regression test **before** the fix — but only at a *correct seam*,
one that exercises the real bug pattern at its call site. A too-shallow seam
gives false confidence; if none exists, that absence is itself the finding —
note it. Then: turn the minimised repro into a failing test, watch it fail,
apply the fix, watch it pass, re-run the original (un-minimised) loop.

Fixing a **fragile metric** is legitimate, not gaming the test: you make the
test measure its *own* stated claim better (average seeds, measure the men in
the path not the mean over everyone, count damage not 3 kills), never weaken
the claim to fit the code.

## 6. Cleanup + post-mortem

- [ ] Original repro no longer reproduces (re-run the loop).
- [ ] Regression test passes (or the missing seam is documented).
- [ ] All `[DBG-...]` instrumentation removed; throwaway examples deleted.
- [ ] The winning hypothesis is stated in the commit message.

Then ask: what would have prevented this? If the answer is architectural,
flag it *after* the fix is in.

## Classify before you touch anything (sim)

Two questions decide *what file you edit*; a wrong call wastes the effort and
often bakes the bug deeper.

- **Regression, or exposed latent fragility?** A regression means your change
  made a correct behavior worse — fix the change. Exposed fragility means the
  behavior was *always* this brittle and your change knocked it off a lucky
  perch — fix the fragility or the test. **Tell them apart by running across
  seeds:** a value chaotic across seeds that passed at one was passing by
  seed-luck, not a regression.
- **Balance, or mechanics?** Mechanics = the physics/logic is wrong (cliff,
  bad formula, miswired interaction) → fix the sim with
  [tweak-mechanics](../tweak-mechanics/SKILL.md) (`combat.rs`, `collision.rs`,
  `morale.rs`, `sim.rs`). Balance = the mechanism is right but
  the *numbers* are off → fix the class table / `tunables.rs`, never the
  physics. To isolate a mechanism from stats, use a **mirror match** (same
  unit both sides) so the only variable is the mechanic you flip. See
  [write-tests](../write-tests/SKILL.md) "Control your variables".

## Realism is the judge, not the test (sim)

- **Never revert a more-realistic change to pass a test.** Catching yourself
  undoing a better mechanism — or writing a comment that rationalizes it —
  just to go green is the tell. Stop and re-judge the test.
- A red test can be a positive emergent property you just discovered. Gut-
  check: is the new result realistic? historical precedent (Carrhae, pike-vs-
  horse, testudo)? Then keep it and fix the test.
- When the call is a genuine design decision (a balance pillar, an intended
  counter), it's David's — bring him the trajectory and the historical angle.

## A stat increase must never make a unit worse (sim)

If more armour / block / health / damage makes a unit perform *worse*, that's
a **bug** — monotonicity. Do not rationalize it as "emergent realism";
emergence picks *which* unit wins a fair fight, it never excuses more of a good
stat losing. Test by **sweeping the stat** (`BalanceConfig` + `run_over_seeds`)
and asserting the outcome is non-decreasing. A stat-coupled mechanic is the
usual culprit — see the `min_range` cliff in
[references/canonical-cases.md](references/canonical-cases.md).

## Small perturbation, small effect (sim)

A deliberate idle **fidget** (~6 cm deterministic sway) is a permanent litmus
test: if a hair of input swings a combat outcome, the logic has a **cliff** —
a hard threshold a breath of input flips. Hunt and remove the cliff at its
source; never silence or shrink the fidget, and never add a "stabilizer" that
touches the geometry a fight reads (quantizing, stickiness) — that distorts
combat to pass tests. **The golden hash is the oracle of combat-neutrality:**
a faithful fix leaves every engaged/moving unit byte-for-byte identical, so
`golden_state_hash_stable` is unchanged. If your stabilizer moves the hash,
it's reshaping fights. Canonical case: the `reassign_slots` cliff and its two
wrong fixes in [references/canonical-cases.md](references/canonical-cases.md).

## Measure the signal before you add a lever (sim)

A lever (per-class knob, sensitivity multiplier, new term) only multiplies an
underlying signal; its dynamic range is bounded by the signal's. **Before
building or tuning it, measure the signal in the exact conditions you want it
to discriminate** with a throwaway probe. Three checks: (1) does the signal
actually differ across those conditions? (2) is there headroom, or is it
already floored/saturated? (3) are you keying on the right component (total vs
directional vs cancelling part of a vector)? If the signal doesn't move, the
lever is inert and no value of it will work — see the long-sword case in
[references/canonical-cases.md](references/canonical-cases.md).
