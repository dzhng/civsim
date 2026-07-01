# Impale — a planted point returns the closing victim's own momentum

A body that closes at charge grade onto a presented spear/pike point spends its
own momentum on the point, every tick it is in reach — so a deep pike hedge
stops a cavalry charge at the hedge the way Waterloo squares did, while a sword
wall only tolls the horses that reach it. The per-weapon difference falls out of
**reach and formation depth**, not class gates. Points break the gallop at
reach; blades bog it by body mass.

## The problem it solves

Weapon pushes were pure mass-ratio shoving (`hit_push × (m_att/m_vic)` in
`strike()`). A braced pikeman shoved a horse ~0.17 m per thrust — an order of
magnitude too small to register as a wall. The horse's own closing energy
appeared **nowhere** in the strike, so no tuning of `hit_push` could make a
hedge stop a charge: the physics of "a planted point receiving a charge" (the
energy is the *horse's*, returned by the braced shaft) simply wasn't expressed.
Impale adds that missing term.

## Where it lives

- `crates/sim/src/combat.rs`, the `IMPALE` block in `strike_all` (grep
  `IMPALE — a PRESENTED point`). Runs *before* the swing: presentation is free,
  only thrusting has a cadence. This is the whole mechanism.
- `crates/sim/src/combat.rs::rider_exposure_frontal` — the reach-earned
  rider/mount damage split the charge-impale shares with the standing grind
  (one rule for the front).
- `crates/sim/src/unit.rs::brace` — the depth-backed brace weight `w_i` the stop
  share uses (same weight the knockdown threshold reads).
- `crates/sim/src/class.rs::Weapon::impales` and `Weapon::hedge` — the two
  boolean capabilities that gate the flesh half and the frontage-lock.

The contracts are the spec. All live in `crates/sim/tests/scenario_class.rs`
unless noted:

| Invariant | Test |
|---|---|
| Pike hedge breaks a frontal charge at the hedge (horses may ooze through after impact, but the gallop dies in the first ranks) | `a_pike_hedge_breaks_the_charge_even_if_horses_ooze_through` |
| Deep sword blocks bog by body mass, not pike reach | `eight_ranks_of_swords_bog_the_charge_into_melee` |
| A frontal charge into pikes is no bloodbath (the wall tolls, it doesn't butcher) | `a_frontal_charge_into_pikes_is_no_bloodbath` |
| Thin line still bleeds — impact lands at speed | `a_frontal_charge_through_a_thin_line_is_a_bloodbath` |
| Move-order trample pair (ride-through vs. bog) | `move_order_rides_through_a_thin_line`, `move_order_into_a_deep_braced_column_bogs_into_melee` |
| Dense infantry blunts a charge; loose gets punched through | `dense_infantry_blunts_a_cavalry_charge_loose_gets_punched_through` |
| A grinding press breaks no bones (the term must not tax slow pressers) | `a_grinding_press_breaks_no_bones` |
| Pikes reach riders, swords chip horseflesh | `balance_charge::pikes_reach_riders_swords_chip_at_horseflesh` |

## The reason it takes this shape

**Closing speed must come from `kin_*`, never position deltas.** The victim's
closing is `-(kin_v(victim) · dir)` read from `kin_vx/kin_vy` (measured,
pre-solver kinematic velocity). Reading it from position deltas would reopen the
phantom-velocity door the README's hard rule closes.

**Reach is the honest differentiator — but only for magnitude.** A pole braces
to grip, rear hand, and ground; a sword meeting a horse chest absorbs and
deflects. So the stop scales with `planted = ((reach - 1) / 2.2).clamp(0,1)`,
squared (per-point leverage goes as reach²). No scaling *number* was added to
the weapon table for this — reach already carried it.

**Depth is load-bearing, not a nice-to-have.** A single presented point pricks;
a wall points-deep stops. The stop multiplies by a `hedge` factor
(`ranks / reach_ranks`, clamped to 1): a sarissa block projects ~3 ranks of
points and walls horse, a 2-deep pike file merely pricks it, and a short spear
can never build a hedge its reach can't reach. This is what makes the sword-vs-
pike and shallow-vs-deep contracts separate cleanly. It began as a "maybe" and
became structural — see dead ends.

**The frontage lock.** A grounded hedge point aims along the *unit's* facing and
only bears on its forward cone (`hedge_bears = aim ≤ 1.25`); flanked or charged
from the rear, the man drops to his side-arm and the impale does not fire. The
charge-stopping cone is deliberately broader than the thrust's damage arc so
adjacent points overlap into a continuous wall.

## Principles & invariants

- **The stop reads measured motion.** `closing` comes from `kin_*`. If a future
  edit sources it from positions, the phantom-velocity disease returns through
  this door.
- **It is self-gating to charge grade.** Men below `charge_min_speed` pay
  nothing (protects `a_grinding_press_breaks_no_bones` and the deep-pike-vs-
  infantry contracts). A trampling body is gated far lower (`> 0.5`) — a horse
  has no shield to put between itself and a pike, so it feeds itself onto the
  point at any speed.
- **No impenetrable wall, only a toll.** The flesh half is capped
  (`rider_exposure_frontal` never yields a guaranteed rider hit; the grip is
  `.min(0.45)`). Lead horses that die open a gap the ranks behind charge into —
  a determined, deep-enough charge still breaks through. A test that demands a
  hedge *never* be crossed is over-fitting and must be rejected.
- **Difference by reach + depth, not class.** The only booleans are `impales`
  (a capability: a spear has a point to run onto, a sword does not) and `hedge`
  (a wielding mode). Neither is a per-class special case, and neither carries a
  magnitude — all magnitude is reach and formation geometry.
- **Golden hash moves when this term is touched.** Re-pin deliberately, once,
  in the same commit; never chase marginal-chaos test wobble by re-pinning to
  current behavior.

## Divergences from the original plan

The plan predicted a clean push-only term routed through the press ledger. What
shipped is meaningfully different — record these, they're what a reader would
otherwise re-derive:

- **The brake does *not* go through `recv_*` / `counter_press` / ram-drag.** The
  plan's core theory was: post the stop to the received-push ledger so it feeds
  `counter_press`, which the ram-drag reads to brake the *unit's* drive at the
  hedge before bodies meet. That chain was abandoned. The impale instead brakes
  each closing body directly — it moves the victim back along his own approach
  and bleeds his carried momentum `mom_*` with a capped grip. No `recv_*` post
  happens in the impale block. So the operating point the plan asked to measure
  (unit-mean `counter_press` before/after) is moot: `counter_press` is no longer
  the mechanism.
- **A flesh-damage half was added.** The plan was a pure stopping *push*.
  Shipped also deals charge-driven damage when `weapon.impales && victim
  tramples()` — the horse pays in flesh as well as momentum, split rider/mount
  by `rider_exposure_frontal`. "The horse impales itself" became literal blood,
  not just a shove. This is what actually satisfies the toll contracts.
- **A boolean weapon capability `impales` was added**, against the plan's
  "the five weapon numbers stay five." It is documented as an orthogonal
  *capability*, not a scaling number and not a wielding mode: a Standard spear
  impales without being a hedge; a sword does not impale at all. Reach-scaling
  alone could not zero a blade's flesh half cleanly without threatening the
  sword-toll contract, so the clean separation is a capability gate; the
  *magnitude* still rides entirely on reach.
- **The empirical scalars.** `× 8.0` on the stop and `× 6.0` on the damage are
  tuned constants, not derived — the term was calibrated to the contracts, not
  to first principles.
- **Test file renamed.** The plan named `class_scenarios.rs` /
  `combat_scenarios.rs`; the suite convention flipped to `scenario_class.rs` /
  `scenario_combat.rs`. Stale `class_scenarios` comments still linger in a few
  unrelated test files.

## Dead ends

- **Push through the press ledger (the plan's own design).** Posting the stop to
  `recv_*` and relying on the ram-drag to brake the unit never delivered: the
  ram-drag reads *unit-mean* `counter_press`, and a hedge brakes only its front
  rank, so front-loaded resistance was diluted ~5× by the mean and never cleared
  the drag gate. Replaced by direct per-body position + momentum braking.
- **Brace-only scaling with no reach term.** Rejected on measurement: braced
  sword heavies would stop horses, breaking the locked sword-toll contract.
- **Uncapped impale.** The first cut backfired — it flipped cav-vs-phalanx from
  the intended draw into a *cavalry win* by over-killing, then over-stopping;
  the term had to be capped (grip `.min(0.45)`, the `rider_exposure` cap) to
  become a toll rather than a wall. The whole cluster rode `#[ignore]` (task #66)
  while this was chased, then was un-ignored once the contracts held.
- **A sixth weapon *number* (`planted:`).** Never needed — reach + the `hedge`
  depth factor separated the regimes without it. The only additions were the two
  booleans above.

No visual provenance: this is a pure-sim spec with no baseline imagery.
