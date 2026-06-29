# Slice 2 — wire `compact_columns` in and gate lateral re-even

## Contract this unlocks

While a unit is **engaged or advancing**, casualty holes close via
`compact_columns` (forward-only) — including deep blocks. The full lateral
re-sort `reassign_slots` is now reachable ONLY by deliberate, not-fighting
events: pivot, `set_files`, corridor `files_eff` narrowing, explicit
`set_reform`/`reseat`, rally, the at-ease recovery drumbeat, and a **new
disengage one-shot** that fires after a short clear beat. This is the slice that
makes the back-line crab stop in the actual game.

## API seam

`crates/sim/src/sim.rs`, the reform drumbeat in `Sim::tick` (`sim.rs:892-948`),
plus the disengage trigger (near `quiet_ticks` upkeep, see `refresh_contact_engagement`
`sim.rs:970` and `quiet_ticks` `unit.rs:127`).

Rework the branch so casualty-closing and lateral-re-even are separate concerns:

```text
casualties_to_close = deaths_since_reform crosses its trigger   (keep today's threshold to start)
engaging_or_forward = engaged > 0 || move_target.is_some() || mode == Attack(_)

if casualties_to_close && engaging_or_forward && !pivoting && files_eff stable:
        compact_columns(...)                 ← forward-only; deep blocks included
        deaths_since_reform = 0

reassign_slots(...) stays the path for, and ONLY for:
   • pivoting (continuous, as today)
   • set_files / corridor files_eff change (sim.rs:748, 1162 — unchanged)
   • set_reform / reseat / rally (sim.rs:780, morale.rs:430 — unchanged)
   • at-ease recovery drumbeat (sim.rs:921-924 — unchanged; a standing,
     unengaged line still evens out)
   • NEW: disengage one-shot — a unit that was fighting, now clear for a
     short beat (quiet_ticks ≥ CLEAR_BEAT), re-evens ONCE, then a guard
     stops it re-firing every tick.
```

- **Remove** the `engaged > 0 && ranks >= 5 && tick%60` `reassign_slots`
  drumbeat (`sim.rs:913-915`) — `compact_columns` is now the anti-pancake flow
  for deep engaged blocks (rear men step forward in-file to refill front losses,
  with no lateral motion).
- **Delete** `compact_slots_preserving_order` (`unit.rs:405`) and its call site
  (`sim.rs:932`). `compact_columns` strictly supersedes it (more lateral-
  preserving). No back-compat shim — pre-release, per the repo rule.
- **Disengage one-shot:** reuse `quiet_ticks`. Fire when it crosses `CLEAR_BEAT`
  (a const to tune — see known unknowns); guard with a one-shot flag (or fire
  exactly on the crossing tick) so it doesn't re-sort every tick a unit idles.
  The existing at-ease drumbeat then owns any further slow recovery.

## What the human can run

- `scripts/test-mechanics` — the physics inner loop (the bucket this change
  lives in).
- A throwaway `tests/dbgN.rs` (per the debug-probe convention) printing, over a
  deep engaged block taking front-rank casualties, the **max lateral displacement
  of rear-rank men** before vs after — expect it to collapse toward the
  push-only floor.
- `scripts/test-infra` for the golden re-pin.

## Tests that pin it

- **Rear-line lateral travel ≈ 0 while engaged** (the headline behaviour;
  promote the dbg probe into a real `mechanics_formation` assertion in slice 3):
  a deep block in a grind, front rank dying, rear men move forward in-file; their
  lateral travel stays at the push-only floor (no relabel crab).
- **Notch persists, then evens on disengage.** Wipe a file mid-fight → the
  frontage gap survives while engaged; after contact ends and `quiet_ticks ≥
  CLEAR_BEAT`, one `reassign_slots` evens the line. (`mechanics_disengage.rs` is
  the right neighbourhood.)
- **Deep block does not pancake.** Front losses are refilled forward; frontage
  width holds (no flank bulge) without any lateral re-form.
- **Golden re-pin.** `golden_state_hash_stable` moves — re-pin ONCE in this
  commit after confirming (diff vs a clean baseline) your change is the sole
  mover. The branch may already have it red for unrelated reasons.

## What must stay green

- `mechanics_weave::{two_braced_walls_*, the_fronts_stay_welded_*,
  a_braced_block_holds_its_grid_under_a_press}` and its wrap/bend probes.
- `mechanics_charge`, `mechanics_impact` — the charge-absorption watch (we no
  longer relabel-to-absorb while engaged; if these go red, the line became too
  rigid under impact — fix the body displacement, not by re-adding lateral
  relabel).
- `mechanics_disengage`, `scenario_posture`, `scenario_ai::reform_recovers_order_faster`,
  `scenario_general` reform/stamina pins.
- Pivot, `set_files`, corridor narrowing still re-even (unchanged call sites).

## Feedback that would change this slice

- If a deep grind visibly lags closing on the 2%-casualty trigger, relax the
  cadence (column closing is cheap and lateral-free — could run per-death).
- If `CLEAR_BEAT` looks too eager/sluggish on screen, retune it; record the
  chosen value and why in the README.
- If charge feel regresses, this is where David decides between accepting a
  stiffer line and reshaping how impact displaces bodies — do NOT silently
  re-introduce lateral relabel while engaged.
