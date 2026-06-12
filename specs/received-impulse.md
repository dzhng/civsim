# Spec: Received Impulse — one honest quantity for the impact stack

## Goal, in one sentence

Make the separation solver output **received impulse** (momentum actually
transferred through contact, per body, per source) and re-derive knockdown,
collision injury, and momentum-arming from it — so that the damage law can
be universal physics with no charge-state gating, and the "phantom
velocity" class of bug dies permanently.

## Context you don't have (read this; it is the whole reason)

The sim is position-based at a fixed 30 Hz: soldiers steer toward slots,
then `apply_separation` (crates/sim/src/collision.rs) resolves body overlap
by directly displacing positions, mass-weighted (effective mass = class
mass × brace × press_drive chain). It is deterministic, golden-hash pinned
(crates/sim/tests/golden.rs — re-pin deliberately on intentional change).

The collision pass currently infers "velocity" as position deltas:
`vel(i) = (positions − prev_positions) / DT`. That mixes three things:

1. real steering motion,
2. momentum glide (`mom_x/mom_y` — carried charge momentum, a real and
   load-bearing mechanic: it is how charges punch through lines),
3. **separation solver pushes** — constraint resolution, not motion.

Component 3 is the disease, called *phantom velocity* in commit history.
In any packed scrum the solver shoves bodies back and forth a few tenths
of a meter per tick, which reads as 5–9 m/s of oscillating "closing speed"
that carries no kinetic energy. Measured consequences (all reproduced,
2026-06-12, commits `4f94700`..`cb3ebb6`):

- **Scrum chips.** When collision damage was made universal ("anyone
  felled violently gets hurt", quadratic in Δv past a yield threshold —
  the design the product owner actually wants), stun-locked men in
  presses died by a thousand 0.02-damage re-knock cycles. A pike block
  lost 126/300 to phantom chips with zero cavalry on the field.
- **Phantom momentum minting.** The charge-impact code arms carried
  momentum from inferred closing speed; scrum spikes minted momentum in
  ordinary infantry fights, which then dealt yield-exceeding fells.
  An attack-vs-walk control experiment went from parity to 87-vs-9 losses.
- **Commanded-state leakage.** Unit-level `frame_speed` reads commanded
  pace while the anchor law has the unit pinned; intimidation read it and
  units "charging on paper" frightened lines while physically stationary.
  (Already fixed at the unit level via `mass_advance`; the per-soldier
  story is this spec.)

### The failed fixes — do not retry these naively

Each of these was implemented and measured. The evidence is the reason
this spec exists.

1. **Universal Δv damage, linear** (`k×Δv` per fresh knockdown): scrum
   chips, above.
2. **Yield threshold** (`k×(Δv²−100)⁺`): re-knock cycles in sustained
   presses still accumulate — pressed bodies and momentum gliders
   genuinely reach Δv 15–20 between phantom spikes.
3. **Carried-momentum gate** (only bodies with `|mom| > 8` deal damage):
   phantom spikes *mint* momentum (see above), so the gate leaked; and a
   braced pike wall carries no momentum, so chargers stopped paying the
   wall-slam toll (a designed cost).
4. **Honest kinematic velocity** (record steering+momentum velocity
   before separation; collisions read that): the *correct idea aimed at
   the wrong layer*. It fixed the phantom inputs and simultaneously broke
   `units must meet as fronts, not pass through`, the deep-column bog
   (ram drag), and AI battles — because crowd-mediated displacement is
   the sim's de-facto proxy for **contact force**. The phantom component
   is doing load-bearing work; you cannot delete it, you must replace it
   with the real quantity.
5. **Where it landed (current bridge, commit `cb3ebb6`)**: damage =
   `impact_damage × knockback_mult(feller's class) × Δv`, gated on a
   fresh knockdown AND a *measured charge state* on either side
   (`unit.charging || unit.charge_time > 0`). It is green and calibrated,
   and it is a compromise: the gate means a unit that is not mid-charge
   can never hurt what it fells, and the universal law the owner wants
   ("anyone knocked back violently gets damaged") is not expressible.

### Why impulse is the right quantity

Knockdowns and injuries are caused by momentum transfer through contact —
impulse. The solver *already computes* the per-pair overlap resolution
(`share`-weighted displacement) and even accumulates per-body push EMAs
(`pressure`, `press_x/press_y`, fed from `raw_x/raw_y/raw_mag`). What it
throws away is the per-pair, per-tick attribution. Received impulse:

- is a real physical quantity (no phantom: a sustained press transfers
  real momentum slowly; a charge impact transfers it in a spike),
- distinguishes spike from squeeze by its time profile, not by inference,
- gives source attribution for free (whose body delivered it — needed for
  team gating and per-class intent like `knockback_mult`),
- makes the universal damage law safe: scrum impulse per tick is small by
  construction; only true impacts spike.

## The design

### 1. Compute it

In the pair loop of `apply_separation`, the displacement applied to body
`i` from pair `(i,j)` is already known before it is folded into `scratch`.
Define per-pair impulse on `i`:

```
J_ij = m_eff(i) × |Δx_ij| / DT      // momentum delivered to i this tick
```

(Use effective mass — brace and backing genuinely absorb; this is why a
pike wall keeps its feet AND its bones, which is a designed outcome.)

Accumulate per body, per tick:
- `imp_spike[i]`: the **largest single enemy-pair impulse** this tick,
  with its source body `j` (unit, class). Friendly pairs excluded.
- The existing `pressure` EMA stays as-is (it is the squeeze; morale and
  evade already read it).

Do not allocate per-pair storage; track the running max + argmax inline.

### 2. Spend it

Replace the three velocity-inferred mechanisms in the charge-impact block:

- **Knockdown (stun)**: fells when `imp_spike[i]` exceeds a threshold
  scaled the way `stun_momentum × w_i` is today. Calibrate so today's
  outcomes hold (charging horse fells loose men; braced+backed pikes keep
  their feet; charging infantry bowls unbraced men).
- **Injury**: on a *fresh* knockdown only (`stun[i] ≤ 0` at the moment of
  felling — the impulse-spike event, not per-tick),
  `damage = k × (imp_spike[i]/m_i)² beyond yield × knockback_mult(source class)`
  — quadratic in the throw, per the owner's "kinetic energy" framing, but
  computed from delivered impulse so scrums sit under yield *physically*
  rather than by gate. **Goal: delete the `real_charge` gate entirely.**
  Keep `knockback_mult` — it is intent data, not a gate (foot 0.35: a
  charging mass of men hurts; shock horse 1.0; light horse 0.5 "picks its
  way through"; a future chariot ≈ all of its lethality here).
- **Momentum arming**: arm `mom_x/mom_y` from received enemy impulse
  direction and magnitude instead of inferred closing speed (cap by the
  true approach as today: "never exceeds what the approach physically
  justifies"). This kills phantom minting at the source.

### 3. What must NOT change

- `tramples` stays pure behavior (keep riding through contact).
- The momentum-glide system (`mom_*`), charge exits on `mass_advance`,
  brace, press_drive chains: untouched. Another session owns charge
  dynamics — coordinate if you find yourself editing
  `charge_time`/`mass_advance` semantics.
- The morale layer is already physical (mass ratios, `mass_advance`,
  habituation); do not feed it new inputs in this change.

## Contracts (the tests are the spec)

Run `cargo test -p sim` (~25 s; `--no-fail-fast`, check the exit code, not
the output). All of these must hold, by re-derivation not by gate:

| Contract | Test |
|---|---|
| 400 shock cav, 4 deep, through 200 light foot 2 deep ≈ half dead in the impact window (band 70–130) | `class_scenarios::a_frontal_charge_through_a_thin_line_is_a_bloodbath` |
| Light horse ≈ half the butchery at equal charge posture (ratio 0.3–0.7) | `class_scenarios::light_horse_tramples_at_half_the_butchery` |
| A 20-rank braced column bogs the gallop (riders inside, `mass_advance < 3`) | `class_scenarios::move_order_into_a_deep_braced_column_bogs_into_melee` |
| Enemy lines meet as fronts, never interpenetrate | `scenarios` / nav suites |
| Pike walls hold and punish; riders reachable by geometry only | `combat_scenarios::deep_pike_wall_*`, `class_scenarios::pikes_unhorse_*`, `combat_scenarios::rider_reachability_is_pure_geometry` |
| Attack ≡ walking in (same physics per contact second) | `combat_scenarios::attack_order_equals_walking_into_contact` |
| Crush registers as pressure; the press is no sanctuary | `combat_scenarios::long_swords_cleave_but_die_in_a_press` |
| Skirmishers kite non-bursting pursuers losing almost nobody | `missile_scenarios` kite tests |
| Mirror-duel pacing: heavy ~4 min / ~66% dead at break; light ~2 min / ~50% | `pacing_scenarios::mirror_duels_are_attrition_grinds` |
| **New (write these)**: an infantry mirror grind for 120 s produces ZERO collision-damage deaths; a braced pike front rank survives a frontal cavalry charge's impact with ≥90% of its men unfelled; a charging (not pursuing) heavy-infantry unit deals measurable knockdown damage | — |

Golden hash will move; re-pin deliberately, once, in the same commit.

## Process requirements (hard-won; see `.claude/skills/write-tests/SKILL.md`)

- **Cargo first**, browser last (`npm run verify` from `web/`, ~75 s,
  needs the dev server). Rebuild wasm before browser checks.
- **Bisect with the constant, check `rc`**: a heredoc that prints "ok"
  followed by a grep that prints nothing looks like success and is a
  compile error.
- **Probes change the physics**: an `eprintln!` in lib hot code — even in
  a dead branch — changes float codegen at `opt-level 2` and flips
  chaos-marginal tests. Instrument from the test side (public state every
  N ticks in a throwaway `tests/dbgN.rs`; delete it after).
- **Expression structure is codegen**: expect 2–4 chaos-marginal tests to
  wobble on ANY collision.rs edit. Re-judge them only on the final shape;
  margins may be widened only with a comment declaring them
  chaos-marginal (anchor tests to design contracts, never re-pin to
  current behavior — that is how the suite once certified a 19× bug).
- **Concurrent sessions are real**: another agent may be editing this
  tree (files changing under you, fields vanishing mid-build). Check
  mtimes/`git status` when something impossible happens; wait for
  quiescence; never `git checkout` over files that may hold someone
  else's uncommitted work.
- Formulas read **men, mass, measured motion** — never banners, commanded
  state, or classifier counts (README, "Formulas read the physical
  world"). Received impulse exists to make this rule cheap to follow.

## Acceptance

1. Full workspace green (`cargo test --workspace`), browser quick suite
   green, golden re-pinned once.
2. The `real_charge` gate in collision damage is **deleted** — the
   universal law holds by physics.
3. The contracts table above, including the three new tests.
4. Net code in the impact block no larger than today's (the gates and
   their comments come out; the impulse tracking goes in).
5. A short postmortem note in this file: measured impulse magnitudes for
   the canonical cases (scrum squeeze, infantry charge, cavalry impact),
   so the next person has the operating points.
