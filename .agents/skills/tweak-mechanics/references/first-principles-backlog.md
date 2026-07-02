# First-principles backlog (sim) — shortcuts to retire

The concrete worklist behind "[First principles: forces and bodies, never
walls](../SKILL.md)". Each entry is a place where a behavior is enforced by a
rule/clamp/flag/magic constant instead of emerging from real forces + bodies (the
project's stated contract). Each is a foundation change that will regress and
require re-deriving downstream pins — do them one at a time, foundation-up, with
David. Ranked by how clearly each violates "no walls, no role-gates, emergent
geometry."

> Living backlog (migrated here from `crates/sim/FIRST_PRINCIPLES_AUDIT.md`). The
> line numbers DRIFT — treat them as a starting grep, not gospel; confirm at the
> call site before acting.

## Tier 1 — clearest shortcuts (each names its own purpose: "closes a hole")
1. **Infantry forward-corridor clamp** — `sim.rs:~1595-1620` + cap `sim.rs:~1977-1992`.
   Inside an enemy unit's lateral corridor, past its centre line, it ZEROES the
   forward slot-pull + magnet and CAPS forward speed to ~0.15-0.2·base. A positional
   wall ("don't cross the enemy's centre plane faster than a creep") enforced by
   killing forces. Comment: "closes the infantry 'trample' hole." The weave /
   weapon-repel / body-wall forces should close it; this is a parallel hand-gate.
2. **`gang_cap`** — `combat.rs:~119-140`, `:~521-525`, `tunables gang_cap: 3`. The
   (cap+1)th attacker is denied his WOUND by an integer rank counter, though
   reach/arc/obstruction are already modelled geometrically right below. Magic
   balance constant + symptom fix ("stops a thinning line ground 3:1"). The
   "still SHOVES but can't WOUND" split is the tell — real obstruction denies the
   swing, not just the damage.
3. **"Is the unit grinding/locked?" measured 4 ways** — `movement.rs:~199-201`
   (engaged·12>alive OR engaged>=files_eff), `sim.rs:~2246` (engaged_frac>0.08),
   `sim.rs:~1264`/`~2210` (0.06), `sim.rs:~2368+` fighting_frac>0.1. One physical
   question, four constants. The movement one needed a bolted-on narrow-column
   clause — sign the threshold does work geometry should. Unify to one predicate.

## Tier 2 — real but more defensible
4. **Limit cycles damped, not killed** — `sim.rs:~2092-2102` (`idle_settle_damp`,
   damps only the reversing velocity component) and `sim.rs:~2056-2070` (pike
   `strict_formation` lateral friction, same + a role gate). The steer-pass vs
   separation-solver limit cycle is the real bug; these suppress the symptom.
   (Same family as the facing jitter we DID fix at root.)
5. **Hardcoded `0.65` lean slot-pull** — `sim.rs:~1901-1906`, behind a 4-way
   role/state gate (holding ∧ engaged ∧ !mounted-foe ∧ broad-press). A non-tunable
   magic value patching the opening exchange; should fall out of geometry.
6. **Frame leash** — `sim.rs:~2378-2396`. The unit "frame" (a non-physical entity)
   is corrected toward the men by rule; `losing_push` is EMA'd off it for morale.
   Honest as a measurement but the one place a unit-level position is held by law.
7. **IMPALE magic coefficients** — `combat.rs:~427,476,488`: `planted²·hedge·8.0`,
   `(reach-1)/2.2`, bleed `.min(0.45)`/`.min(0.85)`. Downstream of real quantities
   but the bare literals + the `.min()` caps (formula-misbehaviour guards) say it
   isn't quite physical. Move to tunables at least; ideally derive.
   - **Confirmed cliff (2026-06-29):** the quadratic `(reach-1)/2.2` makes the
     light-spear-vs-cav verdict FLIP across one reach step (1.6 → cav wins 88%;
     1.7 → spear wins 75%). We placed light spear at 1.5 to sit safely below the
     cliff, but the cliff itself is the shortcut — a smooth impale law wouldn't
     have a knife-edge there. Sweep reach over the seed set before trusting a value.
   - **Non-monotonicity exposed at reach 1.5 (2026-06-29):** a FRESH HeavySword
     charging (Run) a held LightSpear at reach 1.5 kills FEWER spearmen than a
     FATIGUED one (seed-summed 46 vs 59) — fatigue "helps" the attacker because a
     fresh charge runs onto the points while a spent one creeps in. At reach 1.6
     the order is normal (61 vs 34). That a 0.1 reach step flips a fatigue
     monotonicity is the same impale/corridor knife-edge (likely entangled with
     finding #1, the forward-corridor speed cap). The `fatigue_saps_melee_power`
     test was rebuilt onto a non-impaling defender to dodge the confound; the
     underlying cliff is still here.

## Confirmed NOT shortcuts (the good versions)
Facing deadzone + sticky target + EMA pressure (the jitter fix), Jacobi staging
(M-equivariance), `m_eff_dir` directional brace (keys off stable unit facing +
geometry), `nearest_enemy`/`mark_at_ease` shared edge-distance snapshot (the
canonical "is the enemy near" — counter-example to finding #3).


## Paid down (2026-07-03, melee-blob)

- **The pivot spring's torque leak** — the weave's pivot spring pumped net
  angular momentum into its own unit (internal forces must sum to zero
  torque). Fixed by per-unit projection of the net-rotation mode
  (sim.rs steer_soldiers, melee-blob slice 05). The visual melee pinwheel,
  the ~3 deg/s internal circulation loop, and the pike mid-line void were
  all its downstream symptoms. Debt note: the projection pre-pass duplicates
  the pivot-bond math — fold the two passes together on the next
  steer_soldiers touch.

## Successor item (cross-feature)

- **Vibe camera re-frame + full re-bless** — the photoreal renderer landed
  concurrently with melee-blob; every committed vibe baseline is stale for
  renderer reasons and the new default camera frames duels too small to
  judge. Re-frame the vibe capture camera (fight-centered, closer zoom),
  then re-bless all vibe scenarios per screenshot-regression, reading every
  frame. The melee-blob physics is verified by cargo rails + spot films
  (specs/done/melee-blob assets) in the meantime.
