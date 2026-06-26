---
name: tweak-mechanics
description: How to change the SIM PHYSICS (how soldiers move, collide, press, hold a line, rout) — the first-principles workflow and the kind of tests that pin it. Distinct from balancing units. Use when David says a behavior looks wrong ("heavy v heavy isn't clean", "the latch points the wrong way", "they swirl/pass through each other"), or asks to simplify/question a mechanic. Pairs with [debug](../debug/SKILL.md) (the diagnosis loop for a red or a "feels off") and [write-tests](../write-tests/SKILL.md).
---

# Tweaking a mechanic (the physics, not the balance)

A **mechanics** change alters *how the world works* — how bodies move, collide,
press, hold formation, face, rout. A **balance** change alters *how a unit is
priced* (its stat block); that is the `balance-unit` skill. Never judge a
mechanics change by who won — balance can flip the winner tomorrow and the
physics must still be right.

## First principles: forces and bodies, never walls

Nature gets complex emergent behavior from simple rules. Before adding anything,
ask **"what is the ONE physical fact here, and does the behavior already fall out
of it?"** A soldier can't walk through an enemy body → he stops at contact. The
anchor is leashed to the men → two lines halt at contact *for free*, no "braking"
rule needed. (We tried one; it was a band-aid that stalled the attack.)

- **A soldier moves by real forces and stops at real bodies** — never by a
  positional clamp that enforces a *rule* ("may not stand past this line", "hold
  at exactly weapon reach"). Those imaginary walls each fix one thing and quietly
  break an emergent behavior elsewhere. The rule you want is almost always a
  *force* that produces it as a side effect. The **weave** is the model: contact,
  depth, and the line all emerge from springs and bodies, no "hold here" walls.
- **Don't special-case a role** (the "front rank", the "flank file") with a flag.
  If the rule is right, the geometry already singles those soldiers out — the man
  nearest the enemy feels the strongest pull; the man boxed on three sides can't
  lunge. Collective effects (a deep mass shoving a thin one) must come from
  **measured physics that scales with mass**, never a proxy like counting ranks.
- **A rule for a degraded state must CHECK that the state is degraded**, not fire
  unconditionally. Worked case: the formation's anti-fray cap (`width ≤ alive/3`,
  "never thinner than 3 ranks") existed to stop a *dying* unit fraying into a
  1-deep string — but it was applied at spawn too, so you could never *deploy* a
  shallow line. Fix: gate it on the unit's deployed depth, so a deep block still
  sheds to 3 then narrows, but a deliberately-shallow line is respected. An
  "anti-X" that fires when X isn't happening is the same smell as a wall.

Prefer **deleting** a special-case to adding one. If a tweak needs a new flag, a
clamp, a magic threshold — suspect it's papering a rule that's already wrong
upstream. Question every existing knob: "is this still needed now that X exists?"
Net code should go DOWN when a real foundation lands (it absorbs special-cases);
if a rebuild is adding complexity, you're not at the foundation yet.

## A true root fix is CONTAINED — that is how you know it's right

The clearest signal of a first-principles fix: it is **remarkably contained**. It
moves *few* tests, and the ones it moves were the **bad** tests — the pins that
were asserting the bug. The golden hash and everything orthogonal stay put.

- Worked: the **formation-depth** fix and the **morale lance-dps** fix (below)
  each moved exactly the 1–2 tests that encoded the wrong behavior; golden was
  untouched (both only affect cavalry and shallow deployments). That containment
  *is* the proof the fix was real.
- **Churn is a smell.** If a change forces you to re-derive a dozen pins, it is
  probably balance tuning or papering, NOT a physics root fix — or it is a genuine
  foundation rebuild (see below), which is a different, deliberate thing. A clean
  root fix and a sweeping foundation rebuild are the two honest shapes; a "fix"
  that quietly nudges many outcomes to green is neither.
- A real fix also **fails the wrong tests on purpose** — a pin that goes red
  because it was certifying a bug is the fix doing its job, not collateral.

## Reading a red: invariant vs outcome

Every red is one of two kinds, and they have opposite defaults:

- **Invariant** — a physics truth that always holds: centroids never cross, no
  blob, no pass-through, a charge can't plow through an immortal deep block, a
  head-on clash keeps both fronts pointed ±y. **Keep these STRICT.** A red here
  means you broke physics — STOP, don't relax the threshold. Relaxing a
  centroid-swap tolerance once hid a 90° swirl the shots plainly showed. If you
  truly believe the check is too strict, prove it with a shot and rewrite the
  threshold around the *physically correct* behavior, not the current broken
  number.
- **Outcome** — tuning-dependent: a win-rate, a survivor spread, "X usually beats
  Y". **Allowed to move.** A red here often means the OLD pass depended on a bug.

**Never paper, never revert on the red-count.** It is a deterministic sim —
diagnose EACH red ([debug](../debug/SKILL.md) is the full loop: build a red
signal, classify regression-vs-fragility, instrument the trajectory). It is
one of:

1. **Tunable** — the mechanic is right, a coefficient is too strong. *Sweep it*
   before concluding "net zero": a sword-standoff force broke two pins at softness
   0.35 and kept everything green at 0.20.
2. **Marginal test** — it passed by a hair and the sound change nudged it over.
   Widen it (comment: chaos-marginal) — but only after instrumenting that the
   *mechanism* is still correct.
3. **Exposed coupling** — the fix surfaced a *second* real bug. Fix THAT, don't
   revert. (A standoff force broke `attack_latch` by exposing a pre-existing
   move-vs-attack drive asymmetry.)
4. **Cheese test** — the pin only ever passed because of the bug you just fixed.
   Fix or delete it and say why; never leave two tests asserting opposite things.
   (`cavalry_usually_rides_over_heavy_swords` pinned shock-cheese: instrumenting
   showed 71% of infantry deaths were charge-impact knockdowns; disabling impact
   flipped cav to 0%. A 120-horse line should NOT bulldoze 8 braced ranks.)

**Foundation rebuilds invert the scoreboard.** When you replace a core mechanic,
the old scenario/balance pins encode the local maximum you're escaping — chasing
them green steers you right back in. Expect the failing count to RISE; that is
fine. Write the FEW new tests that capture the foundation's true behavior in
isolation, make THOSE perfect, then re-derive the downstream pins (with David)
against the corrected physics. Commit with a note on which pins it deliberately
regresses, so the red reads as intent. Reverting a sound foundation to keep
brittle pins green re-installs the bug. (Worked: M-equivariant Jacobi contact
passes; realistic ~90°/s turn rates that make a flanked phalanx HOLD instead of
flailing apart — the old "cav routs a flanked phalanx" pin had certified the
flailing bug.)

## Measure the mechanism, never argue from the score

It is a deterministic sim — instrument the *cause*, don't reason from the
outcome. The sharpest move when a VALUE is wrong: **log its constituent terms,
find which one carries it, then trace that term to its source.**

- Worked (this session, found in minutes): the light routed at ~3% casualties to
  a walking cavalry. Logging the morale drain showed it was **entirely**
  `odds_drain` (the power-share pull) with blood and fear ≈ 0 → `enemy_power` read
  3× too high → the per-man dps used `max(damage/interval)` over all weapons,
  picking the **one-use LANCE** (1.6 dmg) instead of the sabre the cav grinds with
  (0.12). One line — read grind weapons only — restored "charge wins, walk-in
  loses" with no charge gate.
- **Isolate with immortal / zero-damage fake units** so no tuning leaks in: the
  only question left is the pure physics ("can the charge physically shove
  through?"). It is balance-proof and pins the *floor* a balance number must later
  sit on — write that floor as a `mechanics_*` test (`#[ignore]` with a rationale
  if the mechanic isn't built yet).
- The **immortal long-grind is the stress test**: an equilibrium bug has nowhere
  to hide when nobody dies to end the fight early.

## A metric can encode the WRONG thing — go LOOK before chasing a force

A red has two indistinguishable causes: the *sim* is wrong, or the *detector* is.
**Render the vibe shot and look first** — a bent lens invents a problem that isn't
there (a `depth_ratio` screamed "blob" for a dozen tweaks; the shots showed a
perfect grid merely *rotating*). The classic detector bugs:

- **Wrong FRAME.** A rotation-invariant quantity measured against a world axis
  reads collapse when the block merely rotated. Measure in the formation's OWN
  frame (PCA → major/minor axes).
- **Wrong WINDOW (transient vs sustained).** A `min`/`max` over a run reports the
  worst *moment*, not the *state* — it catches the impact transient (front
  compresses ~1s, springs back) or a breathing surge. For "did X collapse and
  STAY", measure the sustained/late/averaged value. (This session: melee
  interpenetration `max` 0.48 was a breathing surge; the sustained average was
  0.26 and cohesion/centroids were fine.)
- **A split-the-population metric on a quantised lattice** (ranks/files)
  manufactures a phantom signal when the median split lands inside a rank. Use a
  continuous slope/PCA fit, not a partition of halves.
- **A one-use event measured as a sustained RATE.** `lance.damage / interval` is
  not a dps — the lance fires once per charge, then the rider draws his sabre.
  Counting it as continuous made a walking horseman read 3× as deadly as it
  fights. A discrete/one-shot thing read as a rate is a metric bug.

The tells that it's the metric, not the physics: **the number is wrong on the
KNOWN-GOOD baseline** (always check a detector on an unperturbed block first), or
it **stays invariant under every force that should move it** (six levers moved and
the blob's 0.81 never budged — deaf to forces means it's the lens or the
dynamics, not a force imbalance). Stop tuning, go look.

## One quantity, one canonical measurement

When two pieces of code ask the same physical question ("is the enemy close?"),
they must measure it the same way and key off the same number. Different formulas
silently disagree and the disagreement IS a bug (a unit "at ease" for morale yet
"threatened" for facing at once). Look for: centroid-distance standing in for
edge-distance between *sized* bodies (a wide line is threatened at its flank, a
deep block at its front rank); a cap whose only consumer already bounds itself
tighter (dead scaffolding — delete, don't tune). Route everything through the one
true measure.

## A pass-through / swirl is a missing FORCE, never a missing wall

When two lines pass through each other or swirl/orbit, the force that should hold
a man off his foe is absent, too weak, or one-sided, so something else (a
rear-rank shove, the combat-seek) drives him through. Tells: every single-knob
*damping* is seed-fragile (damping doesn't stabilize an equilibrium with no
restoring force); the "stop" you have works by accident through some unrelated
mechanism. The fix is a **real, two-way force** (Newton's third law — it must push
the foe too), **strong enough** that the rear ranks can't shove the front through
yet **soft enough** that a better-backed enemy can overpower it and close, and **in
the right medium** (a soft steering nudge loses to a hard collision — put the
holding force in the strong layer). A clamp papers the missing force and silently
breaks what that force would have produced.

## Equilibrium failures: a spring system does not auto-settle

Forces that *pull toward a target* (a magnet to the foe, glue between units, a
slot spring) do NOT guarantee a stable steady state. Pointed at an unreachable
target — a unit ordered to walk *through* an enemy it can't pass — the system
chases forever: it leans, shears, and **swirls, because rotating is the only way
left to "reach" an anchor it can't reach straight on.** Over a short fight,
casualties end it before the instability blooms; the **immortal infinite run** has
nowhere to hide, so a slowly-growing swirl/blob/lean is the signature — and these
are usually **ONE bug, not three** (find the shared "never settles" root, don't
fix each separately). The fix: the driving force must go to **zero at equilibrium**
(a man at his fighting distance stops being pulled in), or the contested DOF needs
damping that kills the runaway *without* poisoning combat. Two scalpels that did
that:

- **Gate the damping on a state combat can never be in.** `at_ease` (no living
  enemy in range) is definitionally off during any clash, so damping behind it
  can't touch a fight by construction.
- **Damp only the OSCILLATION** — the velocity component that *reverses* against
  last tick (`v·v_prev < 0`). A 2-tick limit cycle reverses every tick and dies; a
  steady push or settle doesn't reverse and is untouched. Reversal-gated drag is a
  scalpel; uniform drag is a hammer (it compressed the resting block ~17%).

## Crutches are debts — keep a ledger, pay them down

A **crutch** is a non-physical patch that fakes what the kinematic abstraction
won't do. The sim is hybrid: ballistic motion (`mom_*`, charges, knockback) is
honest `p=m·v` drained by `trample_bleed`; a soldier's *propulsion* is kinematic
(velocity = capped intent, re-asserted each tick), and a velocity-controlled agent
doesn't decelerate when it pushes on a body — so anything faking that deceleration
is a crutch. The honest load-bearers are exactly two: **geometric non-overlap
constraints**, and **forces sourced from measured motion** (magnitude drawn from a
real `kin_*`/`mom_*` some body actually paid for — "men, mass, measured motion").
A `tunable × penetration` spring or `tunable × hit` shove is not honest. Known
crutches (name them in comments so they can't hide): `counter_press`/ram-drag
(movement.rs), the `weapon_repel` penetration spring, the `hit_push` mass-ratio
shove. The goal is **as few as possible** — before keeping one, turn it off,
strengthen the honest channel, and measure the invariant; keep it only if
measurement proves an irreplaceable gap, and say in a comment what gap forces it.

## Move == Attack is the litmus for first-principled-ness

An attack latch is just a move order to a point past the foe (plus charge +
give-up). So **two units attacking each other must behave the same as two units
moving onto each other's start** — same cohesion, same interpenetration, no
centroid swap. If they diverge, some path is gated on `OrderMode::Move` vs
`Attack` when it should key off the physical situation (real case: the
contact-facing intent vote only fired for `Move`, so the attack wheeled while the
move held). Grep for `OrderMode::` gates when move and attack diverge.

## The two-layer loop (in order)

**Layer 1 — fast Rust mechanics tests (the gate).** Cheap, deterministic,
physics-close. Write/extend one FIRST so the target is concrete, then iterate
until green. Rules:

1. **Zero stat variability** — identical units or hand-built fakes; any asymmetry
   you didn't introduce is noise. Assert *invariants* tightly on one seed
   (centroids don't cross, no blob, line holds). But **fairness is a DISTRIBUTION**
   — "no side is systematically favored" is a win-rate band over a seed set, never
   a single-seed "comparable losses" check (that check is blind; a single-seed
   even-losses pin hid a 20/20 one-side-always-wins bias for months).
2. **Never assert wins/losses.** Assert on cohesion, centroid (north unit's
   centroid-y stays above south's = one check catching both crisscross and swirl),
   closest approach, rout direction (`home_dir_y`), frame_speed, pressure, facing
   — whatever the mechanic is *about*.
3. **Control the field** — `tun.micro_rough = 0.0`, morale OFF (`no_morale()`)
   unless the rout is the subject.
4. **Loose, not exact** — thresholds are sanity rails ("cohesion > 0.8"), not
   golden values.
5. **Smallest scale that shows it** — two units for a clash; armies only for
   integration.

**Layer 2 — vibe shots are the real verdict.** Green Rust does not mean done; the
mechanic must *feel* right across the WHOLE timeline (a clash can look clean at
t=32s and be a swirling blob by t=48s — eyeballing one frame said "clean", the
centroid test said "crossed at t=19.9s"). Rebuild wasm first (`npm run build:wasm`
— the harness loads prebuilt wasm), then `node vibe/all.mjs` from `web/`; a
mechanics change turns frames red (the point); re-bless with `UPDATE_SHOTS=1` once
the new behavior is confirmed and commit the baselines as the record. Flip through
`web/shots/baseline/vibe/<scenario>/` t000…t300 for approach → contact → grind →
break → rout; `vibe/measure-duel.mjs` is the JS twin of the Rust test.

## Test taxonomy

`crates/sim/tests/README.md` is the canonical map. Quick routing:

| Prefix | What it is | Asserts on |
|---|---|---|
| `mechanics_*.rs` | first-principles physics | cohesion, centroids, pressure, facing — NOT wins |
| `balance_*.rs` | performance-vs-price over seeds | win-rate / survivor spread (`balance-unit` skill) |
| `*_scenarios.rs` | public-API emergence contracts | player-visible behavior (`write-tests` skill) |

New physics tests go in `mechanics_*.rs`. Legacy `*_scenarios.rs` mostly belong in
the mechanics bucket — migrate opportunistically when you touch them.

## Process (non-negotiable)

- **Cargo first, vibe shots last.** Never use the browser to decide whether the
  physics is *correct* (that's the Rust layer); use shots to decide whether it
  *feels* right.
- **`--no-fail-fast` is mandatory.** Plain `cargo test` stops after the first
  failing binary, so later binaries never run and you get a PARTIAL false green —
  fix the one it showed, the next run reveals another, whack-a-mole forever (this
  shipped a failing `dense_infantry_blunts` to main once). **Trust the exit code**,
  never a grep over piped/backgrounded output.
- **Knife-edge pins.** Several balance pins flip on a sub-percent nudge; threading
  four with one scalar is fitting noise. When a realistic-physics value can't
  satisfy a fragile pin, the pin is the bug — re-derive it (more seeds / a stable
  metric) WITH David, don't keep dialing the knob.
- **Rebuild wasm** after any Rust change before any vibe run, or you're filming a
  stale binary.
- **Golden hash** moves on any sim-value change — re-pin it deliberately, once, in
  the same commit, from the printed actual. (A pure rename or a fix that only
  touches one class won't move it — if it didn't move, that's a good containment
  signal.)
- **Concurrent sessions are real** — scope commits to files you touched, never
  `git checkout`/reset over files that may hold other work.
