# Spec: One standoff force per pair — the enemy bond and weapon-repel must not both push a man off his own target

## Goal, in one sentence

When the braced-standoff repair (the `two_braced_walls` / `the_fronts_stay_welded`
work) tunes the "hold at weapon's length" force, make the bearer's own target be
held by exactly ONE force, not two — today both the enemy-bond `comp_push`
(steering) and `weapon_repel` (collision) push a man off the same foe he is
bonded to, a double-count that the next person will otherwise co-tune blind.

This is a SCOPE RIDER on the standoff repair, not a standalone fix: do it WHILE
repairing the standoff, because the standoff is currently broken (it under-holds —
see below), so the double-push cannot be removed and validated in isolation.

## The contracts (all in the same orbit; the standoff repair owns them)

Must end green (currently RED — pre-existing, the standoff under-holds):
- `crates/sim/tests/mechanics_weave.rs::two_braced_walls_hold_a_standoff_neither_centroid_crosses`
  — two 20×10 braced-pike blocks run head-on; the invariant is their centroids
  never cross. Today they pass clean through (panics "centroids crossed").
- `crates/sim/tests/mechanics_weave.rs::the_fronts_stay_welded_a_pusher_drives_not_detaches`
  — a deep column drives a shallow defender BACK but its front man stays welded
  to the defender's front (cannot detach and walk into the gap). The WELD is the
  bond's other job; see "must not change".

Must stay green (the calibration boundary):
- `mechanics_weave.rs::a_braced_block_holds_its_grid_under_a_press` — a braced
  holder keeps its grid under an attacker's press (intermix < 0.35, spread < 2.5).
- `combat_scenarios.rs::pikes_bite_only_to_the_front`, `deep_pike_wall_*`,
  `othismos_presses_fence_fights_at_reach` — the reach standoff and front-vs-rear
  pike geometry.

New pin to WRITE (the thing this rider actually asserts): a 1v1 contact-distance
test — a single braced file vs a single braced file settles front-to-front at
≈ `reach`, and that distance is unchanged whether `weapon_repel` is 15 or 0
(proving the bond owns the target standoff and repel is not co-tuning it).

## Context you don't have (read this; it is the whole reason)

Two distinct forces hold a fighting man off the foe in front of him, and they
overlap on his OWN target:

1. **Enemy-bond `comp_push`** — `sim.rs` ~lines 1453-1481, the
   `if aware_i && fighting[i] == 1 && !trampling` block. For a man's ONE target
   (`target[i]`), if he is inside reach it adds the SAME exponential weave
   push-apart used between friendly neighbours:
   `push = compress_strength * (exp((reach_u - al)/compress_scale) - 1)`,
   rest length = `reach_u` (the unit's weapon reach), summed into `comp_push`
   (sim.rs:1479), which steers the soldier. The block's own comment (sim.rs:1448-
   1452) claims this bond "owns the inside-reach standoff outright" for the target.

2. **`weapon_repel`** — `collision.rs` ~lines 299-399, inside
   `apply_separation()` (collision.rs:21). For EVERY frontal enemy body within the
   reach band and one file-width laterally, it pushes the BEARER back:
   `f = (rdist - fwd) * tun.weapon_repel * DT` (collision.rs:393), posted into the
   `repel[]` position accumulator. `rdist` = `reach` for a braced weapon, else
   body-contact (`body_r[bi] + body_r[bk]`). Its comment (collision.rs:386-392)
   claims it only "seals the lateral GAPS a single-foe bond leaves open" — i.e.
   foes OTHER than the target.

**The defect:** the `weapon_repel` loop scans grid bodies and does NOT skip the
bearer's own `target`. So for a braced pikeman fighting the foe he is bonded to,
BOTH fire on that one pair — the exponential bond push (steering) AND the linear
repel (position). The comment's "other foes only" split is asserted in prose and
not enforced in code. (`apply_separation` destructures `self` at collision.rs:60-82
and currently leaves `target` in the `..`; pulling it in is all that option 1
below needs.)

Measured numbers that frame it: `tun.weapon_repel` default = 15.0
(tunables.rs:151); `compress_strength`/`compress_scale` set the bond's
exponential. `charge_min_speed` = 2.5. The braced sarissa in the tests is
`reach 3.5, braced true, damage 0`.

## What was tried / measured — do not re-discover this

**Measurement (2026-06-16, this session, throwaway test):** in the 20×10 braced
run-in (the `two_braced_walls` geometry), the front-to-front gap was measured
over 80s with `weapon_repel` ON (15.0) vs OFF (0.0):

```
repel ON  front_gap = -84.6m      repel OFF front_gap = -85.6m
```

Both negative and ~identical: the fronts blow clean through ~85m either way, and
turning the entire repel force off changes the outcome by ~1m. **Conclusion:
`weapon_repel` is contributing almost nothing to the braced TARGET standoff
today** — because the standoff is broken (it under-holds; the blocks interpenetrate
before any "hold at reach" equilibrium forms). So the double-push is real in code
but currently MASKED: the system is too weak there, not too strong. This is why
the rider must ride along with the repair — only once the standoff actually holds
can you see (and remove) the double-count without it hiding in the noise.

This is measured fact. Everything in "The design" below is proposed — deviate if
the repair's measurements disagree.

**Measurement (2026-06-18, follow-up probe `tests/dbg_standoff.rs`, throwaway):**
ran the `two_braced_walls` geometry (200-man 20×10 braced-pike blocks, Run, head-on)
and swept `tun.weapon_repel` while measuring the min centroid gap (want > 4 m):

```
repel 15 (default) -> -1.50    repel 25 -> -1.35    repel 30 -> +5.46
repel 35 -> -2.12              repel 45 -> +5.79    repel 60 -> +5.71
```

**The limiter is repel STRENGTH (15 is too weak), but raising it is NON-MONOTONE
and CHAOTIC** — 30 holds, 35 collapses, 45 holds. Cranking `separation_max_push`
(the cap) alone made it WORSE (-2.75 at 4×). This is the positive-feedback BUCKLE
the collision.rs:435-442 comment predicts: once one front slips a hair ahead the
uncapped frontal shove drives the other back harder, and a head-on clash of equal
lines buckles one way — the buckle DIRECTION (hold vs collapse) flips on tiny
asymmetries, so any single `weapon_repel` value that "passes" is brittle (seed-
and value-fragile), not a fix. **Conclusion: the standoff repair is a STABILITY
problem, not a tuning knob.** A real fix must damp the positive feedback (e.g.
make the braced repel resist the foe's INWARD closing velocity, not just his
penetration depth — a damping term kills the buckle — and/or raise the braced cap
ONLY once damped). Do NOT land a bare `weapon_repel` bump; it will pass at one
seed and rout at the next. (Same lesson as the hold-front lean in commit 2b956e5:
a chaotic scalar knob is the wrong tool — use a structural/stable mechanism.)

**Measurement (2026-06-18, FOLLOW-UP — the velocity-damp idea above is FALSIFIED.)**
Implemented exactly the recommended fix: a braced-only repel term resisting the
foe's inward closing speed (`close = (v_bearer − v_foe)·aim`, added to the push,
new tunable `weapon_repel_damp`). Swept damp ∈ {8,16,24,32,48} × 3 seeds:

```
damp= 8  gaps [ 2.5,  1.3,  0.2]      damp=24  gaps [ 5.5, -0.8, -1.2]
damp=16  gaps [ 0.9, -2.2,  0.7]      damp=48  gaps [-1.0,  0.7,  5.8]
```

Still chaotic and seed-fragile — NO value holds across seeds. Velocity damping
does NOT kill the buckle; reverted (kept the combat guards green throughout —
pikes_bite, deep_pike_wall, a_braced_block all stayed ok, so the blast radius of a
braced-only repel term is safely small, but the term doesn't work).

**The real signal: it is not a centroid buckle, it is a FRONT ZIPPER.** In the
failing run the centroid gap sits at ~0.8 m while the MIN FRONT gap is **−17 m** —
the two fronts interpenetrate 17 m deep. The blocks are 0.8 m-spaced and staggered,
so opposing men slot into each other's lateral gaps like a zipper and the repel's
per-column foe-finder MISSES them: `weapon_repel` only pushes the nearest frontal
foe whose lateral offset `|lat| ≤ half_w` (one file spacing, collision.rs:387) —
a man offset half a file by the stagger falls OUTSIDE every enemy's column gate, so
nothing pushes him and he walks straight in. **The fix is almost certainly in the
foe-FINDING, not the force magnitude:** widen/overlap the lateral gate so staggered
fronts can't thread the gaps (or push against ALL frontal foes in the band with a
shared cap, not just the single nearest-in-column). Validate by watching MIN FRONT
gap (not centroid) — it must stay ≳ −1 m. Start there next; do not touch the scalar.

## The design (proposed; ranked)

Pick ONE owner for the target pair, arbitrated by `two_braced_walls` +
`the_fronts_stay_welded` going green together:

1. **`weapon_repel` skips the bearer's own target (preferred).** Add `target` to
   the `apply_separation` destructure (collision.rs:60-82); in the repel inner
   loop, `if target[j] as usize == i { continue }`. The bond (exponential,
   reach-rest, in steering) keeps the target pair; repel keeps its real job —
   sealing the LATERAL gaps to OTHER frontal foes (a man between two enemies can't
   thread through). This is exactly the split the collision.rs:386-392 comment
   already claims; the change makes code match comment. Lowest blast radius: every
   non-target pair is untouched.

2. **Drop the bond's inside-reach `comp_push`, let `weapon_repel` own all frontal
   foes uniformly (incl. the target).** Delete sim.rs:1476-1481 (the inside-reach
   push only) but KEEP the bond's WELD (the `net_target` blend at sim.rs:1463-1464
   — see "must not change"). One standoff mechanism for every foe. Cleaner
   conceptually, but larger blast radius: the target standoff flips from an
   exponential steering force to a linear position force, which will move the
   contact distance and likely the pike-vs-sword balance — re-validate `pikes_bite`
   and `deep_pike_wall_*`.

3. **Leave both, "they're co-tuned" — rejected.** That is the double-count this
   rider exists to delete; "no double forces" is a repo hard rule (README), and
   two springs on one pair makes the standoff impossible to reason about.

Prefer 1 unless the repair finds the exponential bond is the wrong shape for the
braced hold (e.g. it is too soft to stop a deep column at reach), in which case 2
unifies on the repel — decide from the measured hold distance, not taste.

## What must NOT change

- **The enemy bond's WELD** — `bond_to` / the `net_target` half-weight blend at
  sim.rs:1463-1464. That is what keeps a driven front man welded to his foe
  (`the_fronts_stay_welded`); it is a SEEK, separate from the inside-reach push.
  Only the standoff PUSH is in scope, never the weld.
- **The body separation hard wall and friendly `comp_push`** — the plain
  non-overlap solver and the neighbour compression spring are not part of this.
- **Trample** — `weapon_repel` already skips tramplers (collision.rs:324, 365);
  the bond already gates on `!trampling`. A charge rides through; leave it.

## Process requirements (hard-won)

- **Concurrent sessions are real and share the working tree** — this bit us this
  session: a background `git stash` swept up another session's uncommitted
  `balance_harness.rs`. NEVER `git stash`/`git checkout` over the shared tree;
  `git add` your own files by path; check `git status` when something impossible
  happens.
- Cargo first; rebuild wasm before any browser check.
- Do not `eprintln!` in lib hot code to measure — instrument from the test side in
  a throwaway `tests/dbgN.rs`; probes change float codegen.
- The golden state hash (`golden_state_hash_stable`) will move; re-pin
  deliberately, once, in the same commit. (It is ALSO already red on this branch
  for unrelated reasons — confirm your change is the only new mover.)
- Formulas read men, mass, measured motion (README hard rule).

## Acceptance

1. `two_braced_walls_hold_a_standoff_neither_centroid_crosses` and
   `the_fronts_stay_welded_a_pusher_drives_not_detaches` green together;
   `a_braced_block_holds_its_grid_under_a_press`, `pikes_bite_only_to_the_front`,
   `deep_pike_wall_*` stay green; full workspace green; golden re-pinned once.
2. The new 1v1 pin written and green: a single braced file vs a single braced file
   settles at ≈ `reach`, and that distance is invariant to `weapon_repel ∈ {0, 15}`
   — the proof the target pair is owned by exactly one force.
3. The target pair is pushed by ONE force (bond OR repel, per the option chosen);
   the other no longer touches it. Code matches the comments (no "other foes only"
   claim that the loop violates).
4. Postmortem note here: the measured 1v1 hold distance and the `weapon_repel`
   on/off delta on the target pair, before/after, so the next person has the
   operating point. Then delete this file.
