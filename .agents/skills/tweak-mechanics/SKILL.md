---
name: tweak-mechanics
description: How to change the SIM PHYSICS (how soldiers move, collide, press, hold a line, rout) — the first-principles workflow and the kind of tests that pin it. Distinct from balancing units. Use when David says a behavior looks wrong ("heavy v heavy isn't clean", "the latch points the wrong way", "they swirl/pass through each other"), or asks to simplify/question a mechanic.
---

# Tweaking a mechanic (the physics, not the balance)

A **mechanics** change alters *how the world works* — how bodies move,
collide, press, hold formation, face, rout. A **balance** change alters
*how a unit is priced* (its stat block) so it slots into the economy; that
is the `balance-unit` skill. They use different tests and a different
mindset. Never judge a mechanics change by who won — balance can flip the
winner tomorrow and the physics must still be right.

## First principles, always

Nature gets complex emergent behavior from simple rules. So should we.
Before adding anything, ask **"what is the ONE physical fact here, and does
the behavior already fall out of it?"**

- A soldier **can't walk through an enemy body** → he stops at contact.
- The anchor is **leashed to the men** → if the men stop, the frame can't
  run ahead. Two lines therefore halt at contact *for free* — you do not
  need a "braking" rule. (We tried one. It was a band-aid and it stalled
  the attack. The leash + collision already give the same effect.)
- Two locked units enforcing the same anti-parallel heading **can't swirl**
  — a swirl is a feedback loop (each pivots toward the other's moving
  centroid); kill the loop, don't damp it.

Prefer deleting a special-case to adding one. If a tweak needs a new flag,
a clamp, a magic threshold — suspect it's papering over a rule that's
already wrong upstream. Question every existing knob too: "is this still
needed now that X exists?" Then **prove the answer with a test or a shot**,
not an argument.

### When rebuilding a foundation, IGNORE the old scenario tests

If you're replacing a core mechanic from first principles, the existing
scenario/balance/combat tests encode the OLD behaviour — they are a map of the
local maximum you're trying to escape. Chasing them green during the rebuild
steers you straight back into it (this is how a string of "fixes" each broke
something else: every one was optimising for the old tests). Instead: write
the FEW new tests that capture the foundation's true behaviour in isolation,
make THOSE perfect, and only then go fix the downstream scenarios — expecting
that a lot of the old supporting logic will get changed or deleted to fit the
better foundation. A correct foundation makes the rest fall out; a foundation
bent to satisfy old tests makes nothing fall out. Net code should go DOWN when
a unifying mechanic lands (a real foundation absorbs special-cases), so if a
rebuild is adding complexity, you're probably not at the foundation yet.

### A HIGHER failing-test count can be progress — judge the foundation, not the scoreboard

Do not optimize for the green number. When a change makes the engine more
**architecturally sound** — more correct from first principles — it is FINE, and
often expected, for the failing-test count to go *up* in the same step. Many of
this suite's balance/scenario pins were calibrated to the old (subtly wrong)
behavior; a foundation fix moves the physics out from under them, and they go red
because they were encoding the bug, not because the fix is wrong. Build
**foundation-up**: get the mechanic right, accept the brittle pins fall, then
re-derive those pins (with David) against the corrected physics. Reverting a sound
foundation to keep brittle tests green is backwards — it re-installs the bug.

The discriminator is the SAME as everywhere else in this skill: separate the
**invariant** from the **outcome**. A foundation fix may freely break outcome pins
(win-rates, survivor spreads, "X usually beats Y"); it must NOT break a physics
**invariant** (centroids don't cross, no blob, charge can't plow an immortal deep
block). So when the count jumps, read WHICH tests fell: a pile of outcome/balance
reds + the mechanical invariants still green = progress; a mechanical invariant red
= stop, you broke physics. Always commit the foundation with a note saying which
pins it deliberately regresses and why, so the red is legible as intent, not drift.

**Worked instance — M-equivariant contact passes (the directional bias).** A
head-on clash of identical units is symmetric under the 180° mirror, yet the engine
resolved each tick's contact in soldier-INDEX order, in place — so the lower-indexed
team killed/stunned/shoved its foe before that foe acted the same tick, a systematic
first-mover bias (see `specs/directional-bias.md`). The fix (stage strikes and apply
them together — "Jacobi"; read `prev_positions` snapshots, not live in-place
positions) is unambiguously more correct, and it made an even clash fair at small
scale. It also **deliberately regressed ~9 charge/bracing/standoff balance pins**
that were tuned to the old in-place shove timing. That regression is the fix working,
not breaking — those pins get re-derived to the corrected physics, not used as a
reason to revert. (The decision to keep it was David's explicit call: sound sim
first, brittle tests after.)

### Forces, not walls; emergence, not special-cases

A soldier moves because **real forces** act on him (his neighbours, the
enemies near him, the ground) and stops because of **real bodies** he can't
walk through. He is never moved or held by a positional clamp that exists to
enforce a *rule* — "you may not stand past this line", "don't pass your
rank-neighbour", "hold at exactly weapon reach". Those imaginary walls each
look like they fix one thing and quietly break an emergent behaviour
elsewhere; reach for one and the rule you actually want is almost always a
*force* that produces it as a side effect.

The same way, don't special-case a role (the "front rank", the "flank file")
with a flag or a gate. If the rule is right, the geometry already singles
those soldiers out — the man nearest the enemy feels the strongest pull, the
man with neighbours on three sides can't lunge. Let position and the force law
decide who does what; a gate that names a role is a smell that the underlying
force is missing or wrong. Collective effects (a deep mass shoving a thin one
back) must come from the **measured physics** that scales with mass, never
from a proxy like counting ranks.

### One physical quantity → one canonical measurement

When two pieces of code ask the *same physical question* ("is the enemy
close?"), they must measure it the **same way** and key off the **same
number**. Different formulas for one question silently disagree and drift apart
as the code evolves — and the disagreement IS a bug (a unit can be "at ease"
for morale yet "threatened" for facing at once). Collapsing them onto one
measure is both a simplification and a correctness fix: the shared meaning can
no longer self-contradict.

Look for: the same "is X near / engaged / done" answered by different constants
in different files; centroid-distance standing in for edge-distance between
*sized* bodies (almost always wrong — a wide line is threatened at its flank, a
deep block at its front rank); a cap/clamp whose only consumer already bounds
itself tighter (dead scaffolding — delete, don't tune). Route everything
through the one true measure.

### A pass-through / swirl is a missing FORCE, never a missing wall

When two lines pass through each other, or swirl/orbit, the deep cause is that
the force which should hold a man off his foe is **absent, too weak, or one-
sided** — so something else (a rear-rank shove, the combat-seek) wins and drives
him through. Diagnostic tells that you're looking at a force problem:

- Every single-parameter *damping* you try is **seed-fragile** — works on one
  seed, ghosts on the next. Damping doesn't stabilize an equilibrium that has no
  restoring force; it just slows the runaway.
- The "stop" you do have works **by accident** — through some unrelated
  mechanism's side effect (a wheel rule tripping on jitter, say). A crutch.
- Two layers can drive the same motion; **instrument to find which one** before
  fixing the wrong layer (e.g. zeroing the frame still lets men cross → the
  drive is soldier-level, not the frame).

The fix is a **real, two-way force**, never a positional clamp. A clamp (snap a
man to a line, a "wall" he can't cross) *overrides* physics instead of letting
behavior emerge from it — it papers over the missing force and silently breaks
the emergent things that force would have produced. Instead, find the force that
*should* keep them apart and make it honest:

- **Two-way.** The repulsion that holds a man off his foe must also PUSH the
  foe — Newton's third law. A force that moves only its own bearer can't hold a
  line against the enemy's advance.
- **Strong enough, but soft.** Strong enough that the equilibrium is stable
  (the rear ranks can't shove the front through), yet soft enough that a better-
  *backed* enemy can overpower it and close — a contest of forces decides the
  distance, which a wall forbids. (A pike keeps a sword line at bay by *pushing*,
  and a deep, well-backed line can still press in.)
- **In the right medium.** A soft steering nudge loses to a hard position
  correction (collision). If the holding force lives in the weak layer and the
  thing overpowering it lives in the strong one, move the force, don't clamp the
  position.

The foundational example of this done right is the **weave** itself: contact,
depth, and the line all emerge from springs and bodies — real forces — with no
"hold here" walls. When you reach for a clamp, you've stopped looking for the
force.

### Crutches are debts — keep a ledger, pay them down

A **crutch** is a non-physical patch that compensates for the kinematic
abstraction instead of being a real force or a real constraint. The sim is a
*hybrid*: ballistic motion (carried momentum `mom_*`, charges, knockback) is
honest dynamics — `p = m·v`, drained through collisions by `trample_bleed` — but
a soldier's *propulsion* is **kinematic**: his velocity is his capped intent,
re-asserted every tick. A velocity-controlled agent does **not** decelerate when
it pushes on a body the way a real mass would, so anything that fakes that
deceleration is a crutch.

The honest load-bearers — what work *should* route through — are exactly two:
1. **Geometric non-overlap constraints** (bodies can't interpenetrate; the energy
   is incompressibility, not a stored spring).
2. **Forces/returns sourced from measured motion** — magnitude drawn from a real
   `kin_*` velocity or `mom_*` momentum some body actually paid for ("men, mass,
   measured motion"). An impale that returns the charger's own momentum is honest;
   a `tunable × penetration` spring or a `tunable × hit` shove is not.

Known crutches in the tree (name them as such in comments; don't let them hide):
- **`counter_press` / ram-drag** (movement.rs) — a unit-mean measured pressure
  fed back as a *pace reduction*. Exists only because kinematic propulsion won't
  slow on contact; a fully dynamic model wouldn't need it. ram-drag (the v² brake)
  is the more defensible half; the `counter_press` *signal* (diluted unit-mean) is
  the replaceable part.
- **`weapon_repel` penetration spring** and **`hit_push` mass-ratio shove** — the
  two cross-line forces whose magnitude is a tunable, not a measured momentum.

The goal is **as few crutches as possible.** Each is a debt: it makes the system
harder to reason about and silently co-tunes with everything around it. Before
keeping one, run the experiment that tries to delete it — **turn the crutch off,
strengthen the honest channel, measure the invariant** (charge penetration depth,
the hold). Keep it only if measurement proves an irreplaceable gap, and when you
do, **say in a comment that it is a crutch and what gap forces it to stay** (e.g.
the position-push saturates at `separation_max_push`, so the collective weight has
no uncapped honest channel — fix *that*, don't add a second patch). It is fine to
still need a crutch; it is not fine to forget it is one.

### Move == Attack is the litmus for first-principled-ness

An attack latch is just a move order to a point past the foe (plus charge +
give-up). So **two units attacking each other must behave the same as two
units moving onto each other's start** — same cohesion, same interpenetration,
no centroid swap. If they diverge, some code path is gated on
`OrderMode::Move` vs `OrderMode::Attack` when it should key off the physical
situation. Real example from this work: the contact-facing **intent vote**
(what keeps a unit pointed at its goal) only fired for `Move`, so the move held
its heading head-on while the attack wheeled. Grep for `OrderMode::` gates when
move and attack diverge.

### Measure the mechanism, not just the outcome — facing catches swirl early

A swirl is two lines **wheeling** around each other. The centroid-swap check
catches it, but late (after they've already turned ~45°+). The *early,
direct* signal is **facing**: a head-on clash must keep both fronts pointed
±y. Track the max off-axis facing angle (`asin(|cos(facing)|)` in degrees) and
assert it stays within a few degrees. `face_dev = 90°` means the lines turned
fully sideways — an unmistakable swirl readout that fires before the centroids
even cross.

### A metric can encode the WRONG thing — verify it against the picture, and measure in the formation's OWN frame

A red test has two possible causes, and they look identical from the number: the
*sim* is wrong, or the *detector* is wrong. **Before chasing a force, render the
vibe shot and LOOK** — the metric is a lens, and a bent lens invents a problem that
isn't there. Worked case: a `depth_ratio` of 0.40 screamed "the block pancaked into
a blob", and I spent a dozen force-tweaks trying to fix a pancake — but the shots
showed the back ranks holding a *perfect grid*; the block was merely **rotating** as
it swirled. Two detector bugs, both classics:

- **Wrong FRAME.** Depth was projected onto the held *facing* (a fixed world axis),
  so a block that rotates reads as shallow — pure rotation masqueraded as collapse.
  **Measure a formation property in the formation's OWN frame** (PCA of the men's
  positions → its major/minor axes), so the number is invariant to rotation/shear.
  A quantity that should be rotation-invariant but is measured against a world axis
  is a latent bug.
- **Wrong WINDOW (transient vs sustained).** It took the `min` over the whole run,
  which caught the **impact transient** — two lines crash, the front compresses for
  ~1 s, then springs back (depth 0.39 → 1.8). A `min`/`max` over a run reports the
  worst *moment*, not the *state*. For "did X collapse and STAY collapsed", skip the
  impact warmup or measure the sustained/late value. (Same trap bit `mud` and
  `long_marches`: the min-cohesion caught a mid-march dip, not the settled fraying.)
- **A half-and-half SPLIT metric lies when the split crosses a quantised band.** A
  `lean()` helper measured shear as (mean-x of the low-y half) − (high-y half). With 5
  ranks × 10 files the median split landed *inside* the centre rank, and the index
  tiebreak sorted that rank's low-x files into one half and its high-x files into the
  other — manufacturing a ~1.0 phantom lean on a **perfectly square** block, so the
  recovery assertion (< 0.4) was unreachable by ANY block and a correctly-squaring
  block read as broken for a dozen tweaks. The block had been fine all along. Fix:
  measure with a **slope/PCA fit** (least-squares dx/dy), not a partition of a
  discrete grid. Whenever men live on ranks/files (a quantised lattice), any "split
  the population in two and compare halves" statistic is fragile — a continuous fit is
  the honest measure. The tell is the same as the others: **the number is wrong even
  on the trivial/rest configuration** — always evaluate a detector on a KNOWN-good
  baseline (an unperturbed block) before trusting it on the failure case.

The tell that your metric — not your physics — is the problem: **it stays invariant
under every force that should move it.** I scaled the repel, the compress, the
slot-grip, an axial cap — six levers — and the blob's interpenetration never budged
off 0.81 while each *regressed* the foundation. A number deaf to every relevant force
is almost never a force imbalance; it's the metric or the dynamics. Stop tuning, go
look.

### The hardest class of bug is an EQUILIBRIUM failure — a spring system does not auto-settle

Forces that *pull toward a target* (a magnet to the foe, glue between locked units,
a slot spring) do NOT guarantee the system reaches a stable **steady state**. Pointed
at an unreachable target — a unit blocked head-on by an enemy it's ordered to walk
*through* — the system keeps chasing forever: it leans, shears, and **swirls, because
rotating is the only way left to "reach" an anchor it can't reach straight on.** Over
a short fight casualties end it before the instability blooms; under an **immortal /
infinite run it has nowhere to hide**, so the immortal long-grind is the *stress test*
for equilibrium, and a slowly-growing swirl/blob/lean is its signature. Crucially,
**these are usually ONE bug, not three** — don't fix swirl, blob, and lean separately;
find the shared "never settles" root. The fix is to make the system actually settle:
the driving force must go to **zero at equilibrium** (a man at his fighting distance
should stop being pulled in, not keep pressing), or the contested degree of freedom
needs damping / a restoring force that kills the runaway. If your "glue + magnet were
supposed to settle it" and they don't, the question is not "which force is too weak"
but "what steady state does this system have, and does any force drive it there."

**Worked instance — damping a frictionless lattice, WITHOUT poisoning combat.** An
idle block, scaled/perturbed, rang forever at 0.073 m/tick: the edge men step out, the
separation solver shoves them back, repeat — a 2-tick limit cycle a *frictionless*
spring re-injects every tick. The fix is dissipation, but naive global velocity drag
**regressed combat -5 to -13 every time** (the same springs move the fighting men;
damping them changed every clash). What worked is two gates that make the damping
**provably invisible to the fight**:
- **Gate on a state combat can never be in.** `at_ease` (no living enemy within
  at_ease_range) is true for an idle formation and FALSE for anything fighting or
  closing to a fight — so damping behind it cannot touch a clash by construction. (Plus
  `move_target.is_none() && engaged==0 && frame_speed<0.5` so it never drags a march or
  a re-form surge.) Find the predicate that is *definitionally* off during the case you
  must not perturb.
- **Damp only the OSCILLATION, not all motion.** Drag only the velocity component that
  *reverses* against last tick's (`v · v_prev < 0`). A limit cycle reverses every tick
  → it dies; a steady motion (a friendly push compressing the block, a settle toward
  rest) doesn't reverse → it's untouched. A flat low-pass instead compressed the
  resting block ~17%; the reversal-gate left its shape intact. **Reversal-gated drag is
  a scalpel; uniform drag is a hammer.**

The same trace showed the OTHER half of the swirl — the combat-side wheel — is the
grind facing-lock *releasing* mid-grind (engaged dips below the lock threshold as a
losing line is driven back → it re-acquires the slid enemy centroid → wheels → repeat
to 90°). A naive latch fixes the swirl but is too sticky (a winner must still wheel to
wrap/pursue); the correct latch holds only a unit that is LOSING the push. Same family:
the runaway is a feedback loop re-armed by a threshold that toggles under noise.

### Don't relax a test to pass — the red is usually telling the truth

When a strict check (centroids never swap on y) goes red after your change,
the strong default is **the check is right and your change is incomplete**.
Relaxing the threshold ("allow a few metres of charge dent") to go green is how
a suite certifies a bug — it did exactly that here: loosening the centroid-swap
tolerance hid a 90° swirl that the shots plainly showed. If you believe a red
check is genuinely too strict, prove it with a shot first, and write the new
threshold around the *physically correct* behavior, not around the current
(broken) number.

### The OTHER red: when a first-principles fix breaks a BALANCE test, the test may be the cheese

The rule above ("don't relax a red") is about *mechanics* tests — those are
physics, keep them strict. The converse case is just as important: when a
principled change breaks a **balance/outcome** test (a win-rate, a survivor
spread, a "X usually beats Y"), do NOT reflexively re-pin it or revert the fix.
A more correct mechanic frequently **exposes a balance test that was only ever
passing because of a cheesy/overtuned mechanic** — the red is the fix doing its
job. Distinguish:

- **Invariant** (physics truth — always holds, keep strict): "centroids never
  cross", "a charge can't plow through an immortal deep block".
- **Outcome** (tuning-dependent — allowed to move): "cav wins 60% of seeds".
  Breaking an invariant is a regression; moving an outcome may mean the outcome
  was wrong.

**Measure the mechanism, never argue from the score.** Before deciding a balance
red is right or wrong, instrument the *cause*: count kill sources, disable one
mechanic and re-run, isolate with **immortal / zero-damage fake units** so no
tuning leaks in. Worked case from this repo: `cavalry_usually_rides_over_heavy_swords`
asserted cav beats deep heavy 100%, but instrumenting showed **71% of the
infantry deaths were charge-impact knockdowns**, and disabling charge-impact
flipped it to cav **0%** — the test had pinned shock-cheese as if it were a
combat fact. A 120-horse line should NOT bulldoze clean through 8 braced ranks;
cavalry earns its keep by repeated shock and on the flank. When you conclude a
test is wrong, **fix or delete it and say why** — don't leave two tests
asserting opposite things ("rides through" vs "bogs down") in the suite.

### Don't abandon a sound mechanic because a test goes red — diagnose the red FIRST

A theoretically-sound change (a missing force you can argue from first principles)
that makes a few tests red is NOT thereby disproven. Reverting it on the red
count alone throws away the fix and keeps the bug. Before discarding, diagnose
EACH red — it is one of three things, and they have different answers:

1. **Tunable** — the mechanic is right but a coefficient is too strong; a weaker
   value keeps the new behavior AND the old test. **Sweep the parameter before
   concluding.** Worked case: a sword **standoff force** (sound — two sword lines
   had no enemy-standoff, so their lattices interleaved into a blob) broke
   `equal_units_feel_equal_pressure` and `melee_kills` at standoff-softness 0.35.
   Nearly reverted it as "net zero." Sweeping the softness down to 0.20 kept the
   blob fixed AND both tests green — the red was a margin, not a refutation.
2. **A fragile/marginal test** — it was passing by a hair and the sound change
   nudged it over. Widen it (with a comment naming it chaos-marginal) — but only
   after you've confirmed by instrumenting that the *mechanism* is still correct.
3. **A real coupling the change EXPOSED** — the change is right and reveals a
   second bug. Worked case: the same standoff broke `attack_latch` (the move==attack
   litmus) — instrumenting showed a MOVE order drives into contact harder than an
   ATTACK (interpen 0.56 vs 0.32), a pre-existing move/attack-drive asymmetry the
   standoff merely surfaced. The fix belongs on THAT asymmetry, not on reverting
   the standoff.

The rule: **it is a deterministic sim — measure why each red is red** (sweep the
knob, print the mechanism, isolate with immortals) before you let a red-count
veto a first-principles fix. Keep less-blob/more-correct physics and chase the
reds you understand; only revert once you've shown the mechanic itself is wrong.

The sharpest tool for an invariant is a **mechanical test with immortal /
zero-damage fake units**: nobody dies, so the only question left is the pure
physics ("can the charge physically shove through?"). It's balance-proof — a
future rebalance can't move it — and it pins the *floor* a balance number must
later sit on. Write that floor as a `mechanics_*` test (mark it `#[ignore]` with
a rationale if the mechanic isn't built yet — an explicit target beats a silent
gap), not as a balance assertion.

## The two-layer loop (do them in order)

### Layer 1 — fast Rust mechanics tests (the gate)

Cheap, deterministic, physics-close. They don't prove it *looks* right;
they prove **nothing is obviously broken**. Write/extend one FIRST so the
target is concrete, then iterate the mechanic until it's green.

Rules for a mechanics test:

1. **Zero stat variability.** Use IDENTICAL units (same class both sides)
   or hand-built fake units. Any asymmetry you didn't introduce on purpose
   is noise that hides the signal. A symmetric setup lets you assert the
   physics *invariants* tightly and deterministically (centroids don't
   cross, no blob, the line holds — one seed, exact threshold). But do NOT
   assert *even-handedness* on a single seed: identical units in one fight
   are EXPECTED to take lopsided losses (the fight is decisive, the loser
   routs and is chased). "No side is systematically favored" is a
   **distribution** property — a win-rate band over a seed set, not a
   single-seed "comparable losses" check. That single-seed check is BLIND:
   it certifies whatever the lucky seed did and *masks* real
   directional/processing-order bias (this session, a single-seed even-
   losses pin hid a 20/20 one-side-always-wins bias for months; the
   distribution rewrite caught it on the first run). **Mechanical = tight +
   deterministic; fairness = distribution.** See `write-tests`.
2. **Never assert wins/losses.** Assert on values close to the physics:
   - **cohesion** (`unit.cohesion`, export `[4]`) — does the line hold its
     shape, or dissolve?
   - **centroid** (`unit.centroid`, export `[32],[33]`) — where is the mass?
     The "do they pass through each other / swirl" test is: spawn one unit
     north and one south, and assert the **north unit's centroid-y stays
     above the south unit's for the whole fight**. A flip is a crisscross
     OR a swirl (orbiting also swaps top/bottom) — one cheap check, both
     bugs. Also watch the closest approach (overlap) and the rout direction
     (a broken unit flees toward its OWN edge, `home_dir_y`).
   - frame_speed, pressure, engaged count, facing — whatever the mechanic
     under test is *about*.
3. **Control the field.** `tun.micro_rough = 0.0` (parade ground) so
   terrain noise doesn't muddy the measurement. Morale OFF (`no_morale()`)
   unless the rout itself is the subject.
4. **Loose, not exact.** Thresholds are sanity rails ("cohesion > 0.8",
   "centroids never cross"), not golden values. The point is to catch a
   regression turning a grind into a blender, not to freeze a number.
5. **Smallest scale that shows it.** Two units for a clash; a few only for
   interaction (envelopment, rout contagion); armies only for integration.

`mechanics_melee.rs` is the worked example: `head_on_clash` spawns two
identical heavy blocks attacking each other, `trace_clash` records min
cohesion / min centroid-gap-y / rout direction, and the tests assert the
lines hold (>0.8), never cross, and rout the right way — never who wins.

### Layer 2 — vibe shots are the real verdict

Green Rust does NOT mean done. **The actual check that a mechanic feels
right is the vibe timeline, and you must look at EVERY frame.** A single
cherry-picked frame lies — a clash can look like a clean contact line at
t=32s and be a swirling blob by t=48s. (This is why we built the Rust
layer: eyeballing one shot said "clean"; the centroid test said "crossed at
t=19.9s". Trust the measurement, then confirm the feel.)

- Regenerate the canonical set: `node vibe/all.mjs` from `web/` with the
  dev server up (and **`npm run build:wasm` first** if you touched Rust —
  the harness loads the prebuilt wasm, not your source).
- Flip through `web/vibe/shots/<scenario>/` t000…t300 for the scenarios
  your change touches. Read the whole timeline: approach → contact →
  grind → break → rout. Look for swirl, pass-through, scatter, a stalled
  attack, a line that dissolves.
- For a quick numeric read while iterating one matchup, `vibe/measure-duel.mjs`
  (cohesion + centroid-cross + rout-direction every 0.5s) is the JS twin of
  the Rust test.

## Test taxonomy (keep it explicit)

| Prefix | What it is | Asserts on | Skill |
|---|---|---|---|
| `mechanics_*.rs` | first-principles physics: how the world works | cohesion, centroids, pressure, facing — NOT wins | this one |
| `balance_*.rs` | performance-vs-price over a seed set | win-rate / survivor spread / the counter-web | `balance-unit` |
| everything else | general: nav, terrain, golden, runner smoke, AI integration, and the older `*_scenarios.rs` emergence tests | varies | `write-tests` |

New physics tests go in `mechanics_*.rs`. The legacy `*_scenarios.rs`
(combat, class, morale, posture…) are emergence tests that mostly belong in
the mechanics bucket — migrate them under the prefix opportunistically when
you touch them; don't mass-rename mid-change.

## Process (inherited, non-negotiable)

- **Cargo first** (`cargo test -p sim --no-fail-fast`, ~25s, check `rc=$?`),
  vibe shots last. NEVER use the browser to decide whether the sim physics
  is correct — that's what the Rust layer is for — but DO use the shots to
  decide whether it *feels* right.
- **Rebuild the wasm** (`npm run build:wasm` from `web/`) after any Rust
  change before any vibe run, or you're filming a stale binary.
- The **golden hash** (`golden.rs`) moves on any sim-value change — re-pin
  it deliberately, once, in the same commit, from the printed actual.
- Expect a few chaos-marginal balance/pacing tests to wobble on a physics
  change. Re-judge on the final shape; widen a margin only with a comment
  saying it's chaos-marginal. **Never re-pin a contract to current
  behavior** to make it pass — that is how a suite certifies a bug.
- Concurrent sessions are real — scope commits to the files you touched,
  never `git checkout`/reset over files that may hold other work. (A stray
  reset to HEAD once silently wiped a session's edits.)
