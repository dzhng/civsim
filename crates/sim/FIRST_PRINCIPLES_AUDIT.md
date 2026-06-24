# First-principles audit (sim) — shortcuts to retire

Backlog of places where a behavior is enforced by a rule/clamp/flag/magic constant
instead of emerging from real forces + bodies (the project's stated contract). Each
is a foundation change that will regress and require re-deriving downstream pins —
do them one at a time, foundation-up, with David. Ranked by how clearly each
violates "no walls, no role-gates, emergent geometry."

## Tier 1 — clearest shortcuts (each names its own purpose: "closes a hole")
1. **Infantry forward-corridor clamp** — `sim.rs:1595-1620` + cap `sim.rs:1977-1992`.
   Inside an enemy unit's lateral corridor, past its centre line, it ZEROES the
   forward slot-pull + magnet and CAPS forward speed to ~0.15-0.2·base. A positional
   wall ("don't cross the enemy's centre plane faster than a creep") enforced by
   killing forces. Comment: "closes the infantry 'trample' hole." The weave /
   weapon-repel / body-wall forces should close it; this is a parallel hand-gate.
2. **`gang_cap`** — `combat.rs:119-140`, `:521-525`, `tunables gang_cap: 3`. The
   (cap+1)th attacker is denied his WOUND by an integer rank counter, though
   reach/arc/obstruction are already modelled geometrically right below. Magic
   balance constant + symptom fix ("stops a thinning line ground 3:1"). The
   "still SHOVES but can't WOUND" split is the tell — real obstruction denies the
   swing, not just the damage.
3. **"Is the unit grinding/locked?" measured 4 ways** — `movement.rs:199-201`
   (engaged·12>alive OR engaged>=files_eff), `sim.rs:2246` (engaged_frac>0.08),
   `sim.rs:1264`/`2210` (0.06), `sim.rs:2368+` fighting_frac>0.1. One physical
   question, four constants. The movement one needed a bolted-on narrow-column
   clause — sign the threshold does work geometry should. Unify to one predicate.

## Tier 2 — real but more defensible
4. **Limit cycles damped, not killed** — `sim.rs:2092-2102` (`idle_settle_damp`,
   damps only the reversing velocity component) and `sim.rs:2056-2070` (pike
   `strict_formation` lateral friction, same + a role gate). The steer-pass vs
   separation-solver limit cycle is the real bug; these suppress the symptom.
   (Same family as the facing jitter we DID fix at root.)
5. **Hardcoded `0.65` lean slot-pull** — `sim.rs:1901-1906`, behind a 4-way
   role/state gate (holding ∧ engaged ∧ !mounted-foe ∧ broad-press). A non-tunable
   magic value patching the opening exchange; should fall out of geometry.
6. **Frame leash** — `sim.rs:2378-2396`. The unit "frame" (a non-physical entity)
   is corrected toward the men by rule; `losing_push` is EMA'd off it for morale.
   Honest as a measurement but the one place a unit-level position is held by law.
7. **IMPALE magic coefficients** — `combat.rs:427,476,488`: `planted²·hedge·8.0`,
   `(reach-1)/2.2`, bleed `.min(0.45)`/`.min(0.85)`. Downstream of real quantities
   but the bare literals + the `.min()` caps (formula-misbehaviour guards) say it
   isn't quite physical. Move to tunables at least; ideally derive.

## Confirmed NOT shortcuts (the good versions)
Facing deadzone + sticky target + EMA pressure (the jitter fix), Jacobi staging
(M-equivariance), `m_eff_dir` directional brace (keys off stable unit facing +
geometry), `nearest_enemy`/`mark_at_ease` shared edge-distance snapshot (the
canonical "is the enemy near" — counter-example to finding #3).
