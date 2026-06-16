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

### The weave is STIFF by default — a committed CHARGE is the one carve-out

It is tempting to model weave stiffness as "willingness to hold formation" and
scale it down with *motion* (soft while moving, stiff when set). **That is wrong,
and it was measured wrong** — twice (via `brace_ramp`, then via forward speed
`mass_advance`). The reasons it fails are worth keeping:

- **A grinding press moves slowly but is still WILLING.** Two lines shoving at a
  dead stall jitter at ~1.7 m/s and creep forward a hair — by any motion signal
  they read as "moving → soft," and they **blob**. But they are absolutely trying
  to keep formation. Speed does not separate "wants to hold" from "committed to
  move."
- **Stiff weave does NOT stop the two-attacker blob anyway.** The blob is the
  mutual front-SQUEEZE (both sides push, the fronts have nowhere forward and splay
  sideways) — a collision-geometry problem, not a weave-softness one. Cranking
  stiffness leaves it ~unchanged. A crisp press is what you get when ONE side
  HOLDS (it isn't pushing, so nothing squeezes its front); a braced holder stays
  crisp at constant stiffness.
- **The wrap does NOT need soft weave.** A wide line wraps a column at full
  constant stiffness — the envelopment is the magnet pulling the overhang men
  around, which a stiff lattice still allows.

So the lattice is **stiff for everyone, always** — the default is to hold. The
single genuine exception is a **committed charge (trample)**: it suspends its own
weave so the formation stretches *into* the gallop instead of the springs reeling
the front back and bleeding it (a charging cav otherwise arrives slow and spent).
That is a **discrete** carve-out keyed on the trample state, not a continuous
gradient. When you reach for "soft while X," check first whether X really wants to
abandon formation (a charge does) or merely *moves while still holding* (a press, a
march, a wheel — these keep their shape). Only the former earns the carve-out.

### Conserve energy: every force is a SPRING or a DRAG, never an active push

Audit each force by what it does to the system's energy:

- **Conservative (a spring):** depends only on POSITION and has a rest
  state it restores toward — neighbour cohesion, compression, the pivot/angular
  spring, the slot tether, the enemy magnet (a spring to weapon-reach), bodies
  not overlapping. Stores and returns energy; settles to equilibrium; symmetric
  inputs cancel. **Prefer these.**
- **Dissipative (a drag):** removes energy — the velocity cap, fighting-pace,
  the trample momentum-bleed. Always stabilising. Fine, and necessary.
- **Active (an injected push):** does positive work with no rest state — the
  classic being "shove the FOE back out of my reach". This is a motor: it pumps
  energy into the system, and coupled with its own feedback (push him away → he
  pushes you less) it AMPLIFIES any asymmetry until a symmetric clash buckles
  one way and routs. **These are the bug.** Replace an active push with the
  reactive spring that has the same intent: don't shove the foe off you — recoil
  off the foe (a restoring spring with equilibrium at reach). Both ends recoil,
  it's symmetric, and it settles instead of running away.

The test of an active force: imagine two identical lines meeting dead-on. A
field of springs + drag reaches a stable, even standoff. An active push tips —
if your mechanic makes a mirror-symmetric clash pick a winner, you have an
energy source where you wanted a spring.

Corollary — **a stiff spring needs damping or it rings.** Cranking a
conservative spring's stiffness with no velocity damping makes it overshoot and
oscillate (a settled block buzzes; a press explodes). If you raise stiffness and
a "settles without oscillating" test goes red, the fix is damping (a drag), not
a softer spring.

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

### Don't relax a test to pass — the red is usually telling the truth

When a strict check (centroids never swap on y) goes red after your change,
the strong default is **the check is right and your change is incomplete**.
Relaxing the threshold ("allow a few metres of charge dent") to go green is how
a suite certifies a bug — it did exactly that here: loosening the centroid-swap
tolerance hid a 90° swirl that the shots plainly showed. If you believe a red
check is genuinely too strict, prove it with a shot first, and write the new
threshold around the *physically correct* behavior, not around the current
(broken) number.

### VERIFY THE SCENARIO VISUALLY before you trust (or chase) a test

A test asserts on numbers, but it first **builds a scene** — and the scene can
silently be something other than what you wrote. Spawns get reshaped, paces and
orders interact, "immortal" units still get stunned, a `4-wide × 2-deep` block
becomes `2-wide × 4-deep` because the formation engine never holds a line
thinner than 3 ranks (the `files_eff` casualty cap). If you grind a mechanic
against a test whose scene is wrong, you are tuning physics to defeat a rigged
setup — and every "fix" is noise.

So: **the FIRST time you write or rely on a mechanics test, render its opening
frames as a vibe shot and LOOK.** Confirm the blocks are the width, depth,
facing, spacing, and separation you intended *before* you read the pass/fail or
touch the sim. A whole session was spent fighting a "deep column threads a thin
line" failure that was really a 4-wide column walking around a 2-wide defender
the test had quietly narrowed. One glance at `t000.png` would have caught it.
This is the same lesson as "the red is telling the truth," one level earlier:
make sure the test is even *asking the right question* before you answer it.

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
   is noise that hides the signal. A symmetric setup also lets you assert
   *even-handedness* (identical units must take comparable losses — a
   lopsided result with no stat difference is a mechanical bias, e.g. the
   side whose order lands a tick earlier steamrolling).
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
