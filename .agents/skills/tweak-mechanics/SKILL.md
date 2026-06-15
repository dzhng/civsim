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

### NO IMAGINARY WALLS

A soldier is stopped only by **real bodies** (collision) and pulled only by
**real forces** (his weave springs, the enemy magnet, terrain). Never by a
positional clamp that says "you may not stand past this line." A "hold at
weapon reach" clamp, a "don't pass your rank-neighbour" dress line, a
"don't cross the foe's centroid" restoring force — all imaginary walls. They
each looked like they fixed something (ghost-through, blob, swirl) and each
quietly broke an emergent behaviour somewhere else (othismos push, the wrap,
fights that resolve). If you find yourself clamping a position to enforce a
*rule*, stop: the right stop is a *body* the man can't walk through, and the
right "he holds at reach" is that a phalanx with enough spear DENSITY
physically pushes him back by striking — not a wall the engine draws.

### The weave is a mass-spring lattice (the model to build toward)

Each soldier is a node tied to its ≤4 neighbours (3 on an edge, 2 at a
corner) by springs that resist **stretch and compression**, with angular
stiffness at the node that resists **shear/pivot** (the grid wants to stay
square). With no other force a bent lattice springs straight; under force it
**bends and compresses** and then recovers. The only external pulls are the
**enemy magnet** (a soldier in reach of an enemy block is drawn to it —
strongest at the node nearest the block, the attraction radiating outward one
soldier at a time so the line WRAPS) and **collision**. Everything we kept
bolting on — formation-keeping, draping round an obstacle, the offensive
wrap, othismos (= the lattice compressing because the rear ranks push) —
must FALL OUT of this, not be a separate rule. A soldier always moves toward
the enemy attacking him; the weave tension (not a rank gate or a wall) is
what keeps that from dissolving the formation — there is a magnet-like
tension between where the front man wants to go and how far his springs let
him stray. Othismos is mass-driven (rear weight compressing the springs), so
NEVER model it by counting ranks — that ignores soldier mass.

### One physical quantity → one canonical measurement

When two pieces of code ask the *same physical question* ("how near is the
nearest enemy steel?"), they must measure it the **same way** and key off
the **same number**. If they don't, they will silently disagree and drift
apart as the code evolves. Hunt for this — it's the highest-value
simplification in this codebase.

The tell: several thresholds that all mean "the enemy is close" but use
different formulas and different constants. We had **three** answers to one
question:

- `mark_at_ease` — 60 m, edge-to-edge (subtract **both** units' bounding
  radii), off the live `centroid`. The *correct* one.
- `threat_bearing` (face/strafe trigger) — 45 m, subtracting only the
  *enemy's* extent, off the anchor-derived `center()`. An under-measuring
  centroid proxy.
- `threat_unit` (pursue latch) — a 90 m scan **cap**.

Collapsing all three onto the `mark_at_ease` formula was pure win:

1. **It's semantically meaningful, not just dedup.** "Not at ease" now means
   exactly one thing: won't regen morale **and** turns to face the enemy.
   Those two facts can no longer disagree — a unit calmly recovering morale
   while also strafing to face a foe is now impossible by construction.
2. **The shared measurement was the more-correct one.** Edge-to-edge with
   both radii respects unit extent: a 200-wide line is threatened when its
   *flank* is neared, a deep block when its *front rank* is in reach — not
   when some centroid crosses a ring. Centroid-distance is almost always the
   wrong physical fact when units have size; prefer edge gap.
3. **A "cap" is not a threshold.** The 90 m was never a behavior boundary —
   its only consumer (the latch) self-gates on `run_sp * 5` (~17–25 m), far
   inside it. A magic number that no consumer actually depends on is dead
   scaffolding; delete it, don't tune it.

Pattern to look for next time: (a) the same "is X near / engaged / done"
question answered by different constants in different files; (b)
centroid-distance standing in for edge-distance between sized bodies; (c) a
cap/clamp whose real consumer already bounds itself tighter. Each is a
chance to route everything through the one true measure.

### A contact line that fails needs a RESTORING force, not damping

When two equal lines pass through each other, or swirl/orbit, the deep cause
is almost always that **the contact line is an unstable equilibrium with no
restoring force**. Any tiny asymmetry → one side edges ahead → the geometry
rewards it → it runs away (pass-through or wheel). Symptoms you'll chase in
circles if you don't see this:

- Every single-parameter damping you try is **seed-fragile** — works on one
  seed, ghosts on the next, non-monotonic in the knob. That fragility *is*
  the tell: you're damping an unstable equilibrium instead of stabilizing it.
- The "stop" you do have works **by accident** — e.g. an attack halts only
  because interpenetration jitter trips the *pivot* (a wheeling rule), not
  because anything physical blocked it. A move (steady far target) never trips
  it and walks clean through. If a behavior only works through an unrelated
  mechanism's side effect, it's a crutch; make the honest mechanism carry it.
- Forcing `frame_speed = 0` on **both** sides still lets them cross — proof
  the creep is **soldier-level** (the combat-seek), not the frame. When a
  frame-level fix is fragile, instrument to confirm which layer actually drives
  the motion before fixing the wrong one.

The fix is a **symmetric restoring force**: a man cannot advance past the
*line of the foe he is fighting* (enemy-anchored, along the unit facing). Both
sides clamp to the **same mutual line**, so the contact line becomes a *stable*
fixed point — push past and you're pulled back; when the foe yields the line
recedes and you follow, so winning still advances. Crucially this is
**enemy-anchored**, which is the only reference that distinguishes a *legal
bend* (men keep neighbour spacing — allowed) from an *illegal breakthrough*
(men keep neighbour spacing AND cross the line — forbidden). Neighbour-relative
cohesion (weave/dressing) **cannot** tell those apart; don't try to fix a
pass-through with cohesion alone.

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
